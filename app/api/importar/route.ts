import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { importarExpedientesDesdeFormData } from "@/lib/import-service"

export async function POST(request: Request) {
  const formData = await request.formData()
  const summary = await importarExpedientesDesdeFormData(formData)

  if (!summary.error) {
    revalidatePath("/")
  }

  return NextResponse.json(summary)
}
