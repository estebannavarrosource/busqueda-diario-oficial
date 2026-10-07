import { normalizeExpediente, normalizeNombre, normalizeResolucion, normalizeRut, similitudNombres } from "./normalize"

export interface ExpedienteForMatching {
  id: number
  numeroExpedienteNormalizado: string
  solicitanteNormalizado: string | null
  rutNormalizado: string | null
  comuna?: string | null
  fuenteAgua?: string | null
}

export interface PublicacionForMatching {
  id: number
  texto: string | null
  titulo: string | null
  materia: string | null
  numeroExpedienteDetectado: string | null
  rutDetectado: string | null
  nombreInteresadoDetectado: string | null
  numeroResolucion: string | null
  comuna?: string | null
  fuenteAgua?: string | null
}

export type Clasificacion = "confirmada" | "probable" | "posible" | "sin_coincidencia"

export interface MatchResult {
  score: number
  coincidenciaExpediente: boolean
  coincidenciaRut: boolean
  similitudNombre: number
  coincidenciaResolucion: boolean
  coincidenciaComuna: boolean
  coincidenciaFuenteAgua: boolean
  clasificacion: Clasificacion
  motivos: string[]
}

function normalizeComuna(value: string | null | undefined): string {
  return normalizeNombre(value)
}

function normalizeFuenteAgua(value: string | null | undefined): string {
  return normalizeNombre(value)
}

/**
 * Calcula el score de coincidencia entre un expediente DGA y una publicación del Diario Oficial.
 * La coincidencia no depende únicamente del nombre del solicitante: combina identificadores
 * exactos (expediente, RUT, resolución) con señales de ubicación y características de la
 * solicitud (comuna, fuente de agua) y con la similitud de nombre, siguiendo los niveles de
 * confianza del criterio del proyecto:
 *  - Alta:  RUT + comuna + expediente (o características del derecho)
 *  - Media: nombre + comuna + fuente de agua
 *  - Baja:  únicamente similitud textual del nombre
 *
 * Pesos:
 *  - Expediente exacto: +50
 *  - RUT exacto: +25
 *  - Comuna exacta: +15
 *  - Fuente de agua coincidente: +8
 *  - Nombre con similitud >90%: +10 / >70%: +6 / >50%: +3
 *  - N° de resolución conocido y coincidente: +20 (bonus)
 *  - Máximo 100 puntos. Un expediente exacto siempre tiene prioridad especial.
 */
