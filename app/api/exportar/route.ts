import { desc, eq } from "drizzle-orm"
import { utils, write } from "xlsx"
import { db } from "@/lib/db"
import { coincidencias, expedientes, publicaciones } from "@/lib/db/schema"

export const dynamic = "force-dynamic"

export async function GET() {
  const todosExpedientes = await db.select().from(expedientes).orderBy(desc(expedientes.updatedAt))

  const coincidenciasRows = await db
    .select({
      expedienteNumero: expedientes.numeroExpediente,
      publicacion: publicaciones,
      coincidencia: coincidencias,
    })
    .from(coincidencias)
    .innerJoin(expedientes, eq(expedientes.id, coincidencias.expedienteId))
    .innerJoin(publicaciones, eq(publicaciones.id, coincidencias.publicacionId))
    .orderBy(desc(coincidencias.score))

  const resumenSheet = utils.json_to_sheet(
    todosExpedientes.map((exp) => ({
      Expediente: exp.numeroExpediente,
      Solicitante: exp.solicitante ?? "",
      RUT: exp.rut ?? "",
      "Fecha Solicitud": exp.fechaSolicitud ?? "",
      "Fecha Asignación": exp.fechaAsignacion ?? "",
      Estado: exp.estado,
      Comentarios: exp.comentarios ?? "",
    })),
  )

  const detalleSheet = utils.json_to_sheet(
    coincidenciasRows.map(({ expedienteNumero, publicacion, coincidencia }) => ({
      Expediente: expedienteNumero,
      "Fecha Publicación": publicacion.fechaPublicacion ?? "",
      Edición: publicacion.numeroEdicion ?? "",
      "N° Resolución": publicacion.numeroResolucion ?? "",
      Título: publicacion.titulo ?? "",
      Materia: publicacion.materia ?? "",
      Clasificación: coincidencia.clasificacion,
      Score: coincidencia.score,
      "Estado Revisión": coincidencia.estado,
      URL: publicacion.url ?? "",
    })),
  )

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, resumenSheet, "Resumen Expedientes")
  utils.book_append_sheet(workbook, detalleSheet, "Detalle Resoluciones")

  const buffer = write(workbook, { type: "buffer", bookType: "xlsx" })

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="coincidencias_diario_oficial_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
