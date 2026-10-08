import Link from "next/link"
import { asc, desc } from "drizzle-orm"
import { ArrowLeftIcon } from "lucide-react"
import { db } from "@/lib/db"
import { auditoriaDocumentos, reglasDga } from "@/lib/db/schema"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReglasManager } from "@/components/dga/reglas-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Reglas de clasificación DGA" }

export default async function ReglasPage() {
  const [reglas, eventos] = await Promise.all([
    db.select().from(reglasDga).orderBy(asc(reglasDga.prioridad), asc(reglasDga.id)),
    db.select().from(auditoriaDocumentos).orderBy(desc(auditoriaDocumentos.fecha)).limit(100),
  ])

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <Link
          href="/publicaciones"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Publicaciones DGA
        </Link>
        <h1 className="text-balance text-xl font-semibold text-foreground">Reglas de clasificación</h1>
        <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Cada regla es una expresión regular evaluada sobre TITULO, TIPOSOL, TEXTO o cualquiera de ellos. Basta una
          regla INCLUIR para marcar un registro como competencia DGA; cualquier regla EXCLUIR lo descarta. La primera
          regla coincidente (por prioridad) fija el tipo de procedimiento y el origen.
        </p>
      </header>

      <ReglasManager reglas={reglas} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Auditoría reciente</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>CVE</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Sin eventos registrados.
                  </TableCell>
                </TableRow>
              )}
              {eventos.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                    {e.fecha.toLocaleString("es-CL", { timeZone: "America/Santiago" })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.accion}</TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">{e.cve ?? "—"}</TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">{e.detalle}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  )
}
