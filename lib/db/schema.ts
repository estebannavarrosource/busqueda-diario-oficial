import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core"

export const expedientes = pgTable("expedientes", {
  id: serial("id").primaryKey(),
  numeroExpediente: text("numero_expediente").notNull(),
  numeroExpedienteNormalizado: text("numero_expediente_normalizado").notNull(),
  solicitante: text("solicitante"),
  solicitanteNormalizado: text("solicitante_normalizado"),
  rut: text("rut"),
  rutNormalizado: text("rut_normalizado"),
  fechaSolicitud: date("fecha_solicitud"),
  fechaAsignacion: date("fecha_asignacion"),
  comentarios: text("comentarios"),
  estado: text("estado").notNull().default("Pendiente de búsqueda"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const publicaciones = pgTable("publicaciones", {
  id: serial("id").primaryKey(),
  fechaPublicacion: date("fecha_publicacion"),
  numeroEdicion: text("numero_edicion"),
  seccion: text("seccion"),
  organismo: text("organismo"),
  titulo: text("titulo"),
  materia: text("materia"),
  cve: text("cve").unique(),
  url: text("url"),
  pdfUrl: text("pdf_url"),
  texto: text("texto"),
  numeroResolucion: text("numero_resolucion"),
  fechaResolucion: date("fecha_resolucion"),
  numeroExpedienteDetectado: text("numero_expediente_detectado"),
  rutDetectado: text("rut_detectado"),
  nombreInteresadoDetectado: text("nombre_interesado_detectado"),
  fechaCaptura: timestamp("fecha_captura", { withTimezone: true }).notNull().defaultNow(),
  hashDocumento: text("hash_documento"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const coincidencias = pgTable(
  "coincidencias",
  {
    id: serial("id").primaryKey(),
    expedienteId: integer("expediente_id").notNull(),
    publicacionId: integer("publicacion_id").notNull(),
    score: integer("score").notNull().default(0),
    coincidenciaExpediente: boolean("coincidencia_expediente").notNull().default(false),
    coincidenciaRut: boolean("coincidencia_rut").notNull().default(false),
    similitudNombre: integer("similitud_nombre").notNull().default(0),
    coincidenciaResolucion: boolean("coincidencia_resolucion").notNull().default(false),
    clasificacion: text("clasificacion").notNull().default("sin_coincidencia"),
    estado: text("estado").notNull().default("pendiente"),
    revisadoPor: text("revisado_por"),
    fechaRevision: timestamp("fecha_revision", { withTimezone: true }),
    motivos: jsonb("motivos"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.expedienteId, table.publicacionId)],
)

export const ejecucionesScraping = pgTable("ejecuciones_scraping", {
  id: serial("id").primaryKey(),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull().defaultNow(),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }),
  edicion: text("edicion"),
  publicacionesEncontradas: integer("publicaciones_encontradas").notNull().default(0),
  publicacionesNuevas: integer("publicaciones_nuevas").notNull().default(0),
  coincidenciasGeneradas: integer("coincidencias_generadas").notNull().default(0),
  errores: text("errores"),
  estado: text("estado").notNull().default("en_progreso"),
})

export const auditoria = pgTable("auditoria", {
  id: serial("id").primaryKey(),
  usuario: text("usuario"),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  accion: text("accion").notNull(),
  expedienteId: integer("expediente_id"),
  publicacionId: integer("publicacion_id"),
  resultadoAnterior: text("resultado_anterior"),
  resultadoNuevo: text("resultado_nuevo"),
})
