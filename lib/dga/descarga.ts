import { put } from "@vercel/blob"
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditoriaDocumentos, documentosCve, ejecucionesDescarga } from "@/lib/db/schema"
import { withBrowserSession } from "@/lib/diario-oficial/browser"
import { fetchSumarioEnSesion } from "@/lib/diario-oficial/scraping-provider"

export type EstadoDocumento = "pendiente" | "descargado" | "no_disponible" | "error"

const MAX_INTENTOS = 3

interface DocumentoPendiente {
  id: number
  cve: string
  fechaPublicacion: string | null
  intentos: number
}

/** Verifica que el enlace del sumario corresponda realmente al CVE y a la fecha de publicación. */
export function validarUrlPdf(url: string, cve: string, fecha: string): string | null {
  const [y, m, d] = fecha.split("-")
  if (!new RegExp(`/${cve}\\.pdf(\\?|$)`, "i").test(url)) return `El enlace no corresponde al CVE ${cve}`
  if (!url.includes(`/${y}/${m}/${d}/`)) return `El enlace no corresponde a la fecha ${fecha}`
  return null
}

function esPdf(body: Buffer, contentType: string) {
  return body.subarray(0, 5).toString("latin1") === "%PDF-" || /application\/pdf/i.test(contentType) && body.length > 1000
}

async function registrar(accion: string, cve: string | null, detalle: string) {
  await db.insert(auditoriaDocumentos).values({ accion, cve, detalle })
}

async function marcar(
  doc: DocumentoPendiente,
  estado: EstadoDocumento,
  extra: Partial<typeof documentosCve.$inferInsert> = {},
) {
  await db
    .update(documentosCve)
    .set({ estado, intentos: doc.intentos + 1, updatedAt: new Date(), ...extra })
    .where(eq(documentosCve.id, doc.id))
}

/** Documentos que aún deben procesarse: pendientes o con error que no agotaron sus intentos. */
export async function documentosPorProcesar(cves?: string[]): Promise<DocumentoPendiente[]> {
  const base = sql`(${documentosCve.estado} = 'pendiente' OR (${documentosCve.estado} = 'error' AND ${documentosCve.intentos} < ${MAX_INTENTOS}))`
  return db
    .select({
      id: documentosCve.id,
      cve: documentosCve.cve,
      fechaPublicacion: documentosCve.fechaPublicacion,
      intentos: documentosCve.intentos,
    })
    .from(documentosCve)
    .where(cves?.length ? and(base, inArray(documentosCve.cve, cves)) : base)
    .orderBy(asc(documentosCve.fechaPublicacion), asc(documentosCve.cve))
}

/**
 * Procesa los documentos agrupados por fecha: por cada fecha abre UNA sesión de navegador, lee el
 * sumario (Normas Generales + Particulares), ubica el enlace "Ver PDF" de cada CVE y lo descarga
 * dentro de la misma sesión (las cookies anti-bot son necesarias también para el PDF).
 * Un CVE con PDF ya almacenado nunca llega aquí, así que no se descarga dos veces.
 */
