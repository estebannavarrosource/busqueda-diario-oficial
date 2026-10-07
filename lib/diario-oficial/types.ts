export interface PublicacionRaw {
  cve: string
  titulo: string
  materia: string
  /** Extracto o texto completo de la publicación disponible en el sumario. */
  extracto: string
  url: string
  pdfUrl: string | null
  /** Ej. "Ministerio de Obras Públicas". Null si la publicación no pertenece a ese ministerio. */
  ministerio: string | null
  organismo: string | null
  /** Ej. "Solicitudes de Derechos de Aguas". Null si no se pudo clasificar la publicación en esa categoría. */
  categoria: string | null
  seccion: string | null
  /**
   * true cuando la publicación cumple la clasificación completa Ministerio de Obras Públicas →
   * Dirección General de Aguas → Solicitudes de Derechos de Aguas. Es la señal principal que el
   * motor de coincidencias y la UI usan para distinguir estas publicaciones de otras resoluciones
   * o decretos que solo mencionan "Dirección General de Aguas" de forma incidental.
   */
  esCandidataDga: boolean
  region: string | null
  provincia: string | null
  comuna: string | null
  tipoSolicitud: string | null
  fuenteAgua: string | null
  caudal: string | null
  coordenadas: string | null
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

export interface SearchResult {
  publicaciones: PublicacionRaw[]
  /**
   * Fechas dentro del rango consultado que terminaron en ERROR DE CONSULTA (ej. el sitio cambió
   * de estructura, o el navegador headless no logró obtener el sumario tras los reintentos).
   * Estas fechas NO deben interpretarse como "sin publicaciones": el llamador debe registrarlas
   * como error y evitar que los expedientes de ese rango se marquen como NO ENCONTRADA solo por
   * la ausencia de datos de un día que en realidad falló.
   */
  fechasConError: string[]
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
  search(criteria: SearchCriteria): Promise<SearchResult>
}
