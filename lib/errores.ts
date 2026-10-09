import { NextResponse } from "next/server"
import { type Logger, serializarError, type ErrorSerializado } from "@/lib/logger"

/**
 * Traduce errores técnicos (Postgres, sistema de archivos, red, Chromium) a un código estable,
 * un mensaje entendible y una sugerencia concreta de qué revisar en el servidor.
 */
export interface Diagnostico {
  codigo: string
  mensaje: string
  sugerencia: string
  detalle: string
}

function cadena(err: ErrorSerializado): ErrorSerializado[] {
  const lista: ErrorSerializado[] = []
  for (let e: ErrorSerializado | undefined = err; e; e = e.causa) lista.push(e)
  return lista
}

export function diagnosticarError(error: unknown): Diagnostico {
  const errores = cadena(serializarError(error))
  const codigos = new Set(errores.map((e) => e.codigo).filter(Boolean) as string[])
  const texto = errores.map((e) => e.mensaje).join(" | ")
  const conCodigo = (c: string) => errores.find((e) => e.codigo === c)
  const detalle = errores
    .map((e) => `${e.nombre}: ${e.mensaje}${e.codigo ? ` [${e.codigo}]` : ""}${e.detalle ? ` (${e.detalle})` : ""}`)
    .join(" ← ")
  const d = (codigo: string, mensaje: string, sugerencia: string): Diagnostico => ({ codigo, mensaje, sugerencia, detalle })

  // --- Configuración y base de datos ---
  if (!process.env.DATABASE_URL && (codigos.has("ECONNREFUSED") || /SASL|password must be a string/i.test(texto))) {
    return d("CONFIG_DATABASE_URL", "La variable DATABASE_URL no está definida.", "Defínela en el archivo .env del servidor y reinicia la aplicación.")
  }
  if (codigos.has("42P01")) {
    const tabla = texto.match(/relation "([^"]+)"/)?.[1]
    return d(
      "DB_TABLA_FALTANTE",
      `Falta la tabla ${tabla ?? "requerida"} en la base de datos.`,
      "Ejecuta los scripts SQL de la carpeta scripts/ en orden (ver docs/INSTALACION.md, sección Base de datos).",
    )
  }
  if (codigos.has("42703")) {
    const columna = texto.match(/column "([^"]+)"/)?.[1]
    return d(
      "DB_COLUMNA_FALTANTE",
      `Falta la columna ${columna ?? "requerida"}: la base de datos está desactualizada.`,
      "Ejecuta los scripts SQL más recientes de scripts/ (migraciones pendientes).",
    )
  }
  if (codigos.has("28P01") || codigos.has("28000")) {
    return d("DB_AUTENTICACION", "Usuario o contraseña de PostgreSQL rechazados.", "Revisa usuario y contraseña en DATABASE_URL y los permisos en pg_hba.conf.")
  }
  if (codigos.has("3D000")) {
    return d("DB_NO_EXISTE", "La base de datos indicada en DATABASE_URL no existe.", "Créala con CREATE DATABASE y ejecuta los scripts de scripts/.")
  }
  if (codigos.has("42501")) {
    return d("DB_PERMISOS", "El usuario de PostgreSQL no tiene permisos sobre la tabla.", "Otorga permisos: GRANT ALL ON ALL TABLES IN SCHEMA public TO <usuario>; y lo mismo para SEQUENCES.")
  }
  if (/self[- ]signed certificate|does not support SSL|SSL connection|certificate/i.test(texto)) {
    return d("DB_SSL", "Error de SSL al conectar con PostgreSQL.", "Ajusta sslmode en DATABASE_URL (p. ej. ?sslmode=disable en red interna, o require con certificado válido).")
  }
  if (codigos.has("53300")) {
    return d("DB_DEMASIADAS_CONEXIONES", "PostgreSQL rechazó la conexión: demasiados clientes.", "Aumenta max_connections o reduce instancias de la aplicación.")
  }

  // --- Red ---
  const rechazada = conCodigo("ECONNREFUSED")
  if (rechazada) {
    const destino = rechazada.direccion ? `${rechazada.direccion}:${rechazada.puerto ?? ""}` : "el servicio"
    const esDb = rechazada.puerto === 5432 || /5432/.test(texto)
    return d(
      esDb ? "DB_SIN_CONEXION" : "CONEXION_RECHAZADA",
      `Conexión rechazada a ${destino}.`,
      esDb ? "Verifica que PostgreSQL esté corriendo y que host/puerto de DATABASE_URL sean correctos." : "Verifica que el servicio de destino esté levantado y accesible desde este servidor.",
    )
  }
  if (codigos.has("ENOTFOUND") || codigos.has("EAI_AGAIN")) {
    return d("DNS", "No se pudo resolver un nombre de host.", "Revisa el DNS del servidor y que el host (BD o www.diariooficial.interior.gob.cl) sea alcanzable.")
  }
  if (codigos.has("ETIMEDOUT") || codigos.has("ECONNRESET") || /timeout|timed out/i.test(texto)) {
    return d("TIEMPO_AGOTADO", "Tiempo de espera agotado en una conexión de red.", "Revisa firewall/proxy de salida del servidor y la conectividad hacia la BD y el Diario Oficial.")
  }

  // --- Sistema de archivos ---
  const fs = errores.find((e) => ["EACCES", "EPERM", "ENOSPC", "EROFS"].includes(e.codigo ?? ""))
  if (fs) {
    const ruta = fs.ruta ?? process.env.PDF_STORAGE_DIR ?? "storage/pdfs"
    if (fs.codigo === "ENOSPC") return d("DISCO_LLENO", `Sin espacio en disco al escribir ${ruta}.`, "Libera espacio o mueve PDF_STORAGE_DIR a otro volumen.")
    if (fs.codigo === "EROFS") return d("DISCO_SOLO_LECTURA", `El sistema de archivos de ${ruta} es de solo lectura.`, "Usa una carpeta con escritura en PDF_STORAGE_DIR.")
    return d("ALMACENAMIENTO_PERMISOS", `Sin permisos para escribir en ${ruta}.`, "Da permisos al usuario del proceso: chown -R <usuario> <PDF_STORAGE_DIR>.")
  }

  // --- Navegador (Chromium/Playwright) ---
  if (/error while loading shared libraries|libnss3|libatk|libgbm/i.test(texto)) {
    return d("NAVEGADOR_LIBRERIAS", "A Chromium le faltan librerías del sistema.", "Instálalas con: npx playwright install-deps chromium (o los paquetes libnss3, libatk-bridge2.0-0, libgbm1).")
  }
  if (/Executable doesn't exist|ENOENT.*chrom|Failed to launch|browserType\.launch/i.test(texto)) {
    return d(
      "NAVEGADOR_NO_INICIA",
      "No se pudo iniciar Chromium.",
      "Define CHROMIUM_EXECUTABLE_PATH con la ruta del Chrome/Chromium instalado (p. ej. /usr/bin/chromium) y verifica que se ejecute.",
    )
  }
  if (/Target (page, context or browser )?closed|Browser has been closed/i.test(texto)) {
    return d("NAVEGADOR_CERRADO", "Chromium se cerró inesperadamente.", "Revisa la memoria disponible (se recomienda >= 1 GB libre) y los logs del sistema (dmesg, OOM killer).")
  }

  // --- Almacenamiento Blob / sitio externo ---
  if (/BLOB_READ_WRITE_TOKEN|No token found|BlobAccessError/i.test(texto)) {
    return d("BLOB_TOKEN", "Vercel Blob no está configurado.", "En un servidor propio define STORAGE_DRIVER=local y PDF_STORAGE_DIR.")
  }
  if (/HTTP (403|429)|ERR_EMPTY_RESPONSE/i.test(texto)) {
    return d("SITIO_BLOQUEO", "El Diario Oficial rechazó o limitó las peticiones.", "Espera unos minutos y reintenta; verifica que la IP del servidor no esté bloqueada.")
  }

  const primero = errores[0]
  return d("ERROR_INTERNO", primero?.mensaje || "Error desconocido", "Revisa los logs del servidor buscando la referencia indicada.")
}

/** Texto corto para guardar en columnas como `ultimo_error`. */
export function resumenError(error: unknown): string {
  const diag = diagnosticarError(error)
  return diag.codigo === "ERROR_INTERNO" ? diag.mensaje : `[${diag.codigo}] ${diag.mensaje}`
}

export interface CuerpoError {
  error: string
  codigo: string
  sugerencia: string
  requestId: string
  detalle?: string
}

/** Registra el error con su diagnóstico y responde JSON uniforme con requestId para rastrear en logs. */
export function respuestaError(
  error: unknown,
  { log, requestId, evento, status = 500, extra = {} }: { log: Logger; requestId: string; evento: string; status?: number; extra?: Record<string, unknown> },
) {
  const diag = diagnosticarError(error)
  log.error(evento, { codigo: diag.codigo, sugerencia: diag.sugerencia }, error)
  const cuerpo: CuerpoError = {
    error: diag.mensaje,
    codigo: diag.codigo,
    sugerencia: diag.sugerencia,
    requestId,
    ...(process.env.OCULTAR_DETALLE_ERRORES === "true" ? {} : { detalle: diag.detalle }),
  }
  return NextResponse.json({ ...extra, ...cuerpo }, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } })
}
