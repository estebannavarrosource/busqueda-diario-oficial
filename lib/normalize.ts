/**
 * Normalización de identificadores para el motor de coincidencias.
 * Reglas tomadas del criterio del proyecto: eliminar mayúsculas/minúsculas,
 * tildes, puntos, guiones, dobles espacios y caracteres especiales.
 */

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Normaliza un número de expediente DGA: PT-0703-278 / PT 0703 278 / PT0703278 -> PT0703278 */
export function normalizeExpediente(value: string | null | undefined): string {
  if (!value) return ""
  return stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

/** Normaliza un RUT chileno: 11.810.203-7 / 11810203-7 -> 118102037 (sin puntos ni guión, con DV) */
export function normalizeRut(value: string | null | undefined): string {
  if (!value) return ""
  return value.toUpperCase().replace(/[^0-9K]/g, "")
}

const SOCIETAL_ABBREVIATIONS: Record<string, string> = {
  LIMITADA: "LTDA",
  "SOCIEDAD POR ACCIONES": "SPA",
  "SOCIEDAD ANONIMA": "SA",
  HERMANOS: "HNOS",
  COMPANIA: "CIA",
}

/** Normaliza un nombre de persona/empresa para comparación por similitud. */
export function normalizeNombre(value: string | null | undefined): string {
  if (!value) return ""
  let result = stripAccents(value)
    .toUpperCase()
    .replace(/[.,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  for (const [full, abbr] of Object.entries(SOCIETAL_ABBREVIATIONS)) {
    result = result.replace(new RegExp(`\\b${full}\\b`, "g"), abbr)
  }

  return result
}

/** Extrae el número de una expresión de resolución: "Resolución Exenta N° 2083" -> "2083" */
export function normalizeResolucion(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const asString = String(value)
  const match = asString.match(/\d+/)
  return match ? match[0] : ""
}

/** Distancia de Levenshtein clásica. */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }
  return matrix[a.length][b.length]
}

/** Similitud porcentual (0-100) entre dos nombres ya normalizados. */
export function similitudNombres(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 100
  const distance = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 100
  return Math.round((1 - distance / maxLen) * 100)
}

/** Genera variantes de escritura de un expediente para búsqueda de texto libre. */
export function expedienteVariants(value: string): string[] {
  const normalized = normalizeExpediente(value)
  if (!normalized) return []
  // Intenta reconstruir separadores típicos PT-0703-278 a partir del patrón de letras+números
  const match = normalized.match(/^([A-Z]+)(\d+)$/)
  const variants = new Set<string>([value, normalized])
  if (match) {
    const [, prefix, numbers] = match
    variants.add(`${prefix}-${numbers}`)
    variants.add(`${prefix} ${numbers}`)
  }
  return Array.from(variants)
}
