import { type NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { documentosCve } from "@/lib/db/schema"
import { leerPdf } from "@/lib/storage"

export async function GET(request: NextRequest, { params }: { params: Promise<{ cve: string }> }) {
  const { cve } = await params
  if (!/^\d+$/.test(cve)) return NextResponse.json({ error: "CVE inválido" }, { status: 400 })

  const [doc] = await db
    .select({ blobPathname: documentosCve.blobPathname })
    .from(documentosCve)
    .where(eq(documentosCve.cve, cve))
  if (!doc?.blobPathname) return NextResponse.json({ error: "PDF no disponible" }, { status: 404 })

  const result = await leerPdf(doc.blobPathname, request.headers.get("if-none-match") ?? undefined)
  if (!result) return NextResponse.json({ error: "PDF no encontrado" }, { status: 404 })

  if (result.status === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: result.etag, "Cache-Control": "private, no-cache" },
    })
  }

  const disposition = request.nextUrl.searchParams.get("descargar") ? "attachment" : "inline"
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="CVE-${cve}.pdf"`,
      ETag: result.etag,
      "Cache-Control": "private, no-cache",
    },
  })
}
