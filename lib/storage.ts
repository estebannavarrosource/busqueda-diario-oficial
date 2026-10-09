import { createReadStream } from "node:fs"
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { get, put } from "@vercel/blob"

/**
 * Almacenamiento de PDFs con dos implementaciones:
 * - "local": disco del servidor (instalaciones propias). Carpeta en PDF_STORAGE_DIR.
 * - "blob": Vercel Blob (requiere BLOB_READ_WRITE_TOKEN).
 * STORAGE_DRIVER fuerza una u otra; si no se define, se usa "blob" solo cuando hay token.
 */
export type StorageDriver = "local" | "blob"

export function storageDriver(): StorageDriver {
  const forced = process.env.STORAGE_DRIVER?.trim().toLowerCase()
  if (forced === "local" || forced === "blob") return forced
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local"
}

function localRoot(): string {
  return path.resolve(process.env.PDF_STORAGE_DIR || path.join(process.cwd(), "storage", "pdfs"))
}

function localPath(pathname: string): string {
  const root = localRoot()
  const full = path.resolve(root, pathname)
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Ruta de archivo inválida")
  return full
}

export async function guardarPdf(pathname: string, body: Buffer): Promise<string> {
  if (storageDriver() === "blob") {
    const blob = await put(pathname, body, {
      access: "public",
      contentType: "application/pdf",
      allowOverwrite: true,
    })
    return blob.pathname
  }
  const full = localPath(pathname)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, body)
  return pathname
}

export type PdfLeido =
  | { status: 304; etag: string }
  | { status: 200; etag: string; stream: ReadableStream }

export async function leerPdf(pathname: string, ifNoneMatch?: string): Promise<PdfLeido | null> {
  if (storageDriver() === "blob") {
    const result = await get(pathname, { access: "public", ifNoneMatch })
    if (!result) return null
    if (result.statusCode === 304) return { status: 304, etag: result.blob.etag }
    return { status: 200, etag: result.blob.etag, stream: result.stream }
  }
  const full = localPath(pathname)
  const info = await stat(full).catch(() => null)
  if (!info?.isFile()) return null
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  if (ifNoneMatch && ifNoneMatch === etag) return { status: 304, etag }
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream
  return { status: 200, etag, stream }
}
