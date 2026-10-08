"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditoriaDocumentos, documentosCve, ejecucionesDescarga, reglasDga } from "@/lib/db/schema"
import { compilarPatron } from "@/lib/dga/clasificacion"
import { cerrarEjecucionesHuerfanas, documentosPorProcesar, ejecutarDescarga } from "@/lib/dga/descarga"
import { reclasificarTodo } from "@/lib/dga/import"

export interface EstadoDescarga {
  id: number
  estado: string
  total: number
  procesados: number
  descargados: number
  noDisponibles: number
  errores: number
  mensaje: string | null
}

/**
 * Inicia la descarga de PDFs pendientes en segundo plano. Si `cves` viene, solo procesa esos
 * (reintento manual). Un CVE ya descargado nunca se vuelve a descargar.
 */
export async function iniciarDescargaPdfs(cves?: string[]): Promise<{ ejecucionId: number | null; total: number }> {
  await cerrarEjecucionesHuerfanas()

  const [enCurso] = await db
    .select({ id: ejecucionesDescarga.id })
    .from(ejecucionesDescarga)
    .where(eq(ejecucionesDescarga.estado, "en_progreso"))
    .limit(1)
  if (enCurso) return { ejecucionId: enCurso.id, total: 0 }

  if (cves?.length) {
    // Reintento manual: reinicia el contador de intentos de esos CVE.
    for (const cve of cves) {
      await db
        .update(documentosCve)
        .set({ estado: "pendiente", intentos: 0, updatedAt: new Date() })
        .where(eq(documentosCve.cve, cve))
    }
  }

  const documentos = await documentosPorProcesar(cves)
  if (documentos.length === 0) return { ejecucionId: null, total: 0 }

  const [ejecucion] = await db
    .insert(ejecucionesDescarga)
    .values({ total: documentos.length })
    .returning({ id: ejecucionesDescarga.id })

  after(async () => {
    try {
      await ejecutarDescarga(ejecucion.id, documentos)
    } catch (error) {
      await db
        .update(ejecucionesDescarga)
        .set({ estado: "fallida", fechaFin: new Date(), mensaje: error instanceof Error ? error.message : String(error) })
        .where(eq(ejecucionesDescarga.id, ejecucion.id))
    }
  })

  return { ejecucionId: ejecucion.id, total: documentos.length }
}

export async function obtenerEstadoDescarga(ejecucionId: number): Promise<EstadoDescarga | null> {
  await cerrarEjecucionesHuerfanas()
  const [row] = await db.select().from(ejecucionesDescarga).where(eq(ejecucionesDescarga.id, ejecucionId))
  if (!row) return null
  if (row.estado !== "en_progreso") revalidatePath("/publicaciones")
  return {
    id: row.id,
    estado: row.estado,
    total: row.total,
    procesados: row.procesados,
    descargados: row.descargados,
    noDisponibles: row.noDisponibles,
    errores: row.errores,
    mensaje: row.mensaje,
  }
}

export interface ReglaInput {
  nombre: string
  campo: string
  patron: string
  efecto: string
  tipoProcedimiento: string | null
  origen: string | null
  prioridad: number
}

function validarRegla(input: ReglaInput): string | null {
  if (!input.nombre.trim()) return "La regla necesita un nombre."
  if (!["TITULO", "TIPOSOL", "TEXTO", "CUALQUIERA"].includes(input.campo)) return "Campo inválido."
  if (!["INCLUIR", "EXCLUIR"].includes(input.efecto)) return "Efecto inválido."
  if (input.origen && !["DGA", "PARTICULAR"].includes(input.origen)) return "Origen inválido."
  if (!input.patron.trim() || !compilarPatron(input.patron)) return "El patrón no es una expresión regular válida."
  if (!Number.isInteger(input.prioridad) || input.prioridad < 0 || input.prioridad > 10000) return "Prioridad inválida."
  return null
}

export async function crearRegla(input: ReglaInput): Promise<{ error?: string }> {
  const error = validarRegla(input)
  if (error) return { error }
  await db.insert(reglasDga).values({
    ...input,
    nombre: input.nombre.trim(),
    tipoProcedimiento: input.tipoProcedimiento?.trim() || null,
    origen: input.origen || null,
  })
  await db.insert(auditoriaDocumentos).values({ accion: "REGLA_CREADA", detalle: `${input.nombre}: /${input.patron}/` })
  revalidatePath("/publicaciones/reglas")
  return {}
}

export async function alternarRegla(id: number, activa: boolean) {
  await db.update(reglasDga).set({ activa }).where(eq(reglasDga.id, id))
  await db
    .insert(auditoriaDocumentos)
    .values({ accion: activa ? "REGLA_ACTIVADA" : "REGLA_DESACTIVADA", detalle: `Regla #${id}` })
  revalidatePath("/publicaciones/reglas")
}

export async function eliminarRegla(id: number) {
  await db.delete(reglasDga).where(eq(reglasDga.id, id))
  await db.insert(auditoriaDocumentos).values({ accion: "REGLA_ELIMINADA", detalle: `Regla #${id}` })
  revalidatePath("/publicaciones/reglas")
}

export async function reclasificar() {
  const resultado = await reclasificarTodo()
  revalidatePath("/publicaciones")
  return resultado
}
