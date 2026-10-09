import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { importarExcelDga } from "@/lib/dga/import"

export const maxDuration = 300

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo supera los 50 MB." }, { status: 400 })
  }

  try {
    const resumen = await importarExcelDga(file)
    if (!resumen.error) revalidatePath("/publicaciones")
    return NextResponse.json(resumen, { status: resumen.error ? 400 : 200 })
  } catch (error) {
    console.error("[importar-dga]", file.name, error)
    const detalle = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Error interno al importar: ${detalle}`, total: 0, dga: 0, nuevos: 0, actualizados: 0, documentosNuevos: 0 },
      { status: 500 },
    )
  }
}
