import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { expedientes } from "@/lib/db/schema"
import { buildExpedienteRecord, parseExpedientesExcel } from "@/lib/excel-import"

export interface ImportSummary {
  total: number
  creados: number
  actualizados: number
  omitidos: number
  error?: string
}

/**
 * Importa expedientes desde un archivo Excel adjunto en un FormData.
 *
 * Vive fuera de app/actions porque los Server Actions de Next.js envían archivos
 * usando un multipart encoding especial (acción + FormData) que, en modo dev con
 * Turbopack, puede truncar la petición y lanzar "Unexpected end of form" para
 * archivos subidos desde el navegador. Un Route Handler usa el parseo estándar de
 * FormData de la Web Request API, que es más confiable para subidas de archivos.
 */
export async function importarExpedientesDesdeFormData(formData: FormData): Promise<ImportSummary> {
  const file = formData.get("file") as File | null
  if (!file) {
    return { total: 0, creados: 0, actualizados: 0, omitidos: 0, error: "No se adjuntó ningún archivo." }
  }

  let parsed: ReturnType<typeof parseExpedientesExcel>
  try {
    const buffer = await file.arrayBuffer()
    parsed = parseExpedientesExcel(buffer)
  } catch (error) {
    return {
      total: 0,
      creados: 0,
      actualizados: 0,
      omitidos: 0,
      error: error instanceof Error ? error.message : "No se pudo leer el archivo Excel.",
    }
  }

  let creados = 0
  let actualizados = 0

  for (const row of parsed.filas) {
    const record = buildExpedienteRecord(row)
    const existing = await db
      .select({ id: expedientes.id })
      .from(expedientes)
      .where(eq(expedientes.numeroExpedienteNormalizado, record.numeroExpedienteNormalizado))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(expedientes)
        .set({ ...record, updatedAt: new Date() })
        .where(eq(expedientes.id, existing[0].id))
      actualizados++
    } else {
      await db.insert(expedientes).values(record)
      creados++
    }
  }

  return {
    total: parsed.filas.length,
    creados,
    actualizados,
    omitidos: parsed.omitidas,
  }
}
