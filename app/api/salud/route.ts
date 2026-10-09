import { access, constants, mkdir } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { diagnosticarError } from "@/lib/errores"
import { crearLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"

interface Chequeo {
  ok: boolean
  ms?: number
  detalle?: string
  codigo?: string
  sugerencia?: string
}

const TABLAS = ["importaciones_dga", "publicaciones_dga", "documentos_cve", "reglas_dga", "ejecuciones_descarga", "auditoria_documentos"]

async function medir(fn: () => Promise<string | undefined>): Promise<Chequeo> {
  const inicio = Date.now()
  try {
    const detalle = await fn()
    return { ok: true, ms: Date.now() - inicio, detalle }
  } catch (error) {
    const diag = diagnosticarError(error)
    return { ok: false, ms: Date.now() - inicio, detalle: diag.mensaje, codigo: diag.codigo, sugerencia: diag.sugerencia }
  }
}

/**
 * Diagnóstico rápido del servidor: GET /api/salud
 * Revisa conexión a PostgreSQL, que existan las tablas, y que la carpeta de PDF tenga escritura.
 */
export async function GET() {
  const log = crearLogger("salud")

  const baseDatos = await medir(async () => {
    const res = await db.execute(sql`select version() as v`)
    const fila = (res as unknown as { rows?: { v: string }[] }).rows?.[0] ?? (res as unknown as { v: string }[])[0]
    return fila?.v?.split(" ").slice(0, 2).join(" ")
  })

  const tablas = await medir(async () => {
    const res = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )
    const filas = ((res as unknown as { rows?: { table_name: string }[] }).rows ?? (res as unknown as { table_name: string }[]))
    const existentes = new Set(filas.map((f) => f.table_name))
    const faltantes = TABLAS.filter((t) => !existentes.has(t))
    if (faltantes.length) {
      throw Object.assign(new Error(`relation "${faltantes[0]}" does not exist (faltan: ${faltantes.join(", ")})`), { code: "42P01" })
    }
    return `${TABLAS.length} tablas presentes`
  })

  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local")
  const almacenamiento = await medir(async () => {
    if (driver === "blob") {
      if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN no definido")
      return "Vercel Blob"
    }
    const dir = path.resolve(process.env.PDF_STORAGE_DIR ?? "storage/pdfs")
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
    return `local: ${dir}`
  })

  const chequeos = { baseDatos, tablas, almacenamiento }
  const ok = Object.values(chequeos).every((c) => c.ok)
  if (!ok) log.warn("chequeo_fallido", Object.fromEntries(Object.entries(chequeos).filter(([, c]) => !c.ok).map(([k, c]) => [k, c.codigo])))

  return NextResponse.json(
    {
      ok,
      fecha: new Date().toISOString(),
      node: process.version,
      entorno: process.env.NODE_ENV,
      chromium: process.env.CHROMIUM_EXECUTABLE_PATH ?? "(por defecto de Playwright)",
      chequeos,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  )
}
