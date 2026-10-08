import { asc, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { auditoriaDocumentos, documentosCve, importacionesDga, publicacionesDga, reglasDga } from "@/lib/db/schema"
import { normalizeRut } from "@/lib/normalize"
import { clasificar, type ReglaDga } from "./clasificacion"
import { parsearExcelPublicaciones } from "./excel"

export interface ResumenImportacionDga {
  error?: string
  archivo?: string
  total: number
  dga: number
  nuevos: number
  actualizados: number
  documentosNuevos: number
}

export async function obtenerReglas(): Promise<ReglaDga[]> {
  return db.select().from(reglasDga).orderBy(asc(reglasDga.prioridad), asc(reglasDga.id))
}

const LOTE = 200

export async function importarExcelDga(file: File): Promise<ResumenImportacionDga> {
  const vacio = { total: 0, dga: 0, nuevos: 0, actualizados: 0, documentosNuevos: 0 }
  if (!/\.xlsx$/i.test(file.name)) return { ...vacio, error: "El archivo debe ser .xlsx" }

  let filas
  try {
    filas = parsearExcelPublicaciones(await file.arrayBuffer())
  } catch {
    return { ...vacio, error: "No se pudo leer el archivo Excel." }
  }
  if (filas.length === 0) {
    return { ...vacio, error: "El archivo no tiene filas con la columna ID_DOE." }
  }

  const reglas = await obtenerReglas()
  const [importacion] = await db
    .insert(importacionesDga)
    .values({ nombreArchivo: file.name, totalRegistros: filas.length })
    .returning({ id: importacionesDga.id })

  const existentes = new Set(
    (
      await db
        .select({ idDoe: publicacionesDga.idDoe })
        .from(publicacionesDga)
        .where(inArray(publicacionesDga.idDoe, filas.map((f) => f.idDoe)))
    ).map((r) => r.idDoe),
  )

  let dga = 0
  const documentos = new Map<string, string | null>()

  const registros = filas.map((fila) => {
    const c = clasificar(fila, reglas)
    if (c.esDga) {
      dga++
      if (fila.cve && !documentos.has(fila.cve)) documentos.set(fila.cve, fila.fechaPublicacion)
    }
    return {
      idDoe: fila.idDoe,
      cve: fila.cve,
      fechaPublicacion: fila.fechaPublicacion,
      cuerpo: fila.cuerpo,
      titulo: fila.titulo,
      tiposol: fila.tiposol,
      solicitante: fila.solicitante,
      rut: fila.rut,
      rutNormalizado: normalizeRut(fila.rut) || null,
      region: fila.region,
      provincia: fila.provincia,
      comuna: fila.comuna,
      texto: fila.texto,
      datosOriginales: fila.datosOriginales,
      esDga: c.esDga,
      tipoProcedimiento: c.tipoProcedimiento,
      origen: c.origen,
      reglasAplicadas: c.reglasAplicadas,
      importacionId: importacion.id,
    }
  })

  for (let i = 0; i < registros.length; i += LOTE) {
    await db
      .insert(publicacionesDga)
      .values(registros.slice(i, i + LOTE))
      .onConflictDoUpdate({
        target: publicacionesDga.idDoe,
        set: {
          cve: sql`excluded.cve`,
          fechaPublicacion: sql`excluded.fecha_publicacion`,
          cuerpo: sql`excluded.cuerpo`,
          titulo: sql`excluded.titulo`,
          tiposol: sql`excluded.tiposol`,
          solicitante: sql`excluded.solicitante`,
          rut: sql`excluded.rut`,
          rutNormalizado: sql`excluded.rut_normalizado`,
          region: sql`excluded.region`,
          provincia: sql`excluded.provincia`,
          comuna: sql`excluded.comuna`,
          texto: sql`excluded.texto`,
          datosOriginales: sql`excluded.datos_originales`,
          esDga: sql`excluded.es_dga`,
          tipoProcedimiento: sql`excluded.tipo_procedimiento`,
          origen: sql`excluded.origen`,
          reglasAplicadas: sql`excluded.reglas_aplicadas`,
          importacionId: sql`excluded.importacion_id`,
          updatedAt: sql`now()`,
        },
      })
  }

  // Un documento por CVE: si ya existe (ej. otra fila u otro Excel con el mismo CVE) se conserva
  // su estado y no se vuelve a descargar.
  let documentosNuevos = 0
  const docs = [...documentos.entries()].map(([cve, fechaPublicacion]) => ({ cve, fechaPublicacion }))
  for (let i = 0; i < docs.length; i += LOTE) {
    const insertados = await db
      .insert(documentosCve)
      .values(docs.slice(i, i + LOTE))
      .onConflictDoNothing({ target: documentosCve.cve })
      .returning({ id: documentosCve.id })
    documentosNuevos += insertados.length
  }

  const nuevos = registros.filter((r) => !existentes.has(r.idDoe)).length
  const actualizados = registros.length - nuevos

  await db
    .update(importacionesDga)
    .set({ registrosDga: dga, nuevos, actualizados })
    .where(sql`${importacionesDga.id} = ${importacion.id}`)

  await db.insert(auditoriaDocumentos).values({
    accion: "IMPORTACION_EXCEL",
    detalle: `${file.name}: ${filas.length} registros, ${dga} DGA, ${nuevos} nuevos, ${actualizados} actualizados, ${documentosNuevos} CVE nuevos por descargar`,
  })

  return { archivo: file.name, total: filas.length, dga, nuevos, actualizados, documentosNuevos }
}

/** Vuelve a aplicar las reglas vigentes a todos los registros importados. */
export async function reclasificarTodo(): Promise<{ total: number; dga: number; documentosNuevos: number }> {
  const reglas = await obtenerReglas()
  const filas = await db
    .select({
      id: publicacionesDga.id,
      cve: publicacionesDga.cve,
      fechaPublicacion: publicacionesDga.fechaPublicacion,
      titulo: publicacionesDga.titulo,
      tiposol: publicacionesDga.tiposol,
      texto: publicacionesDga.texto,
      solicitante: publicacionesDga.solicitante,
      rut: publicacionesDga.rut,
    })
    .from(publicacionesDga)

  let dga = 0
  const documentos = new Map<string, string | null>()
  for (const fila of filas) {
    const c = clasificar(fila, reglas)
    if (c.esDga) {
      dga++
      if (fila.cve && !documentos.has(fila.cve)) documentos.set(fila.cve, fila.fechaPublicacion)
    }
    await db
      .update(publicacionesDga)
      .set({
        esDga: c.esDga,
        tipoProcedimiento: c.tipoProcedimiento,
        origen: c.origen,
        reglasAplicadas: c.reglasAplicadas,
        updatedAt: new Date(),
      })
      .where(sql`${publicacionesDga.id} = ${fila.id}`)
  }

  let documentosNuevos = 0
  const docs = [...documentos.entries()].map(([cve, fechaPublicacion]) => ({ cve, fechaPublicacion }))
  for (let i = 0; i < docs.length; i += LOTE) {
    const insertados = await db
      .insert(documentosCve)
      .values(docs.slice(i, i + LOTE))
      .onConflictDoNothing({ target: documentosCve.cve })
      .returning({ id: documentosCve.id })
    documentosNuevos += insertados.length
  }

  await db.insert(auditoriaDocumentos).values({
    accion: "RECLASIFICACION",
    detalle: `${filas.length} registros reclasificados, ${dga} DGA, ${documentosNuevos} CVE nuevos`,
  })

  return { total: filas.length, dga, documentosNuevos }
}
