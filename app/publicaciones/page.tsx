import Link from "next/link"
import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm"
import { ArrowLeftIcon, DropletsIcon, SlidersHorizontalIcon } from "lucide-react"
import { db } from "@/lib/db"
import { documentosCve, ejecucionesDescarga, publicacionesDga } from "@/lib/db/schema"
import { normalizeRut } from "@/lib/normalize"
import { expedientesHabilitado } from "@/lib/features"
import { Button } from "@/components/ui/button"
import { ImportDgaDialog } from "@/components/dga/import-dga-dialog"
import { DescargarPdfsButton } from "@/components/dga/descargar-pdfs-button"
import { FiltrosPublicaciones, type Filtros } from "@/components/dga/filtros-publicaciones"
import { PublicacionesTable, type PublicacionRow } from "@/components/dga/publicaciones-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Publicaciones DGA — Diario Oficial" }

const POR_PAGINA = 50

function texto(v: string | string[] | undefined) {
  const value = Array.isArray(v) ? v[0] : v
  return value?.trim() || ""
}

function construirFiltros(f: Filtros): SQL | undefined {
  const condiciones: SQL[] = []
  if (f.alcance !== "todas") condiciones.push(eq(publicacionesDga.esDga, true))
  if (f.desde) condiciones.push(gte(publicacionesDga.fechaPublicacion, f.desde))
  if (f.hasta) condiciones.push(lte(publicacionesDga.fechaPublicacion, f.hasta))
  if (f.cve) condiciones.push(eq(publicacionesDga.cve, f.cve))
  if (f.solicitante) condiciones.push(ilike(publicacionesDga.solicitante, `%${f.solicitante}%`))
  if (f.rut) {
    const rut = normalizeRut(f.rut)
    condiciones.push(rut ? eq(publicacionesDga.rutNormalizado, rut) : ilike(publicacionesDga.rut, `%${f.rut}%`))
  }
  if (f.region) condiciones.push(eq(publicacionesDga.region, f.region))
  if (f.comuna) condiciones.push(eq(publicacionesDga.comuna, f.comuna))
  if (f.tipo) condiciones.push(eq(publicacionesDga.tipoProcedimiento, f.tipo))
  if (f.origen) condiciones.push(eq(publicacionesDga.origen, f.origen))
  if (f.estado === "sin_documento") condiciones.push(sql`${documentosCve.id} is null`)
  else if (f.estado) condiciones.push(eq(documentosCve.estado, f.estado))
  return condiciones.length ? and(...condiciones) : undefined
}

