import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { expedientesHabilitado } from "@/lib/features"
import { desc, eq } from "drizzle-orm"
import { ArrowLeftIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react"
import { db } from "@/lib/db"
import { coincidencias, expedientes, publicaciones } from "@/lib/db/schema"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BadgeClasificacion, BadgeEstado } from "@/components/badge-estado"
import { CoincidenciaActions } from "@/components/coincidencia-actions"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

export const dynamic = "force-dynamic"

async function getExpediente(id: number) {
  const [expediente] = await db.select().from(expedientes).where(eq(expedientes.id, id)).limit(1)
  if (!expediente) return null

  const coincidenciasRows = await db
    .select({
      coincidencia: coincidencias,
      publicacion: publicaciones,
    })
    .from(coincidencias)
    .innerJoin(publicaciones, eq(publicaciones.id, coincidencias.publicacionId))
    .where(eq(coincidencias.expedienteId, id))
    .orderBy(desc(coincidencias.score))

  return { expediente, coincidenciasRows }
}

export default async function ExpedienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!expedientesHabilitado) redirect("/publicaciones")

  const { id } = await params
  const data = await getExpediente(Number(id))
  if (!data) notFound()

  const { expediente, coincidenciasRows } = data

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          render={<Link href="/" />}
          nativeButton={false}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al listado
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-balance text-2xl font-semibold text-foreground">{expediente.numeroExpediente}</h1>
            <p className="text-sm text-muted-foreground">{expediente.solicitante ?? "Solicitante no informado"}</p>
          </div>
          <BadgeEstado estado={expediente.estado} className="px-3 py-1 text-sm" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos del expediente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="RUT" value={expediente.rut} />
          <Field label="Fecha solicitud" value={expediente.fechaSolicitud} />
          <Field label="Fecha asignación" value={expediente.fechaAsignacion} />
          <Field label="Comentarios" value={expediente.comentarios} className="col-span-2 sm:col-span-3" />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">
          Publicaciones candidatas ({coincidenciasRows.length})
        </h2>

        {coincidenciasRows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon />
              </EmptyMedia>
              <EmptyTitle>Sin publicaciones encontradas</EmptyTitle>
              <EmptyDescription>
                Ejecuta una búsqueda desde el panel principal para conciliar este expediente contra el Diario
                Oficial.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {coincidenciasRows.map(({ coincidencia, publicacion }) => (
              <Card key={coincidencia.id}>
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <BadgeClasificacion clasificacion={coincidencia.clasificacion} />
                        <span className="text-xs font-medium text-muted-foreground">
                          Score: {coincidencia.score}%
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{publicacion.titulo ?? "Sin título"}</p>
                      <CardDescription>
                        {publicacion.fechaPublicacion ?? "Fecha no disponible"} · Edición {publicacion.numeroEdicion ?? "—"}{" "}
                        {publicacion.numeroResolucion ? `· Res. Exenta N° ${publicacion.numeroResolucion}` : ""}
                      </CardDescription>
                    </div>
                    <CoincidenciaActions coincidenciaId={coincidencia.id} estado={coincidencia.estado} />
                  </div>

                  {publicacion.texto && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{publicacion.texto}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {Array.isArray(coincidencia.motivos) &&
                      (coincidencia.motivos as string[]).map((motivo) => <span key={motivo}>• {motivo}</span>)}
                  </div>

                  {publicacion.url && (
                    <Button
                      variant="link"
                      size="sm"
                      className="w-fit px-0"
                      render={<a href={publicacion.url} target="_blank" rel="noopener noreferrer" />}
                      nativeButton={false}
                    >
                      Ver publicación original
                      <ExternalLinkIcon data-icon="inline-end" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function Field({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  )
}
