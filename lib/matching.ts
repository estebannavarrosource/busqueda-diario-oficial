import { normalizeExpediente, normalizeNombre, normalizeResolucion, normalizeRut, similitudNombres } from "./normalize"

export interface ExpedienteForMatching {
  id: number
  numeroExpedienteNormalizado: string
  solicitanteNormalizado: string | null
  rutNormalizado: string | null
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
}

export type Clasificacion = "confirmada" | "probable" | "posible" | "sin_coincidencia"

export interface MatchResult {
  score: number
  coincidenciaExpediente: boolean
  coincidenciaRut: boolean
  similitudNombre: number
  coincidenciaResolucion: boolean
  clasificacion: Clasificacion
  motivos: string[]
}

/**
 * Calcula el score de coincidencia entre un expediente DGA y una publicación del Diario Oficial.
 * Reglas del criterio del proyecto:
 *  - Expediente exacto: +70
 *  - RUT exacto: +20
 *  - Nombre con similitud > 90%: +10
 *  - Número de resolución conocido y coincidente: +20
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
    score += 70
    motivos.push("Expediente exacto encontrado: sí")
  } else {
    motivos.push("Expediente exacto encontrado: no")
  }

  const rutPublicacion = normalizeRut(publicacion.rutDetectado)
  const coincidenciaRut = Boolean(
    expediente.rutNormalizado && rutPublicacion && expediente.rutNormalizado === rutPublicacion,
  )
  if (coincidenciaRut) {
    score += 20
    motivos.push("RUT exacto: sí")
  } else if (expediente.rutNormalizado) {
    motivos.push("RUT exacto: no")
  }

  const nombrePublicacion = normalizeNombre(publicacion.nombreInteresadoDetectado ?? publicacion.titulo)
  const similitudNombre = expediente.solicitanteNormalizado
    ? similitudNombres(expediente.solicitanteNormalizado, nombrePublicacion)
    : 0
  if (similitudNombre > 90) {
    score += 10
    motivos.push(`Nombre similar: ${similitudNombre}%`)
  } else if (expediente.solicitanteNormalizado) {
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

  let clasificacion: Clasificacion
  if (score >= 90) clasificacion = "confirmada"
  else if (score >= 70) clasificacion = "probable"
  else if (score >= 40) clasificacion = "posible"
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

export const ESTADO_EXPEDIENTE = {
  PENDIENTE: "Pendiente de búsqueda",
  SIN_COINCIDENCIA: "Sin coincidencia",
  POSIBLE: "Posible coincidencia",
  REVISION: "Revisión requerida",
  ENCONTRADA: "Publicación encontrada",
  CONFIRMADA: "Publicación confirmada",
  ERROR: "Error de consulta",
  CON_RESOLUCION_ADMISIBLE: "Con resolución admisible",
  SIN_RESOLUCION_ADMISIBLE: "Sin resolución admisible",
  RESOLUCION_INADMISIBLE: "Resolución inadmisible",
} as const

export function estadoDesdeClasificacion(clasificacion: Clasificacion): string {
  switch (clasificacion) {
    case "confirmada":
      return ESTADO_EXPEDIENTE.CONFIRMADA
    case "probable":
      return ESTADO_EXPEDIENTE.REVISION
    case "posible":
      return ESTADO_EXPEDIENTE.POSIBLE
    default:
      return ESTADO_EXPEDIENTE.SIN_COINCIDENCIA
  }
}
