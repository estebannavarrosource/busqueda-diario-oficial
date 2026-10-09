import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { importarExpedientesDesdeFormData } from "@/lib/import-service"
import { expedientesHabilitado } from "@/lib/features"

export async function POST(request: Request) {
  if (!expedientesHabilitado) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const formData = await request.formData()
  const summary = await importarExpedientesDesdeFormData(formData)

  if (!summary.error) {
    revalidatePath("/")
  }

  return NextResponse.json(summary)
}
