"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { coincidencias, ejecucionesScraping, expedientes, publicaciones, auditoria } from "@/lib/db/schema"
import { calcularCoincidencia, estadoDesdeClasificacion, ESTADO_EXPEDIENTE } from "@/lib/matching"
import { diarioOficialProvider } from "@/lib/diario-oficial/scraping-provider"

export interface BusquedaSummary {
  publicacionesEncontradas: number
  publicacionesNuevas: number
  coincidenciasGeneradas: number
  expedientesActualizados: number
  /**
   * Fechas dentro del rango consultado que terminaron en ERROR DE CONSULTA (ej. cambio de
   * estructura del sitio, bloqueo del navegador headless). Deben mostrarse al usuario para que
   * pueda reintentar esas fechas puntuales; nunca deben interpretarse como "sin publicaciones".
   */
  fechasConError: string[]
  error?: string
}

export async function ejecutarBusqueda(desde: string, hasta: string): Promise<BusquedaSummary> {
  const [ejecucion] = await db
    .insert(ejecucionesScraping)
    .values({ edicion: `${desde} a ${hasta}`, estado: "en_progreso" })
    .returning({ id: ejecucionesScraping.id })

  try {
    const { publicaciones: resultados, fechasConError } = await diarioOficialProvider.search({ desde, hasta })

    let publicacionesNuevas = 0
    const publicacionIds: number[] = []

    for (const raw of resultados) {
      const existing = await db.select({ id: publicaciones.id }).from(publicaciones).where(eq(publicaciones.cve, raw.cve)).limit(1)

      if (existing.length > 0) {
        publicacionIds.push(existing[0].id)
        continue
      }

      const [inserted] = await db
        .insert(publicaciones)
        .values({
          fechaPublicacion: raw.fechaPublicacion,
          numeroEdicion: raw.numeroEdicion,
          seccion: raw.seccion,
          ministerio: raw.ministerio,
          organismo: raw.organismo,
          categoria: raw.categoria,
          esCandidataDga: raw.esCandidataDga,
          titulo: raw.titulo,
          materia: raw.materia,
          extracto: raw.extracto,
          region: raw.region,
          provincia: raw.provincia,
          comuna: raw.comuna,
          comunaNormalizada: raw.comuna ? raw.comuna.toUpperCase() : null,
          tipoSolicitud: raw.tipoSolicitud,
          fuenteAgua: raw.fuenteAgua,
          caudal: raw.caudal,
          coordenadas: raw.coordenadas,
          cve: raw.cve,
          url: raw.url,
          pdfUrl: raw.pdfUrl,
          texto: raw.titulo,
          numeroResolucion: raw.numeroResolucion,
          numeroExpedienteDetectado: raw.numeroExpedienteDetectado,
          rutDetectado: raw.rutDetectado,
          nombreInteresadoDetectado: raw.nombreInteresadoDetectado,
        })
        .onConflictDoNothing({ target: publicaciones.cve })
        .returning({ id: publicaciones.id })

      if (inserted) {
        publicacionIds.push(inserted.id)
        publicacionesNuevas++
      }
    }

    const coincidenciasGeneradas = await generarCoincidencias(publicacionIds)

    await db
      .update(ejecucionesScraping)
      .set({
        fechaFin: new Date(),
        publicacionesEncontradas: resultados.length,
        publicacionesNuevas,
        coincidenciasGeneradas,
        estado: fechasConError.length > 0 ? "completado_con_errores" : "completado",
        errores:
          fechasConError.length > 0
            ? `ERROR DE CONSULTA en las siguientes fechas (no se pudieron revisar, no asumir que no tienen publicaciones): ${fechasConError.join(", ")}`
            : null,
      })
      .where(eq(ejecucionesScraping.id, ejecucion.id))

    revalidatePath("/")

    return {
      publicacionesEncontradas: resultados.length,
      publicacionesNuevas,
      coincidenciasGeneradas,
      expedientesActualizados: coincidenciasGeneradas,
      fechasConError,
    }
  } catch (error) {
    await db
      .update(ejecucionesScraping)
      .set({
        fechaFin: new Date(),
        estado: "error",
        errores: error instanceof Error ? error.message : String(error),
      })
      .where(eq(ejecucionesScraping.id, ejecucion.id))

    return {
      publicacionesEncontradas: 0,
      publicacionesNuevas: 0,
      coincidenciasGeneradas: 0,
      expedientesActualizados: 0,
      fechasConError: [],
      error: error instanceof Error ? error.message : "Error ejecutando la búsqueda.",
    }
  }
}

