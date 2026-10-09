import { NextResponse } from "next/server"
import { iniciarDescargaPdfs } from "@/app/actions/dga"
import { respuestaError } from "@/lib/errores"
import { crearLogger, nuevoRequestId } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  const requestId = nuevoRequestId()
  const log = crearLogger("api-descargas", { req: requestId })
  const inicio = Date.now()

  let cves: string[] | undefined
  const body = await request.json().catch(() => ({}))
  if (Array.isArray(body?.cves)) {
    cves = body.cves.filter((c: unknown): c is string => typeof c === "string" && c.trim() !== "").slice(0, 500)
  }
  log.info("solicitud", { cves: cves?.length ?? "todos" })

  try {
    const resultado = await iniciarDescargaPdfs(cves)
    log.info("iniciada", { ejecucion: resultado.ejecucionId, total: resultado.total, ms: Date.now() - inicio })
    return NextResponse.json(
      { ...resultado, requestId },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    )
  } catch (error) {
    return respuestaError(error, { log, requestId, evento: "error_al_iniciar" })
  }
}
