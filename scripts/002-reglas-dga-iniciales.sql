-- Reglas de clasificación DGA iniciales (14).
-- Ejecutar SOLO en una instalación nueva: si se ejecuta dos veces duplica las reglas.

INSERT INTO reglas_dga (nombre, campo, patron, efecto, tipo_procedimiento, origen, prioridad, activa) VALUES
  ('Acto administrativo emitido por la DGA', 'CUALQUIERA', '^\s*(EXTRACTO DE\s+)?(RESOLUCI[OÓ]N|DECRETO)\b|DIRECCI[OÓ]N GENERAL DE AGUAS\s+(RESUELVE|DECLARA|DISPONE|DENIEGA)|DECLARA\s+(AGOTAMIENTO|[AÁ]REA DE RESTRICCI|ZONA DE PROHIBICI)|REDUCCI[OÓ]N TEMPORAL', 'INCLUIR', 'Acto administrativo DGA', 'DGA', 10, true),
  ('Constitución de derecho', 'TIPOSOL', '^(CONSTITUCION|SOLICITUD DERECHO)$', 'INCLUIR', 'Constitución de derecho de aprovechamiento', NULL, 20, true),
  ('Regularización', 'TIPOSOL', 'REGULARIZACION', 'INCLUIR', 'Regularización (art. 2° transitorio)', NULL, 21, true),
  ('Traslado', 'TIPOSOL', 'TRASLADO', 'INCLUIR', 'Traslado del ejercicio / punto de captación', NULL, 22, true),
  ('Obras hidráulicas', 'TIPOSOL', 'OBRAS HIDRAULICAS', 'INCLUIR', 'Aprobación de obras hidráulicas', NULL, 23, true),
  ('Perfeccionamiento', 'TIPOSOL', 'PERFECCIONAMIENTO', 'INCLUIR', 'Perfeccionamiento de derechos', NULL, 24, true),
  ('Inscripción', 'TIPOSOL', 'INSCRIPCION', 'INCLUIR', 'Inscripción en Catastro Público de Aguas', NULL, 25, true),
  ('Rectificación', 'TIPOSOL', 'RECTIFICACION', 'INCLUIR', 'Rectificación', NULL, 26, true),
  ('Publicación art. 131', 'TITULO', 'ART[IÍ]CULO\s+131', 'INCLUIR', 'Publicación art. 131 Código de Aguas', NULL, 30, true),
  ('Título menciona Código de Aguas', 'TITULO', 'C[OÓ]DIGO DE AGUAS', 'INCLUIR', NULL, NULL, 40, true),
  ('Título de aprovechamiento de aguas', 'TITULO', 'APROVECHAMIENTO DE AGUAS|DERECHOS? DE AGUAS', 'INCLUIR', NULL, NULL, 41, true),
  ('Texto menciona la DGA', 'TEXTO', 'DIRECCI[OÓ]N GENERAL DE AGUAS|\bD\.?G\.?A\.?\b', 'INCLUIR', NULL, NULL, 42, true),
  ('Texto de solicitud de aguas', 'TEXTO', 'SOLICIT[AO]\w*.{0,120}AGUAS', 'INCLUIR', NULL, NULL, 43, true),
  ('Presentada por particular', 'TEXTO', '\bSOLICIT(A|O|AN|AMOS)\b|\bRUT\b', 'INCLUIR', NULL, 'PARTICULAR', 90, true);

