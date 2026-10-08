CREATE TABLE IF NOT EXISTS importaciones_dga (
  id serial PRIMARY KEY,
  nombre_archivo text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  total_registros integer NOT NULL DEFAULT 0,
  registros_dga integer NOT NULL DEFAULT 0,
  nuevos integer NOT NULL DEFAULT 0,
  actualizados integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documentos_cve (
  id serial PRIMARY KEY,
  cve text NOT NULL UNIQUE,
  fecha_publicacion date,
  estado text NOT NULL DEFAULT 'pendiente',
  url_origen text,
  blob_pathname text,
  tamano_bytes integer,
  fecha_descarga timestamptz,
  intentos integer NOT NULL DEFAULT 0,
  ultimo_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publicaciones_dga (
  id serial PRIMARY KEY,
  id_doe text NOT NULL UNIQUE,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS publicaciones_dga_cve_idx ON publicaciones_dga (cve);
CREATE INDEX IF NOT EXISTS publicaciones_dga_fecha_idx ON publicaciones_dga (fecha_publicacion);
CREATE INDEX IF NOT EXISTS publicaciones_dga_rut_idx ON publicaciones_dga (rut_normalizado);

CREATE TABLE IF NOT EXISTS reglas_dga (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  campo text NOT NULL,
  patron text NOT NULL,
  efecto text NOT NULL DEFAULT 'INCLUIR',
  tipo_procedimiento text,
  origen text,
  prioridad integer NOT NULL DEFAULT 100,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ejecuciones_descarga (
  id serial PRIMARY KEY,
  fecha_inicio timestamptz NOT NULL DEFAULT now(),
  fecha_fin timestamptz,
  estado text NOT NULL DEFAULT 'en_progreso',
  total integer NOT NULL DEFAULT 0,
  procesados integer NOT NULL DEFAULT 0,
  descargados integer NOT NULL DEFAULT 0,
  no_disponibles integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0,
  mensaje text
);

CREATE TABLE IF NOT EXISTS auditoria_documentos (
  id serial PRIMARY KEY,
  fecha timestamptz NOT NULL DEFAULT now(),
  accion text NOT NULL,
  cve text,
  detalle text,
  usuario text
);
CREATE INDEX IF NOT EXISTS auditoria_documentos_cve_idx ON auditoria_documentos (cve);

INSERT INTO reglas_dga (nombre, campo, patron, efecto, tipo_procedimiento, origen, prioridad)
SELECT * FROM (VALUES
  ('Acto administrativo emitido por la DGA', 'CUALQUIERA',
   '^\s*(EXTRACTO DE\s+)?(RESOLUCI[OÓ]N|DECRETO)\b|DIRECCI[OÓ]N GENERAL DE AGUAS\s+(RESUELVE|DECLARA|DISPONE|DENIEGA)|DECLARA\s+(AGOTAMIENTO|[AÁ]REA DE RESTRICCI|ZONA DE PROHIBICI)|REDUCCI[OÓ]N TEMPORAL',
   'INCLUIR', 'Acto administrativo DGA', 'DGA', 10),
  ('Constitución de derecho', 'TIPOSOL', '^(CONSTITUCION|SOLICITUD DERECHO)$', 'INCLUIR', 'Constitución de derecho de aprovechamiento', NULL, 20),
  ('Regularización', 'TIPOSOL', 'REGULARIZACION', 'INCLUIR', 'Regularización (art. 2° transitorio)', NULL, 21),
  ('Traslado', 'TIPOSOL', 'TRASLADO', 'INCLUIR', 'Traslado del ejercicio / punto de captación', NULL, 22),
  ('Obras hidráulicas', 'TIPOSOL', 'OBRAS HIDRAULICAS', 'INCLUIR', 'Aprobación de obras hidráulicas', NULL, 23),
  ('Perfeccionamiento', 'TIPOSOL', 'PERFECCIONAMIENTO', 'INCLUIR', 'Perfeccionamiento de derechos', NULL, 24),
  ('Inscripción', 'TIPOSOL', 'INSCRIPCION', 'INCLUIR', 'Inscripción en Catastro Público de Aguas', NULL, 25),
  ('Rectificación', 'TIPOSOL', 'RECTIFICACION', 'INCLUIR', 'Rectificación', NULL, 26),
  ('Publicación art. 131', 'TITULO', 'ART[IÍ]CULO\s+131', 'INCLUIR', 'Publicación art. 131 Código de Aguas', NULL, 30),
  ('Título menciona Código de Aguas', 'TITULO', 'C[OÓ]DIGO DE AGUAS', 'INCLUIR', NULL, NULL, 40),
  ('Título de aprovechamiento de aguas', 'TITULO', 'APROVECHAMIENTO DE AGUAS|DERECHOS? DE AGUAS', 'INCLUIR', NULL, NULL, 41),
  ('Texto menciona la DGA', 'TEXTO', 'DIRECCI[OÓ]N GENERAL DE AGUAS|\bD\.?G\.?A\.?\b', 'INCLUIR', NULL, NULL, 42),
  ('Texto de solicitud de aguas', 'TEXTO', 'SOLICIT[AO]\w*.{0,120}AGUAS', 'INCLUIR', NULL, NULL, 43),
  ('Presentada por particular', 'TEXTO', '\bSOLICIT(A|O|AN|AMOS)\b|\bRUT\b', 'INCLUIR', NULL, 'PARTICULAR', 90)
) AS v(nombre, campo, patron, efecto, tipo_procedimiento, origen, prioridad)
WHERE NOT EXISTS (SELECT 1 FROM reglas_dga);
