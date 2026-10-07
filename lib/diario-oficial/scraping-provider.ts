import * as cheerio from "cheerio"
import type { DiarioOficialProvider, PublicacionRaw, SearchCriteria } from "./types"

const BASE_URL = "https://www.diariooficial.interior.gob.cl"
const SUMARIO_PATH = "/edicionelectronica/index.php"

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

/** Extrae un nombre de solicitante a partir de frases comunes "...presentada por X", "...de X." */
function extractNombreInteresado(texto: string): string | null {
  const patterns = [/presentad[ao]\s+por\s+([^.;,]+)/i, /solicitud\s+de\s+([^.;,]+)/i, /a\s+favor\s+de\s+([^.;,]+)/i]
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

async function fetchSumario(fecha: string): Promise<PublicacionRaw[]> {
  const url = `${BASE_URL}${SUMARIO_PATH}?date=${formatDateForSite(fecha)}`
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SistemaDGA/1.0)" },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`Diario Oficial respondió ${response.status} para la fecha ${fecha}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)
  const publicaciones: PublicacionRaw[] = []

  let seccionActual = "Normas Generales"
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
