-- Esquema completo de la base de datos (PostgreSQL 15+).
-- Idempotente: puede ejecutarse varias veces sin perder datos.

CREATE TABLE IF NOT EXISTS auditoria (
  id serial NOT NULL,
  usuario text,
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  accion text NOT NULL,
  expediente_id integer,
  publicacion_id integer,
  resultado_anterior text,
  resultado_nuevo text,
  CONSTRAINT auditoria_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auditoria_documentos (
  id serial NOT NULL,
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  accion text NOT NULL,
  cve text,
  detalle text,
  usuario text,
  CONSTRAINT auditoria_documentos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS coincidencias (
  id serial NOT NULL,
  expediente_id integer NOT NULL,
  publicacion_id integer NOT NULL,
  score integer NOT NULL DEFAULT 0,
  coincidencia_expediente boolean NOT NULL DEFAULT false,
  coincidencia_rut boolean NOT NULL DEFAULT false,
  similitud_nombre integer NOT NULL DEFAULT 0,
  coincidencia_resolucion boolean NOT NULL DEFAULT false,
  clasificacion text NOT NULL DEFAULT 'sin_coincidencia'::text,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  revisado_por text,
  fecha_revision timestamp with time zone,
  motivos jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT coincidencias_expediente_id_publicacion_id_key UNIQUE (expediente_id, publicacion_id),
  CONSTRAINT coincidencias_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS documentos_cve (
  id serial NOT NULL,
  cve text NOT NULL,
  fecha_publicacion date,
  estado text NOT NULL DEFAULT 'pendiente'::text,
  url_origen text,
  blob_pathname text,
  tamano_bytes integer,
  fecha_descarga timestamp with time zone,
  intentos integer NOT NULL DEFAULT 0,
  ultimo_error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT documentos_cve_cve_key UNIQUE (cve),
  CONSTRAINT documentos_cve_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ejecuciones_descarga (
  id serial NOT NULL,
  fecha_inicio timestamp with time zone NOT NULL DEFAULT now(),
  fecha_fin timestamp with time zone,
  estado text NOT NULL DEFAULT 'en_progreso'::text,
  total integer NOT NULL DEFAULT 0,
  procesados integer NOT NULL DEFAULT 0,
  descargados integer NOT NULL DEFAULT 0,
  no_disponibles integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0,
  mensaje text,
  actualizado_en timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ejecuciones_descarga_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ejecuciones_scraping (
  id serial NOT NULL,
  fecha_inicio timestamp with time zone NOT NULL DEFAULT now(),
  fecha_fin timestamp with time zone,
  edicion text,
  publicaciones_encontradas integer NOT NULL DEFAULT 0,
  publicaciones_nuevas integer NOT NULL DEFAULT 0,
  coincidencias_generadas integer NOT NULL DEFAULT 0,
  errores text,
  estado text NOT NULL DEFAULT 'en_progreso'::text,
  fechas_con_error jsonb,
  CONSTRAINT ejecuciones_scraping_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS expedientes (
  id serial NOT NULL,
  numero_expediente text NOT NULL,
  numero_expediente_normalizado text NOT NULL,
  solicitante text,
  solicitante_normalizado text,
  rut text,
  rut_normalizado text,
  fecha_solicitud date,
  fecha_asignacion date,
  comentarios text,
  estado text NOT NULL DEFAULT 'Pendiente de búsqueda'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  region text,
  provincia text,
  comuna text,
  comuna_normalizada text,
  tipo_solicitud text,
  fuente_agua text,
  caudal text,
  CONSTRAINT expedientes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS importaciones_dga (
  id serial NOT NULL,
  nombre_archivo text NOT NULL,
  fecha timestamp with time zone NOT NULL DEFAULT now(),
  total_registros integer NOT NULL DEFAULT 0,
  registros_dga integer NOT NULL DEFAULT 0,
  nuevos integer NOT NULL DEFAULT 0,
  actualizados integer NOT NULL DEFAULT 0,
  CONSTRAINT importaciones_dga_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id serial NOT NULL,
  fecha_publicacion date,
  numero_edicion text,
  seccion text,
  organismo text,
  titulo text,
  materia text,
  cve text,
  url text,
  pdf_url text,
  texto text,
  numero_resolucion text,
  fecha_resolucion date,
  numero_expediente_detectado text,
  rut_detectado text,
  nombre_interesado_detectado text,
  fecha_captura timestamp with time zone NOT NULL DEFAULT now(),
  hash_documento text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  ministerio text,
  categoria text,
  es_candidata_dga boolean NOT NULL DEFAULT false,
  extracto text,
  region text,
  provincia text,
  comuna text,
  comuna_normalizada text,
  tipo_solicitud text,
  fuente_agua text,
  caudal text,
  coordenadas text,
  CONSTRAINT publicaciones_cve_key UNIQUE (cve),
  CONSTRAINT publicaciones_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS publicaciones_dga (
  id serial NOT NULL,
  id_doe text NOT NULL,
  cve text,
  fecha_publicacion date,
  cuerpo integer,
  titulo text,
  tiposol text,
  solicitante text,
  rut text,
  rut_normalizado text,
  region text,
  provincia text,
  comuna text,
  texto text,
  datos_originales jsonb NOT NULL,
  es_dga boolean NOT NULL DEFAULT false,
  tipo_procedimiento text,
  origen text,
  reglas_aplicadas jsonb,
  importacion_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT publicaciones_dga_id_doe_key UNIQUE (id_doe),
  CONSTRAINT publicaciones_dga_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reglas_dga (
  id serial NOT NULL,
  nombre text NOT NULL,
  campo text NOT NULL,
  patron text NOT NULL,
  efecto text NOT NULL DEFAULT 'INCLUIR'::text,
  tipo_procedimiento text,
  origen text,
  prioridad integer NOT NULL DEFAULT 100,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reglas_dga_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS auditoria_documentos_cve_idx ON public.auditoria_documentos USING btree (cve);
CREATE INDEX IF NOT EXISTS publicaciones_dga_cve_idx ON public.publicaciones_dga USING btree (cve);
CREATE INDEX IF NOT EXISTS publicaciones_dga_fecha_idx ON public.publicaciones_dga USING btree (fecha_publicacion);
CREATE INDEX IF NOT EXISTS publicaciones_dga_rut_idx ON public.publicaciones_dga USING btree (rut_normalizado);