export async function ejecutarDescarga(ejecucionId: number, documentos: DocumentoPendiente[]) {
  const porFecha = new Map<string, DocumentoPendiente[]>()
  const sinFecha: DocumentoPendiente[] = []
  for (const doc of documentos) {
    if (!doc.fechaPublicacion) sinFecha.push(doc)
    else porFecha.set(doc.fechaPublicacion, [...(porFecha.get(doc.fechaPublicacion) ?? []), doc])
  }

  let procesados = 0
  let descargados = 0
  let noDisponibles = 0
  let errores = 0

  const progreso = () =>
    db
      .update(ejecucionesDescarga)
      .set({ procesados, descargados, noDisponibles, errores, actualizadoEn: new Date() })
      .where(eq(ejecucionesDescarga.id, ejecucionId))

  for (const doc of sinFecha) {
    await marcar(doc, "no_disponible", { ultimoError: "El registro no tiene fecha de publicación (FECPUB)" })
    await registrar("NO_DISPONIBLE", doc.cve, "Sin FECPUB: no es posible ubicar la edición")
    noDisponibles++
    procesados++
  }
  await progreso()

  for (const [fecha, docs] of porFecha) {
    try {
      await withBrowserSession(async (nav, download) => {
        const publicaciones = await fetchSumarioEnSesion(fecha, nav)
        const enlaces = new Map<string, string>()
        for (const p of publicaciones) if (p.pdfUrl && !enlaces.has(p.cve)) enlaces.set(p.cve, p.pdfUrl)

        for (const doc of docs) {
          const url = enlaces.get(doc.cve)
          if (!url) {
            await marcar(doc, "no_disponible", {
              ultimoError: `El CVE no aparece en el sumario del ${fecha}`,
            })
            await registrar("NO_DISPONIBLE", doc.cve, `No figura en el sumario del ${fecha}`)
            noDisponibles++
            procesados++
            continue
          }

          const errorValidacion = validarUrlPdf(url, doc.cve, fecha)
          if (errorValidacion) {
            await marcar(doc, "error", { urlOrigen: url, ultimoError: errorValidacion })
            await registrar("VALIDACION_FALLIDA", doc.cve, errorValidacion)
            errores++
            procesados++
            continue
          }

          try {
            const res = await download(url)
            if (res.status !== 200 || !esPdf(res.body, res.contentType)) {
              throw new Error(`Respuesta inválida (HTTP ${res.status}, ${res.contentType || "sin tipo"})`)
            }
            const [y, m] = fecha.split("-")
            const blob = await put(`diario-oficial/${y}/${m}/${doc.cve}.pdf`, res.body, {
              access: "public",
              contentType: "application/pdf",
              allowOverwrite: true,
            })
            await marcar(doc, "descargado", {
              urlOrigen: url,
              blobPathname: blob.pathname,
              tamanoBytes: res.body.length,
              fechaDescarga: new Date(),
              ultimoError: null,
            })
            await registrar("DESCARGA", doc.cve, `PDF descargado (${Math.round(res.body.length / 1024)} KB) desde ${url}`)
            descargados++
          } catch (error) {
            const mensaje = error instanceof Error ? error.message : String(error)
            await marcar(doc, "error", { urlOrigen: url, ultimoError: mensaje })
            await registrar("ERROR_DESCARGA", doc.cve, mensaje)
            errores++
          }
          procesados++
          await progreso()
        }
      })
    } catch (error) {
      // Falló la sesión o el sumario completo de la fecha: todos sus CVE quedan con error para
      // reintento, en vez de marcarlos como "no disponibles".
      const mensaje = error instanceof Error ? error.message : String(error)
      const pendientes = docs.slice(0)
      for (const doc of pendientes) {
        const [actual] = await db
          .select({ estado: documentosCve.estado })
          .from(documentosCve)
          .where(eq(documentosCve.id, doc.id))
        if (actual?.estado !== "pendiente" && actual?.estado !== "error") continue
        await marcar(doc, "error", { ultimoError: `No se pudo leer el sumario del ${fecha}: ${mensaje}` })
        errores++
        procesados++
      }
      await registrar("ERROR_SUMARIO", null, `${fecha}: ${mensaje}`)
    }
    await progreso()
    // Pausa entre fechas para no disparar el límite de tasa del sitio.
    await new Promise((r) => setTimeout(r, 1500))
  }

  await db
    .update(ejecucionesDescarga)
    .set({
      estado: "completada",
      fechaFin: new Date(),
      procesados,
      descargados,
      noDisponibles,
      errores,
    })
    .where(eq(ejecucionesDescarga.id, ejecucionId))
}

/** Sin actividad por este tiempo, una ejecución "en_progreso" se considera muerta (p. ej. reinicio del servidor). */
const SIN_ACTIVIDAD_MS = 10 * 60 * 1000

export async function cerrarEjecucionesHuerfanas() {
  await db
    .update(ejecucionesDescarga)
    .set({ estado: "interrumpida", fechaFin: new Date(), mensaje: "El proceso se interrumpió (sin actividad)" })
    .where(
      and(
        eq(ejecucionesDescarga.estado, "en_progreso"),
        lt(ejecucionesDescarga.actualizadoEn, new Date(Date.now() - SIN_ACTIVIDAD_MS)),
      ),
    )
}