export function calcularCoincidencia(
  expediente: ExpedienteForMatching,
  publicacion: PublicacionForMatching,
  resolucionEsperada?: string | null,
): MatchResult {
  const motivos: string[] = []
  let score = 0

  const haystack = normalizeExpediente(
    [publicacion.texto, publicacion.titulo, publicacion.materia, publicacion.numeroExpedienteDetectado].join(" "),
  )

  const coincidenciaExpediente =
    expediente.numeroExpedienteNormalizado.length > 0 && haystack.includes(expediente.numeroExpedienteNormalizado)

  if (coincidenciaExpediente) {
    score += 50
    motivos.push("Expediente exacto encontrado: sí")
  } else {
    motivos.push("Expediente exacto encontrado: no")
  }

  const rutPublicacion = normalizeRut(publicacion.rutDetectado)
  const coincidenciaRut = Boolean(
    expediente.rutNormalizado && rutPublicacion && expediente.rutNormalizado === rutPublicacion,
  )
  if (coincidenciaRut) {
    score += 25
    motivos.push("RUT exacto: sí")
  } else if (expediente.rutNormalizado) {
    motivos.push("RUT exacto: no")
  }

  const comunaExpediente = normalizeComuna(expediente.comuna)
  const comunaPublicacion = normalizeComuna(publicacion.comuna)
  const coincidenciaComuna = Boolean(comunaExpediente && comunaPublicacion && comunaExpediente === comunaPublicacion)
  if (coincidenciaComuna) {
    score += 15
    motivos.push("Comuna coincidente: sí")
  } else if (comunaExpediente && comunaPublicacion) {
    motivos.push("Comuna coincidente: no")
  }

  const fuenteExpediente = normalizeFuenteAgua(expediente.fuenteAgua)
  const fuentePublicacion = normalizeFuenteAgua(publicacion.fuenteAgua)
  const coincidenciaFuenteAgua = Boolean(
    fuenteExpediente && fuentePublicacion && (fuenteExpediente.includes(fuentePublicacion) || fuentePublicacion.includes(fuenteExpediente)),
  )
  if (coincidenciaFuenteAgua) {
    score += 8
    motivos.push("Fuente de agua coincidente: sí")
  } else if (fuenteExpediente && fuentePublicacion) {
    motivos.push("Fuente de agua coincidente: no")
  }

  const nombrePublicacion = normalizeNombre(publicacion.nombreInteresadoDetectado ?? publicacion.titulo)
  const similitudNombre = expediente.solicitanteNormalizado
    ? similitudNombres(expediente.solicitanteNormalizado, nombrePublicacion)
    : 0
  if (expediente.solicitanteNormalizado) {
    if (similitudNombre > 90) score += 10
    else if (similitudNombre > 70) score += 6
    else if (similitudNombre > 50) score += 3
    motivos.push(`Nombre similar: ${similitudNombre}%`)
  }

  const coincidenciaResolucion = Boolean(
    resolucionEsperada &&
      publicacion.numeroResolucion &&
      normalizeResolucion(resolucionEsperada) === normalizeResolucion(publicacion.numeroResolucion),
  )
  if (coincidenciaResolucion) {
    score += 20
    motivos.push("N° resolución coincidente: sí")
  }

  score = Math.min(score, 100)

  // Umbrales: alta confianza (ej. RUT+comuna+expediente) >= 90 confirma la publicación. Media
  // confianza (ej. nombre+comuna+fuente) cae en el rango probable. Baja confianza (únicamente
  // similitud de nombre) sigue generando una posible coincidencia que requiere revisión humana,
  // en vez de descartarse silenciosamente como "no encontrada".
  let clasificacion: Clasificacion
  if (score >= 90) clasificacion = "confirmada"
  else if (score >= 30) clasificacion = "probable"
  else if (score >= 8) clasificacion = "posible"
  else clasificacion = "sin_coincidencia"

  // Un expediente exacto siempre tiene prioridad especial, incluso si otras señales son débiles.
  if (coincidenciaExpediente && clasificacion === "posible") {
    clasificacion = "probable"
  }

  motivos.push(`Score final: ${score}%`)

  return {
    score,
    coincidenciaExpediente,
    coincidenciaRut,
    similitudNombre,
    coincidenciaResolucion,
    coincidenciaComuna,
    coincidenciaFuenteAgua,
    clasificacion,
    motivos,
  }
}

export const CLASIFICACION_LABELS: Record<Clasificacion, string> = {
  confirmada: "Coincidencia confirmada",
  probable: "Coincidencia probable",
  posible: "Posible coincidencia",
  sin_coincidencia: "Sin coincidencia",
}

/**
 * Estados por expediente. Los cuatro resultados exigidos por el criterio del proyecto son
 * CONFIRMADA, REVISION (que agrupa las clasificaciones "probable" y "posible" bajo una misma
 * etiqueta de revisión humana), NO_ENCONTRADA y ERROR. PENDIENTE y los estados de admisibilidad
 * de resolución son estados operativos adicionales del sistema, no parte de ese resultado.
 */
export const ESTADO_EXPEDIENTE = {
  PENDIENTE: "Pendiente de búsqueda",
  SIN_COINCIDENCIA: "NO ENCONTRADA",
  POSIBLE: "POSIBLE PUBLICACIÓN – requiere revisión",
  REVISION: "POSIBLE PUBLICACIÓN – requiere revisión",
  ENCONTRADA: "PUBLICADA – coincidencia confirmada",
  CONFIRMADA: "PUBLICADA – coincidencia confirmada",
  ERROR: "ERROR DE CONSULTA",
  CON_RESOLUCION_ADMISIBLE: "Con resolución admisible",
  SIN_RESOLUCION_ADMISIBLE: "Sin resolución admisible",
  RESOLUCION_INADMISIBLE: "Resolución inadmisible",
} as const

export function estadoDesdeClasificacion(clasificacion: Clasificacion): string {
  switch (clasificacion) {
    case "confirmada":
      return ESTADO_EXPEDIENTE.CONFIRMADA
    case "probable":
    case "posible":
      return ESTADO_EXPEDIENTE.REVISION
    default:
      return ESTADO_EXPEDIENTE.SIN_COINCIDENCIA
  }
}