export default async function PublicacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filtros: Filtros = {
    desde: texto(params.desde),
    hasta: texto(params.hasta),
    cve: texto(params.cve).replace(/\D/g, ""),
    solicitante: texto(params.solicitante),
    rut: texto(params.rut),
    region: texto(params.region),
    comuna: texto(params.comuna),
    tipo: texto(params.tipo),
    origen: texto(params.origen),
    estado: texto(params.estado),
    alcance: texto(params.alcance) || "dga",
  }
  const pagina = Math.max(1, Number(texto(params.pagina)) || 1)
  const where = construirFiltros(filtros)

  const [filas, [{ total }], resumen, [enCurso], ubicaciones, tipos] = await Promise.all([
    db
      .select({
        id: publicacionesDga.id,
        idDoe: publicacionesDga.idDoe,
        cve: publicacionesDga.cve,
        fechaPublicacion: publicacionesDga.fechaPublicacion,
        titulo: publicacionesDga.titulo,
        tiposol: publicacionesDga.tiposol,
        solicitante: publicacionesDga.solicitante,
        rut: publicacionesDga.rut,
        region: publicacionesDga.region,
        comuna: publicacionesDga.comuna,
        esDga: publicacionesDga.esDga,
        tipoProcedimiento: publicacionesDga.tipoProcedimiento,
        origen: publicacionesDga.origen,
        estadoDocumento: documentosCve.estado,
        ultimoError: documentosCve.ultimoError,
        tieneArchivo: sql<boolean>`${documentosCve.blobPathname} is not null`,
      })
      .from(publicacionesDga)
      .leftJoin(documentosCve, eq(documentosCve.cve, publicacionesDga.cve))
      .where(where)
      .orderBy(desc(publicacionesDga.fechaPublicacion), desc(publicacionesDga.cve))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db
      .select({ total: count() })
      .from(publicacionesDga)
      .leftJoin(documentosCve, eq(documentosCve.cve, publicacionesDga.cve))
      .where(where),
    db
      .select({ estado: documentosCve.estado, n: count() })
      .from(documentosCve)
      .groupBy(documentosCve.estado),
    db
      .select({ id: ejecucionesDescarga.id })
      .from(ejecucionesDescarga)
      .where(
        and(
          eq(ejecucionesDescarga.estado, "en_progreso"),
          gte(ejecucionesDescarga.actualizadoEn, new Date(Date.now() - 10 * 60 * 1000)),
        ),
      )
      .limit(1),
    db
      .selectDistinct({ region: publicacionesDga.region, comuna: publicacionesDga.comuna })
      .from(publicacionesDga)
      .where(
        and(
          filtros.alcance !== "todas" ? eq(publicacionesDga.esDga, true) : undefined,
          or(sql`${publicacionesDga.region} <> ''`, sql`${publicacionesDga.comuna} <> ''`),
        ),
      ),
    db
      .selectDistinct({ tipo: publicacionesDga.tipoProcedimiento })
      .from(publicacionesDga)
      .where(
        and(
          filtros.alcance !== "todas" ? eq(publicacionesDga.esDga, true) : undefined,
          sql`coalesce(${publicacionesDga.tipoProcedimiento}, '') <> ''`,
        ),
      ),
  ])

  const opcionesUbicacion = ubicaciones.map((u) => ({ region: u.region ?? "", comuna: u.comuna ?? "" }))
  const opcionesTipo = tipos
    .map((t) => t.tipo ?? "")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"))

  const porEstado = Object.fromEntries(resumen.map((r) => [r.estado, Number(r.n)]))
  const pendientes = (porEstado.pendiente ?? 0) + (porEstado.error ?? 0)
  const totalPaginas = Math.max(1, Math.ceil(Number(total) / POR_PAGINA))

  const enlacePagina = (p: number) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v)
    qs.set("pagina", String(p))
    return `/publicaciones?${qs.toString()}`
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6">
        {expedientesHabilitado && (
          <Link href="/" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Expedientes
          </Link>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <DropletsIcon className="size-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-balance text-xl font-semibold text-foreground">Publicaciones DGA</h1>
              <p className="text-sm text-muted-foreground">
                Registros importados del Diario Oficial y respaldo de PDF por CVE
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" render={<Link href="/publicaciones/reglas" />} nativeButton={false}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              Reglas y auditoría
            </Button>
            <DescargarPdfsButton pendientes={pendientes} ejecucionEnCurso={enCurso?.id ?? null} />
            <ImportDgaDialog />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {[
            ["Descargados", porEstado.descargado ?? 0],
            ["Pendientes", porEstado.pendiente ?? 0],
            ["No disponibles", porEstado.no_disponible ?? 0],
            ["Con error", porEstado.error ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono text-lg font-semibold text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <FiltrosPublicaciones filtros={filtros} opcionesUbicacion={opcionesUbicacion} opcionesTipo={opcionesTipo} />

      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {Number(total).toLocaleString("es-CL")} registros · página {pagina} de {totalPaginas}
        </p>
        <PublicacionesTable filas={filas as PublicacionRow[]} />
        {totalPaginas > 1 && (
          <nav aria-label="Paginación" className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              render={pagina > 1 ? <Link href={enlacePagina(pagina - 1)} /> : undefined}
              nativeButton={pagina <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= totalPaginas}
              render={pagina < totalPaginas ? <Link href={enlacePagina(pagina + 1)} /> : undefined}
              nativeButton={pagina >= totalPaginas}
            >
              Siguiente
            </Button>
          </nav>
        )}
      </section>
    </main>
  )
}
