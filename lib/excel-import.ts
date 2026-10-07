import { read, utils } from "xlsx"
import { normalizeExpediente, normalizeNombre, normalizeRut } from "./normalize"

export interface ExpedienteImportRow {
  numeroExpediente: string
  solicitante: string | null
  rut: string | null
  fechaSolicitud: string | null
  fechaAsignacion: string | null
  comentarios: string | null
  region: string | null
  provincia: string | null
  comuna: string | null
  tipoSolicitud: string | null
  fuenteAgua: string | null
  caudal: string | null
}

export interface ImportResult {
  filas: ExpedienteImportRow[]
  omitidas: number
  columnasDetectadas: Record<string, string>
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizeHeader(header: string): string {
  return stripAccents(header).toLowerCase().replace(/[^a-z0-9]/g, "")
}

const HEADER_ALIASES: Record<keyof ExpedienteImportRow, string[]> = {
  numeroExpediente: ["expediente", "nexpediente", "numeroexpediente", "codigoexpediente"],
  solicitante: ["nombredelsolicitante", "solicitante", "nombresolicitante", "interesado", "nombreinteresado"],
  rut: ["rut", "rutsolicitante"],
  fechaSolicitud: ["fechasolicitud", "fechadesolicitud", "fecha"],
  fechaAsignacion: ["fechaasignacion", "fechadeasignacion"],
  comentarios: ["comentarios", "observaciones", "notas"],
  region: ["region"],
  provincia: ["provincia"],
  comuna: ["comuna"],
  tipoSolicitud: ["tiposolicitud", "tipodesolicitud", "tipoderecho"],
  fuenteAgua: ["fuentedeagua", "fuenteagua", "acuifero", "fuente"],
  caudal: ["caudal", "caudalsolicitado", "caudall/s"],
}

function excelDateToISO(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "number") {
    // Serial de fecha de Excel (días desde 1899-12-30).
    const date = new Date(Math.round((value - 25569) * 86400 * 1000))
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    const ddmmyyyy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
  }
  return null
}

/**
 * Parsea un archivo Excel de carga masiva. Detecta automáticamente la hoja y las columnas
 * relevantes usando alias tolerantes a mayúsculas, tildes y espacios, siguiendo el formato
 * del archivo de referencia "Coincidencias_Admisible_Resoluciones.xlsx".
 */
export function parseExpedientesExcel(buffer: ArrayBuffer): ImportResult {
  const workbook = read(buffer, { cellDates: true })
  const sheetName =
    workbook.SheetNames.find((name) => /resumen|expediente|coincidencia/i.test(name)) ?? workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  if (rows.length === 0) {
    return { filas: [], omitidas: 0, columnasDetectadas: {} }
  }

  const originalHeaders = Object.keys(rows[0])
  const headerMap: Partial<Record<keyof ExpedienteImportRow, string>> = {}

  for (const header of originalHeaders) {
    const normalized = normalizeHeader(header)
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [keyof ExpedienteImportRow, string[]][]) {
      if (headerMap[field]) continue
      if (aliases.includes(normalized)) {
        headerMap[field] = header
      }
    }
  }

  if (!headerMap.numeroExpediente) {
    throw new Error(
      `No se encontró la columna "Expediente" en el archivo. Columnas disponibles: ${originalHeaders.join(", ")}`,
    )
  }

  const filas: ExpedienteImportRow[] = []
  let omitidas = 0

  for (const row of rows) {
    const numeroExpediente = String(row[headerMap.numeroExpediente] ?? "").trim()
    if (!numeroExpediente || normalizeExpediente(numeroExpediente).length === 0) {
      omitidas++
      continue
    }

    filas.push({
      numeroExpediente,
      solicitante: headerMap.solicitante ? String(row[headerMap.solicitante] ?? "").trim() || null : null,
      rut: headerMap.rut ? String(row[headerMap.rut] ?? "").trim() || null : null,
      fechaSolicitud: headerMap.fechaSolicitud ? excelDateToISO(row[headerMap.fechaSolicitud]) : null,
      fechaAsignacion: headerMap.fechaAsignacion ? excelDateToISO(row[headerMap.fechaAsignacion]) : null,
      comentarios: headerMap.comentarios ? String(row[headerMap.comentarios] ?? "").trim() || null : null,
      region: headerMap.region ? String(row[headerMap.region] ?? "").trim() || null : null,
      provincia: headerMap.provincia ? String(row[headerMap.provincia] ?? "").trim() || null : null,
      comuna: headerMap.comuna ? String(row[headerMap.comuna] ?? "").trim() || null : null,
      tipoSolicitud: headerMap.tipoSolicitud ? String(row[headerMap.tipoSolicitud] ?? "").trim() || null : null,
      fuenteAgua: headerMap.fuenteAgua ? String(row[headerMap.fuenteAgua] ?? "").trim() || null : null,
      caudal: headerMap.caudal ? String(row[headerMap.caudal] ?? "").trim() || null : null,
    })
  }

  return {
    filas,
    omitidas,
    columnasDetectadas: headerMap as Record<string, string>,
  }
}

export function buildExpedienteRecord(row: ExpedienteImportRow) {
  return {
    numeroExpediente: row.numeroExpediente,
    numeroExpedienteNormalizado: normalizeExpediente(row.numeroExpediente),
    solicitante: row.solicitante,
    solicitanteNormalizado: row.solicitante ? normalizeNombre(row.solicitante) : null,
    rut: row.rut,
    rutNormalizado: row.rut ? normalizeRut(row.rut) : null,
    fechaSolicitud: row.fechaSolicitud,
    fechaAsignacion: row.fechaAsignacion,
    comentarios: row.comentarios,
    region: row.region,
    provincia: row.provincia,
    comuna: row.comuna,
    comunaNormalizada: row.comuna ? row.comuna.toUpperCase() : null,
    tipoSolicitud: row.tipoSolicitud,
    fuenteAgua: row.fuenteAgua,
    caudal: row.caudal,
  }
}
