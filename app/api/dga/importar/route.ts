import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { importarExcelDga } from "@/lib/dga/import"
import { respuestaError } from "@/lib/errores"
import { crearLogger, nuevoRequestId } from "@/lib/logger"

export const maxDuration = 300

const VACIO = { total: 0, dga: 0, nuevos: 0, actualizados: 0, documentosNuevos: 0 }
const MAX_BYTES = 50 * 1024 * 1024

export async function POST(request: Request) {
  const requestId = nuevoRequestId()
  const log = crearLogger("api-importar", { req: requestId })
  const inicio = Date.now()
  const headers = { "X-Request-Id": requestId, "Cache-Control": "no-store" }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (error) {
    log.warn("cuerpo_invalido", { contentType: request.headers.get("content-type") }, error)
    return NextResponse.json(
      {
        ...VACIO,
        error: "No se pudo leer el archivo enviado (la subida llegó incompleta o con formato inválido).",
        codigo: "SUBIDA_INVALIDA",
        sugerencia: "Si hay un proxy (nginx), revisa client_max_body_size y que no corte la subida.",
        requestId,
      },
      { status: 400, headers },
    )
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    log.warn("sin_archivo")
    return NextResponse.json({ ...VACIO, error: "No se recibió ningún archivo.", codigo: "SIN_ARCHIVO", requestId }, { status: 400, headers })
  }
  const flog = log.hijo({ archivo: file.name, kb: Math.round(file.size / 1024) })
  flog.info("recibido")

  if (file.size > MAX_BYTES) {
    flog.warn("archivo_grande")
    return NextResponse.json(
      { ...VACIO, error: "El archivo supera los 50 MB.", codigo: "ARCHIVO_GRANDE", requestId },
      { status: 400, headers },
    )
  }

  try {
    const resumen = await importarExcelDga(file)
    if (resumen.error) {
      flog.warn("excel_rechazado", { motivo: resumen.error })
      return NextResponse.json({ ...resumen, codigo: "EXCEL_INVALIDO", requestId }, { status: 400, headers })
    }
    revalidatePath("/publicaciones")
    flog.info("importado", {
      total: resumen.total,
      dga: resumen.dga,
      nuevos: resumen.nuevos,
      actualizados: resumen.actualizados,
      cvePorDescargar: resumen.documentosNuevos,
      ms: Date.now() - inicio,
    })
    return NextResponse.json({ ...resumen, requestId }, { headers })
  } catch (error) {
    return respuestaError(error, { log: flog, requestId, evento: "error_importando", extra: { ...VACIO, archivo: file.name } })
  }
}
