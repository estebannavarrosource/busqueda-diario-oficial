import { redirect } from "next/navigation"
import { desc, eq, sql } from "drizzle-orm"
import { expedientesHabilitado } from "@/lib/features"
import { DownloadIcon, DropletsIcon, ScaleIcon } from "lucide-react"
import { db } from "@/lib/db"
import { coincidencias, expedientes } from "@/lib/db/schema"
import { obtenerEstadisticas } from "@/app/actions/expedientes"
import { StatsCards } from "@/components/stats-cards"
import { ImportDialog } from "@/components/import-dialog"
import { RunSearchDialog } from "@/components/run-search-dialog"
import { ExpedientesTable, type ExpedienteRow } from "@/components/expedientes-table"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

async function getExpedientesConCoincidencias(): Promise<ExpedienteRow[]> {
  const rows = await db
    .select({
      id: expedientes.id,
      numeroExpediente: expedientes.numeroExpediente,
      solicitante: expedientes.solicitante,
      rut: expedientes.rut,
      estado: expedientes.estado,
      fechaSolicitud: expedientes.fechaSolicitud,
      coincidenciasPendientes: sql<number>`count(${coincidencias.id}) filter (where ${coincidencias.estado} = 'pendiente')`,
    })
    .from(expedientes)
    .leftJoin(coincidencias, eq(coincidencias.expedienteId, expedientes.id))
    .groupBy(expedientes.id)
    .orderBy(desc(expedientes.updatedAt))

  return rows
}

export default async function DashboardPage() {
  if (!expedientesHabilitado) redirect("/publicaciones")

  const [stats, expedientesRows] = await Promise.all([obtenerEstadisticas(), getExpedientesConCoincidencias()])

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-6 border-b border-border pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ScaleIcon className="size-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-balance text-xl font-semibold text-foreground">
                Búsqueda de Publicaciones — Diario Oficial
              </h1>
              <p className="text-sm text-muted-foreground">
                Conciliación automática de expedientes DGA con resoluciones publicadas
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" render={<a href="/publicaciones" />} nativeButton={false}>
              <DropletsIcon data-icon="inline-start" />
              Publicaciones DGA
            </Button>
            <ImportDialog />
            <RunSearchDialog />
            <Button variant="outline" render={<a href="/api/exportar" />} nativeButton={false}>
              <DownloadIcon data-icon="inline-start" />
              Exportar Excel
            </Button>
          </div>
        </div>

        <StatsCards
          total={Number(stats.total)}
          confirmadas={Number(stats.confirmadas)}
          revision={Number(stats.revision)}
          sinCoincidencia={Number(stats.sinCoincidencia)}
        />
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Expedientes monitoreados</h2>
        <ExpedientesTable expedientes={expedientesRows} />
      </section>
    </main>
  )
}
