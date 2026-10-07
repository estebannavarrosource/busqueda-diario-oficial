import * as cheerio from "cheerio"
import { withBrowserSession } from "./browser"
import type { DiarioOficialProvider, PublicacionRaw, SearchCriteria } from "./types"

const BASE_URL = "https://www.diariooficial.interior.gob.cl"
const SUMARIO_PATH = "/edicionelectronica/index.php"
const NORMAS_PARTICULARES_PATH = "/edicionelectronica/normas_particulares.php"

// Coincide con expedientes DGA del tipo PT-0703-278, ND-1234-56, CS1234-78, etc.
const EXPEDIENTE_REGEX = /\b[A-Z]{2,4}[-\s]?\d{3,5}[-\s]?\d{1,5}\b/
// RUT chileno con o sin puntos, con guión y dígito verificador (incluye K).
const RUT_REGEX = /\b\d{1,2}(?:\.?\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/
// "N° 2083", "Nº 2.083", "número 2083"
const RESOLUCION_REGEX = /(?:N[°º]|[Nn]úmero)\s*:?\s*([\d.]{2,10})/

function formatDateForSite(fecha: string): string {
  const [year, month, day] = fecha.split("-")
  return `${day}-${month}-${year}`
}

function extractExpediente(texto: string): string | null {
  const match = texto.match(EXPEDIENTE_REGEX)
  return match ? match[0] : null
}

function extractRut(texto: string): string | null {
  const match = texto.match(RUT_REGEX)
  return match ? match[0] : null
}

function extractResolucion(texto: string): string | null {
  const match = texto.match(RESOLUCION_REGEX)
  return match ? match[1].replace(/\./g, "") : null
}

/**
 * Extrae un nombre de solicitante a partir de frases comunes "...presentada por X", "...de X."
 * En Normas Particulares (ej. solicitudes de derechos de agua de la DGA), el título del
 * sumario suele ser directamente "Solicitud <Nombre Apellido>" sin esas frases, de ahí el
 * patrón final que toma el resto del título tras la palabra "Solicitud".
 */
function extractNombreInteresado(texto: string): string | null {
  const patterns = [
    /presentad[ao]\s+por\s+([^.;,]+)/i,
    /solicitud\s+de\s+([^.;,]+)/i,
    /a\s+favor\s+de\s+([^.;,]+)/i,
    /^solicitud(?:es)?\s+([^.;,]+)/i,
  ]
  for (const pattern of patterns) {
    const match = texto.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

function resolveUrl(href: string): string {
  if (href.startsWith("http")) return href
  return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`
}

/** Extrae el número de edición (ej. "44.563" -> "44563") desde el HTML del sumario. */
function extractEdicion(html: string): string | null {
  const match = html.match(/N[úu]m\.?\s*([\d.]{3,10})/)
  return match ? match[1].replace(/\./g, "") : null
}

function parseSumarioHtml(
  html: string,
  fecha: string,
  url: string,
  seccionPorDefecto: string,
): PublicacionRaw[] {
  const $ = cheerio.load(html)
  const publicaciones: PublicacionRaw[] = []

  let seccionActual = seccionPorDefecto
  let organismoActual: string | null = null

  $("table tr").each((_, row) => {
    const $row = $(row)
    const rowText = $row.text().replace(/\s+/g, " ").trim()
    if (!rowText) return

    const pdfLink = $row.find('a:contains("Ver PDF")').first()
    const cveMatch = rowText.match(/CVE[-\s]?(\d+)/i)

    if (!pdfLink.length || !cveMatch) {
      // Fila de encabezado de sección u organismo (sin link de PDF).
      if (/NORMAS GENERALES|NORMAS PARTICULARES/i.test(rowText)) {
        seccionActual = rowText
      } else if (rowText.length > 0 && rowText.length < 200) {
        organismoActual = rowText
      }
      return
    }

    const titulo = rowText
      .replace(/Ver PDF\s*\(CVE[-\s]?\d+\)/i, "")
      .trim()
    const href = pdfLink.attr("href") ?? ""

    publicaciones.push({
      cve: cveMatch[1],
      titulo,
      materia: titulo,
      url,
      pdfUrl: href ? resolveUrl(href) : null,
      organismo: organismoActual,
      seccion: seccionActual,
      fechaPublicacion: fecha,
      numeroEdicion: null,
      numeroResolucion: extractResolucion(titulo),
      numeroExpedienteDetectado: extractExpediente(titulo),
      rutDetectado: extractRut(titulo),
      nombreInteresadoDetectado: extractNombreInteresado(titulo),
    })
  })

  return publicaciones
}

async function fetchSumario(fecha: string): Promise<PublicacionRaw[]> {
  const dateParam = formatDateForSite(fecha)
  const generalUrl = `${BASE_URL}${SUMARIO_PATH}?date=${dateParam}`

  // Un fetch de servidor simple recibe la página del desafío anti-bot del sitio
  // (cookies "TS") en vez del sumario real. Se usa un navegador headless que
  // ejecuta el JavaScript del desafío y entrega el HTML ya renderizado.
  //
  // El sumario se divide en dos páginas separadas: "Normas Generales" (decretos,
  // leyes, resoluciones de alcance general) y "Normas Particulares" (solicitudes
  // individuales, como las de derechos de aprovechamiento de aguas de la DGA).
  // La segunda requiere el número de edición y las cookies de sesión obtenidas al
  // visitar la primera, así que ambas se navegan dentro del mismo contexto.
  return withBrowserSession(async (nav) => {
    const generalHtml = await nav(generalUrl)
    const publicaciones = parseSumarioHtml(generalHtml, fecha, generalUrl, "Normas Generales")

    const edicion = extractEdicion(generalHtml)
    if (edicion) {
      const particularesUrl = `${BASE_URL}${NORMAS_PARTICULARES_PATH}?date=${dateParam}&edition=${edicion}`
      try {
        const particularesHtml = await nav(particularesUrl)
        publicaciones.push(...parseSumarioHtml(particularesHtml, fecha, particularesUrl, "Normas Particulares"))
      } catch (error) {
        console.error(`[v0] Error obteniendo Normas Particulares del ${fecha}:`, error)
      }
    }

    return publicaciones
  })
}

export class ScrapingDiarioOficialProvider implements DiarioOficialProvider {
  async getEditions(fecha: string): Promise<PublicacionRaw[]> {
    return fetchSumario(fecha)
  }

  async search(criteria: SearchCriteria): Promise<PublicacionRaw[]> {
    const dates = enumerateDates(criteria.desde, criteria.hasta)
    const results: PublicacionRaw[] = []

    for (const fecha of dates) {
      try {
        const publicaciones = await fetchSumario(fecha)
        results.push(...publicaciones)
      } catch (error) {
        console.error(`[v0] Error obteniendo sumario del ${fecha}:`, error)
      }
    }

    if (!criteria.texto) return results

    const texto = criteria.texto.toUpperCase()
    return results.filter((p) => p.titulo.toUpperCase().includes(texto))
  }
}

function enumerateDates(desde: string, hasta: string): string[] {
  const dates: string[] = []
  const current = new Date(`${desde}T00:00:00Z`)
  const end = new Date(`${hasta}T00:00:00Z`)

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

export const diarioOficialProvider: DiarioOficialProvider = new ScrapingDiarioOficialProvider()
