import { NextResponse } from "next/server"
import { iniciarDescargaPdfs } from "@/app/actions/dga"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  let cves: string[] | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (Array.isArray(body?.cves)) {
      cves = body.cves.filter((c: unknown): c is string => typeof c === "string" && c.trim() !== "").slice(0, 500)
    }
  } catch {
    cves = undefined
  }

  try {
    const resultado = await iniciarDescargaPdfs(cves)
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error("[dga] Error al iniciar descarga de PDF:", error)
    return NextResponse.json({ error: `Error al iniciar la descarga: ${mensaje}` }, { status: 500 })
  }
}
