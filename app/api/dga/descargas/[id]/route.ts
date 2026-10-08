import { NextResponse } from "next/server"
import { obtenerEstadoDescarga } from "@/app/actions/dga"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ejecucionId = Number(id)
  if (!Number.isInteger(ejecucionId) || ejecucionId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 })
  }

  const estado = await obtenerEstadoDescarga(ejecucionId)
  if (!estado) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json(estado, { headers: { "Cache-Control": "no-store" } })
}
