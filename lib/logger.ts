/**
 * Logger estructurado para el servidor.
 * - LOG_LEVEL: debug | info | warn | error (por defecto "info").
 * - LOG_FORMAT: "json" emite una línea JSON por evento (útil con journald, Loki, ELK);
 *   cualquier otro valor emite texto legible.
 * Cada línea incluye fecha ISO, nivel, módulo, evento y contexto (requestId, CVE, fecha, etc.),
 * para poder filtrar con `grep req=ab12cd34` o `journalctl -u ... | grep cve=`.
 */
type Nivel = "debug" | "info" | "warn" | "error"
type Contexto = Record<string, unknown>

const ORDEN: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function nivelMinimo(): number {
  const nivel = process.env.LOG_LEVEL?.trim().toLowerCase() as Nivel | undefined
  return ORDEN[nivel ?? "info"] ?? ORDEN.info
}

export interface ErrorSerializado {
  nombre: string
  mensaje: string
  codigo?: string
  detalle?: string
  pista?: string
  tabla?: string
  columna?: string
  syscall?: string
  ruta?: string
  direccion?: string
  puerto?: number
  stack?: string
  causa?: ErrorSerializado
}

/** Serializa un error recorriendo su cadena de `cause` (Drizzle envuelve el error de pg en `cause`). */
export function serializarError(error: unknown, profundidad = 0): ErrorSerializado {
  if (!(error instanceof Error)) return { nombre: typeof error, mensaje: String(error) }
  const e = error as Error & Record<string, unknown>
  const resultado: ErrorSerializado = { nombre: e.name, mensaje: e.message }
  if (e.code !== undefined) resultado.codigo = String(e.code)
  if (typeof e.detail === "string") resultado.detalle = e.detail
  if (typeof e.hint === "string") resultado.pista = e.hint
  if (typeof e.table === "string") resultado.tabla = e.table
  if (typeof e.column === "string") resultado.columna = e.column
  if (typeof e.syscall === "string") resultado.syscall = e.syscall
  if (typeof e.path === "string") resultado.ruta = e.path
  if (typeof e.address === "string") resultado.direccion = e.address
  if (typeof e.port === "number") resultado.puerto = e.port
  if (e.stack) resultado.stack = e.stack.split("\n").slice(1, 7).join("\n")
  if (e.cause && profundidad < 4) resultado.causa = serializarError(e.cause, profundidad + 1)
  return resultado
}

function valorTexto(v: unknown): string {
  if (v === null || v === undefined) return String(v)
  if (typeof v === "string") return /\s|=/.test(v) ? JSON.stringify(v) : v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

function errorTexto(err: ErrorSerializado, sangria = ""): string {
  const extras = [
    err.codigo && `code=${err.codigo}`,
    err.syscall && `syscall=${err.syscall}`,
    err.ruta && `path=${err.ruta}`,
    err.direccion && `addr=${err.direccion}${err.puerto ? `:${err.puerto}` : ""}`,
    err.tabla && `table=${err.tabla}`,
    err.columna && `column=${err.columna}`,
    err.detalle && `detail=${JSON.stringify(err.detalle)}`,
    err.pista && `hint=${JSON.stringify(err.pista)}`,
  ].filter(Boolean)
  let out = `${sangria}  ${err.nombre}: ${err.mensaje}${extras.length ? ` (${extras.join(" ")})` : ""}`
  if (err.stack) out += `\n${err.stack.replace(/^/gm, `${sangria}  `)}`
  if (err.causa) out += `\n${sangria}  causado por:\n${errorTexto(err.causa, `${sangria}  `)}`
  return out
}

function emitir(nivel: Nivel, modulo: string, evento: string, contexto: Contexto, error?: unknown) {
  if (ORDEN[nivel] < nivelMinimo()) return
  const fecha = new Date().toISOString()
  const err = error === undefined ? undefined : serializarError(error)
  const salida = nivel === "error" ? console.error : nivel === "warn" ? console.warn : console.log

  if (process.env.LOG_FORMAT === "json") {
    salida(JSON.stringify({ fecha, nivel, modulo, evento, ...contexto, ...(err ? { error: err } : {}) }))
    return
  }
  const campos = Object.entries(contexto)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${valorTexto(v)}`)
    .join(" ")
  const linea = `${fecha} ${nivel.toUpperCase().padEnd(5)} [${modulo}] ${evento}${campos ? ` ${campos}` : ""}`
  salida(err ? `${linea}\n${errorTexto(err)}` : linea)
}

export interface Logger {
  debug(evento: string, contexto?: Contexto): void
  info(evento: string, contexto?: Contexto): void
  warn(evento: string, contexto?: Contexto, error?: unknown): void
  error(evento: string, contexto?: Contexto, error?: unknown): void
  hijo(contexto: Contexto): Logger
}

export function crearLogger(modulo: string, base: Contexto = {}): Logger {
  return {
    debug: (evento, ctx = {}) => emitir("debug", modulo, evento, { ...base, ...ctx }),
    info: (evento, ctx = {}) => emitir("info", modulo, evento, { ...base, ...ctx }),
    warn: (evento, ctx = {}, error) => emitir("warn", modulo, evento, { ...base, ...ctx }, error),
    error: (evento, ctx = {}, error) => emitir("error", modulo, evento, { ...base, ...ctx }, error),
    hijo: (ctx) => crearLogger(modulo, { ...base, ...ctx }),
  }
}

export function nuevoRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10)
}
