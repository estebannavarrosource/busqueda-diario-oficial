export interface PublicacionRaw {
  cve: string
  titulo: string
  materia: string
  url: string
  pdfUrl: string | null
  organismo: string | null
  seccion: string | null
  fechaPublicacion: string // YYYY-MM-DD
  numeroEdicion: string | null
  numeroResolucion: string | null
  numeroExpedienteDetectado: string | null
  rutDetectado: string | null
  nombreInteresadoDetectado: string | null
}

export interface SearchCriteria {
  desde: string // YYYY-MM-DD
  hasta: string // YYYY-MM-DD
  texto?: string
}

/**
 * Interfaz conceptual DiarioOficialProvider (patrón Adapter).
 * Permite reemplazar el scraping por una API del Diario Oficial en el futuro
 * sin modificar el resto del sistema (motor de coincidencias, UI, API REST).
 */
export interface DiarioOficialProvider {
  /** Obtiene todas las publicaciones del sumario para una fecha específica. */
  getEditions(fecha: string): Promise<PublicacionRaw[]>
  /** Busca publicaciones dentro de un rango de fechas, opcionalmente filtrando por texto. */
  search(criteria: SearchCriteria): Promise<PublicacionRaw[]>
}
