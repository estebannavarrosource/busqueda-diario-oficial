import { read, utils } from "xlsx"

export interface FilaPublicacionExcel {
  idDoe: string
  cve: string | null
  fechaPublicacion: string | null
  cuerpo: number | null
  titulo: string | null
  tiposol: string | null
  solicitante: string | null
  rut: string | null
  region: string | null
  provincia: string | null
  comuna: string | null
  texto: string | null
  /** Todas las columnas originales del Excel, sin transformar. */
  datosOriginales: Record<string, unknown>
}

function texto(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result === "" ? null : result
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** FECPUB llega como Date, como "15-05-2026" o como "2026-05-15". Se normaliza a YYYY-MM-DD. */
export function normalizarFecha(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SheetJS entrega las fechas a medianoche local; se usan los componentes UTC + 12h para
    // no correr el día por zona horaria.
    const d = new Date(value.getTime() + 12 * 3600 * 1000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const raw = texto(value)
  if (!raw) return null
  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  return null
}

function serializable(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[key] = value instanceof Date ? normalizarFecha(value) : value
  }
  return result
}

export function parsearExcelPublicaciones(buffer: ArrayBuffer): FilaPublicacionExcel[] {
  const workbook = read(buffer, { type: "array", cellDates: true })
  const filas: FilaPublicacionExcel[] = []

  for (const sheetName of workbook.SheetNames) {
    const rows = utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" })
    for (const row of rows) {
      const idDoe = texto(row.ID_DOE)
      if (!idDoe) continue
      const cuerpo = Number(row.CUERPO)
      filas.push({
        idDoe,
        cve: texto(row.CVE),
        fechaPublicacion: normalizarFecha(row.FECPUB),
        cuerpo: Number.isFinite(cuerpo) && row.CUERPO !== "" ? cuerpo : null,
        titulo: texto(row.TITULO),
        tiposol: texto(row.TIPOSOL),
        solicitante: texto(row.SOLICITANTE),
        rut: texto(row.RUT),
        region: texto(row.REGION),
        provincia: texto(row.PROVINCIA),
        comuna: texto(row.COMUNA),
        texto: texto(row.TEXTO),
        datosOriginales: serializable(row),
      })
    }
  }

  return filas
}