/** Ejecuta el motor de coincidencias de un conjunto de publicaciones contra todos los expedientes activos. */
async function generarCoincidencias(publicacionIds: number[]): Promise<number> {
  if (publicacionIds.length === 0) return 0

  const todosExpedientes = await db.select().from(expedientes)
  const nuevasPublicaciones = await db.select().from(publicaciones).where(inArray(publicaciones.id, publicacionIds))

  let generadas = 0
  const expedientesActualizados = new Map<number, string>()

  for (const exp of todosExpedientes) {
    for (const pub of nuevasPublicaciones) {
      const resultado = calcularCoincidencia(
        {
          id: exp.id,
          numeroExpedienteNormalizado: exp.numeroExpedienteNormalizado,
          solicitanteNormalizado: exp.solicitanteNormalizado,
          rutNormalizado: exp.rutNormalizado,
          comuna: exp.comuna,
          fuenteAgua: exp.fuenteAgua,
        },
        pub,
      )

      if (resultado.clasificacion === "sin_coincidencia") continue

      await db
        .insert(coincidencias)
        .values({
          expedienteId: exp.id,
          publicacionId: pub.id,
          score: resultado.score,
          coincidenciaExpediente: resultado.coincidenciaExpediente,
          coincidenciaRut: resultado.coincidenciaRut,
          similitudNombre: resultado.similitudNombre,
          coincidenciaResolucion: resultado.coincidenciaResolucion,
          clasificacion: resultado.clasificacion,
          motivos: resultado.motivos,
        })
        .onConflictDoUpdate({
          target: [coincidencias.expedienteId, coincidencias.publicacionId],
          set: {
            score: resultado.score,
            coincidenciaExpediente: resultado.coincidenciaExpediente,
            coincidenciaRut: resultado.coincidenciaRut,
            similitudNombre: resultado.similitudNombre,
            coincidenciaResolucion: resultado.coincidenciaResolucion,
            clasificacion: resultado.clasificacion,
            motivos: resultado.motivos,
          },
        })

      generadas++
      const estadoActual = expedientesActualizados.get(exp.id)
      const estadoNuevo = estadoDesdeClasificacion(resultado.clasificacion)
      if (!estadoActual || prioridadEstado(estadoNuevo) > prioridadEstado(estadoActual)) {
        expedientesActualizados.set(exp.id, estadoNuevo)
      }
    }
  }

  for (const [expedienteId, estado] of expedientesActualizados) {
    await db.update(expedientes).set({ estado, updatedAt: new Date() }).where(eq(expedientes.id, expedienteId))
  }

  return generadas
}

function prioridadEstado(estado: string): number {
  const orden = [
    ESTADO_EXPEDIENTE.SIN_COINCIDENCIA,
    ESTADO_EXPEDIENTE.POSIBLE,
    ESTADO_EXPEDIENTE.REVISION,
    ESTADO_EXPEDIENTE.CONFIRMADA,
  ]
  return orden.indexOf(estado as (typeof orden)[number])
}

export async function confirmarCoincidencia(coincidenciaId: number) {
  const [coincidencia] = await db.select().from(coincidencias).where(eq(coincidencias.id, coincidenciaId)).limit(1)
  if (!coincidencia) return

  await db
    .update(coincidencias)
    .set({ estado: "confirmada", fechaRevision: new Date() })
    .where(eq(coincidencias.id, coincidenciaId))

  await db
    .update(expedientes)
    .set({ estado: ESTADO_EXPEDIENTE.CONFIRMADA, updatedAt: new Date() })
    .where(eq(expedientes.id, coincidencia.expedienteId))

  await db.insert(auditoria).values({
    accion: "confirmar_coincidencia",
    expedienteId: coincidencia.expedienteId,
    publicacionId: coincidencia.publicacionId,
    resultadoAnterior: coincidencia.estado,
    resultadoNuevo: "confirmada",
  })

  revalidatePath("/")
  revalidatePath(`/expedientes/${coincidencia.expedienteId}`)
}

export async function rechazarCoincidencia(coincidenciaId: number) {
  const [coincidencia] = await db.select().from(coincidencias).where(eq(coincidencias.id, coincidenciaId)).limit(1)
  if (!coincidencia) return

  await db
    .update(coincidencias)
    .set({ estado: "rechazada", fechaRevision: new Date() })
    .where(eq(coincidencias.id, coincidenciaId))

  await db.insert(auditoria).values({
    accion: "rechazar_coincidencia",
    expedienteId: coincidencia.expedienteId,
    publicacionId: coincidencia.publicacionId,
    resultadoAnterior: coincidencia.estado,
    resultadoNuevo: "rechazada",
  })

  const remaining = await db
    .select()
    .from(coincidencias)
    .where(and(eq(coincidencias.expedienteId, coincidencia.expedienteId), eq(coincidencias.estado, "pendiente")))

  if (remaining.length === 0) {
    await db
      .update(expedientes)
      .set({ estado: ESTADO_EXPEDIENTE.SIN_COINCIDENCIA, updatedAt: new Date() })
      .where(eq(expedientes.id, coincidencia.expedienteId))
  }

  revalidatePath("/")
  revalidatePath(`/expedientes/${coincidencia.expedienteId}`)
}

export async function eliminarExpediente(id: number) {
  await db.delete(coincidencias).where(eq(coincidencias.expedienteId, id))
  await db.delete(expedientes).where(eq(expedientes.id, id))
  revalidatePath("/")
}

export async function obtenerEstadisticas() {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      pendientes: sql<number>`count(*) filter (where ${expedientes.estado} = ${ESTADO_EXPEDIENTE.PENDIENTE})`,
      confirmadas: sql<number>`count(*) filter (where ${expedientes.estado} = ${ESTADO_EXPEDIENTE.CONFIRMADA})`,
      revision: sql<number>`count(*) filter (where ${expedientes.estado} = ${ESTADO_EXPEDIENTE.REVISION})`,
      sinCoincidencia: sql<number>`count(*) filter (where ${expedientes.estado} = ${ESTADO_EXPEDIENTE.SIN_COINCIDENCIA})`,
    })
    .from(expedientes)

  return stats
}
