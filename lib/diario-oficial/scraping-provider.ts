import * as cheerio from "cheerio"
import { withBrowserSession } from "./browser"
import type { DiarioOficialProvider, PublicacionRaw, SearchCriteria, SearchResult } from "./types"

const BASE_URL = "https://www.diariooficial.interior.gob.cl"
const SUMARIO_PATH = "/edicionelectronica/index.php"
const NORMAS_PARTICULARES_PATH = "/edicionelectronica/normas_particulares.php"

// Coincide con expedientes DGA del tipo PT-0703-278, ND-1234-56, CS1234-78, etc.
const EXPEDIENTE_REGEX = /\b[A-Z]{2,4}[-\s]?\d{3,5}[-\s]?\d{1,5}\b/
// RUT chileno con o sin puntos, con guión y dígito verificador (incluye K).
const RUT_REGEX = /\b\d{1,2}(?:\.?\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/
// "N° 2083", "Nº 2.083", "número 2083"
const RESOLUCION_REGEX = /(?:N[°º]|[Nn]úmero)\s*:?\s*([\d.]{2,10})/

/**
 * Patrones de clasificación de la publicación como una solicitud de derechos de agua de la DGA.
 * Se separan en capas porque el sumario del Diario Oficial no siempre expone la clasificación
 * ministerio/organismo/categoría como metadato estructurado: cuando no está disponible en el
 * HTML (fila de encabezado "Dirección General de Aguas" arriba de la publicación), se recurre al
 * texto del título/extracto como respaldo.
 */
const MOP_REGEX = /Ministerio\s+de\s+Obras\s+P[uú]blicas/i
const DGA_REGEX = /Direcci[oó]n\s+General\s+de\s+Aguas/i
const CATEGORIA_SOLICITUDES_REGEX = /Solicitudes?\s+de\s+[Dd]erechos?\s+de\s+Aguas/i
const APROVECHAMIENTO_REGEX = /[Dd]erechos?\s+de\s+aprovechamiento\s+de\s+aguas/i
const SOLICITUD_TITULO_REGEX = /^solicitud(?:es)?\b/i

const REGION_REGEX = /Regi[oó]n\s+(?:de\s+|del\s+)?([^,.;]+)/i
const PROVINCIA_REGEX = /provincia\s+de\s+([^,.;]+)/i
const COMUNA_REGEX = /comuna\s+de\s+([^,.;]+)/i
const FUENTE_AGUA_TIPO_REGEX = /aguas?\s+(subterr[aá]neas?|superficiales?)/i
const FUENTE_AGUA_CUERPO_REGEX = /\b(r[ií]o|estero|vertiente|pozo|napa|canal|laguna)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ'’.\s]{2,40}?)(?=[,.;]| en | ubicad| desde | ,)/i
const CAUDAL_REGEX = /caudal\s+m[aá]ximo\s+(?:anual\s+)?de\s+([\d.,]+)\s*(l\/s|lps|m3\/s|l\s*\/\s*s)/i
const TIPO_SOLICITUD_REGEX =
  /(concesi[oó]n|solicitud)\s+de\s+aprovechamiento\s+de\s+aguas[^,.;]*(?:para\s+[^,.;]+)?/i

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

/**
 * Clasifica una publicación según la regla del proyecto: Ministerio de Obras Públicas →
 * Dirección General de Aguas → Solicitudes de Derechos de Aguas. No basta con que el texto
 * mencione "Dirección General de Aguas" (eso también aparece en resoluciones, decretos y
 * nombramientos del organismo); se exige además la categoría de solicitudes de derechos o, en su
 * defecto, el patrón textual de una solicitud de aprovechamiento de aguas.
 */
function clasificarPublicacionDga(
  organismo: string | null,
  seccion: string | null,
  titulo: string,
): { ministerio: string | null; categoria: string | null; esCandidataDga: boolean } {
  const haystack = `${organismo ?? ""} ${seccion ?? ""} ${titulo}`
  const esDga = DGA_REGEX.test(haystack)
  const esMop = esDga || MOP_REGEX.test(haystack)
  const esCategoriaSolicitudes =
    CATEGORIA_SOLICITUDES_REGEX.test(haystack) ||
    (esDga && (APROVECHAMIENTO_REGEX.test(titulo) || SOLICITUD_TITULO_REGEX.test(titulo.trim())))

  return {
    ministerio: esMop ? "Ministerio de Obras Públicas" : null,
    categoria: esCategoriaSolicitudes ? "Solicitudes de Derechos de Aguas" : null,
    esCandidataDga: esDga && esCategoriaSolicitudes,
  }
}

function extractUbicacion(texto: string): { region: string | null; provincia: string | null; comuna: string | null } {
  const region = texto.match(REGION_REGEX)?.[1]?.trim() ?? null
  const provincia = texto.match(PROVINCIA_REGEX)?.[1]?.trim() ?? null
  const comuna = texto.match(COMUNA_REGEX)?.[1]?.trim() ?? null
  return { region, provincia, comuna }
}

function extractFuenteAgua(texto: string): string | null {
  const cuerpo = texto.match(FUENTE_AGUA_CUERPO_REGEX)
  if (cuerpo) return `${cuerpo[1]} ${cuerpo[2]}`.trim()
  const tipo = texto.match(FUENTE_AGUA_TIPO_REGEX)
  if (tipo) return `aguas ${tipo[1]}`.trim()
  return null
}

function extractCaudal(texto: string): string | null {
  const match = texto.match(CAUDAL_REGEX)
  if (!match) return null
  const unidad = /^lps$|^l\s*\/\s*s$/i.test(match[2]) ? "l/s" : match[2].toLowerCase()
  return `${match[1]} ${unidad}`
}

function extractTipoSolicitud(texto: string): string | null {
  const match = texto.match(TIPO_SOLICITUD_REGEX)
  return match ? match[0].trim() : null
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

/**
 * Error dedicado para cuando el HTML del sumario no tiene la estructura esperada (ej. el sitio
 * cambió de plantilla). Se distingue de "no hay publicaciones ese día" a propósito: el llamador
 * debe registrar esto como ERROR DE CONSULTA y nunca interpretar la ausencia de resultados como
 * evidencia de que los expedientes de esa fecha no se publicaron.
 */
export class DiarioOficialStructureError extends Error {}

function parseSumarioHtml(
  html: string,
  fecha: string,
  url: string,
  seccionPorDefecto: string,
): PublicacionRaw[] {
  const $ = cheerio.load(html)

  // Capa de robustez: si no hay ninguna tabla reconocible en una página que sí cargó, lo más
  // probable es que el sitio cambió de estructura y no que el día no tuvo sumario. El llamador
  // decide qué hacer (reintentar, marcar error), pero este módulo nunca debe devolver "0
  // publicaciones" en silencio ante un HTML irreconocible.
  if ($("table").length === 0 && html.length > 500) {
    throw new DiarioOficialStructureError(
      `No se encontró la tabla del sumario en ${url}. La estructura del Diario Oficial pudo haber cambiado.`,
    )
  }

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
      // Fila de encabezado de sección u organismo (sin link de PDF). Capa 1 de búsqueda: usar
      // estos encabezados estructurales ("Dirección General de Aguas") en vez de depender solo
      // del texto de cada publicación individual.
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

    // Capa 2 de búsqueda: si el encabezado estructural no clasificó la publicación, se recurre al
    // texto del título/extracto para los patrones de "Dirección General de Aguas", "Solicitudes
    // de Derechos de Aguas" y "Derechos de aprovechamiento de aguas".
    const clasificacion = clasificarPublicacionDga(organismoActual, seccionActual, titulo)
    const ubicacion = extractUbicacion(titulo)

    publicaciones.push({
      cve: cveMatch[1],
      titulo,
      materia: titulo,
      extracto: titulo,
      url,
      pdfUrl: href ? resolveUrl(href) : null,
      ministerio: clasificacion.ministerio,
      organismo: organismoActual,
      categoria: clasificacion.categoria,
      esCandidataDga: clasificacion.esCandidataDga,
      seccion: seccionActual,
      region: ubicacion.region,
      provincia: ubicacion.provincia,
      comuna: ubicacion.comuna,
      tipoSolicitud: extractTipoSolicitud(titulo),
      fuenteAgua: extractFuenteAgua(titulo),
      caudal: extractCaudal(titulo),
      coordenadas: null,
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
  // leyes, resoluciones de alcance general, Sección I) y "Normas Particulares"
  // (solicitudes individuales, Sección II —donde viven las solicitudes de derechos
  // de aprovechamiento de aguas de la DGA—). La segunda requiere el número de
  // edición y las cookies de sesión obtenidas al visitar la primera, así que ambas
  // se navegan dentro del mismo contexto.
  return withBrowserSession(async (nav) => {
    const generalHtml = await nav(generalUrl)
    const publicaciones = parseSumarioHtml(generalHtml, fecha, generalUrl, "Normas Generales")

    const edicion = extractEdicion(generalHtml)
    if (edicion) {
      const particularesUrl = `${BASE_URL}${NORMAS_PARTICULARES_PATH}?date=${dateParam}&edition=${edicion}`
      // Sección II: prioridad para las solicitudes de derechos de aguas de la DGA. Un fallo aquí
      // se deja propagar (no se traga el error) para que search() lo cuente como ERROR DE
      // CONSULTA en vez de asumir silenciosamente que ese día no tuvo normas particulares.
      const particularesHtml = await nav(particularesUrl)
      publicaciones.push(...parseSumarioHtml(particularesHtml, fecha, particularesUrl, "Normas Particulares"))
    }

    return publicaciones
  })
}

export class ScrapingDiarioOficialProvider implements DiarioOficialProvider {
  async getEditions(fecha: string): Promise<PublicacionRaw[]> {
    return fetchSumario(fecha)
  }

  async search(criteria: SearchCriteria): Promise<SearchResult> {
    const dates = enumerateDates(criteria.desde, criteria.hasta)
    const publicaciones: PublicacionRaw[] = []
    const fechasConError: string[] = []

    // En este entorno el proceso de Chromium a veces se cierra solo justo después de
    // lanzarse (antes de poder navegar), independiente de si es una instancia nueva.
    // Un reintento con otro navegador nuevo recupera la fecha en la mayoría de los
    // casos. Una pequeña pausa entre fechas evita lanzar muchos Chromium de golpe y
    // disparar el límite de tasa del desafío anti-bot del sitio (que responde con la
    // conexión cortada, ERR_EMPTY_RESPONSE, si lo saturamos).
    const MAX_INTENTOS = 3
    for (const fecha of dates) {
      let ultimoError: unknown
      for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
          const publicacionesDelDia = await fetchSumario(fecha)
          publicaciones.push(...publicacionesDelDia)
          ultimoError = null
          break
        } catch (error) {
          ultimoError = error
          console.error(`[v0] Error obteniendo sumario del ${fecha} (intento ${intento}/${MAX_INTENTOS}):`, error)
          if (intento < MAX_INTENTOS) {
            await new Promise((resolve) => setTimeout(resolve, 1500 * intento))
          }
        }
      }
      if (ultimoError) {
        // Error de consulta: esta fecha NO debe tratarse como "sin publicaciones". Se registra
        // por separado para que el llamador pueda avisar y reintentar, en vez de dejar que los
        // expedientes queden marcados como NO ENCONTRADA por una fecha que en realidad falló.
        console.error(`[v0] Se agotaron los reintentos para el ${fecha}, se marca como ERROR DE CONSULTA.`)
        fechasConError.push(fecha)
      }
      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    if (!criteria.texto) return { publicaciones, fechasConError }

    const texto = criteria.texto.toUpperCase()
    return {
      publicaciones: publicaciones.filter((p) => p.titulo.toUpperCase().includes(texto)),
      fechasConError,
    }
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
