export type CampoRegla = "TITULO" | "TIPOSOL" | "TEXTO" | "CUALQUIERA"
export type EfectoRegla = "INCLUIR" | "EXCLUIR"
export type OrigenPublicacion = "DGA" | "PARTICULAR"

export interface ReglaDga {
  id: number
  nombre: string
  campo: string
  patron: string
  efecto: string
  tipoProcedimiento: string | null
  origen: string | null
  prioridad: number
  activa: boolean
}

export interface CamposClasificables {
  titulo: string | null
  tiposol: string | null
  texto: string | null
  solicitante: string | null
  rut: string | null
}

export interface Clasificacion {
  esDga: boolean
  tipoProcedimiento: string | null
  origen: OrigenPublicacion | null
  reglasAplicadas: string[]
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/**
 * Compila el patrón de una regla de forma tolerante: el texto del Excel viene en mayúsculas y
 * a veces sin tildes, así que se compara contra el texto original y su versión sin tildes.
 * Un patrón inválido no debe botar toda la importación; simplemente no aplica.
 */
export function compilarPatron(patron: string): RegExp | null {
  try {
    return new RegExp(patron, "i")
  } catch {
    return null
  }
}

function valorCampo(campos: CamposClasificables, campo: string): string {
  switch (campo) {
    case "TITULO":
      return campos.titulo ?? ""
    case "TIPOSOL":
      return (campos.tiposol ?? "").trim()
    case "TEXTO":
      return campos.texto ?? ""
    default:
      return [campos.titulo, campos.tiposol, campos.texto].filter(Boolean).join(" \n ")
  }
}

/**
 * Evalúa las reglas activas en orden de prioridad (menor número = mayor prioridad).
 * - Cualquier regla EXCLUIR que coincida descarta el registro.
 * - Basta una regla INCLUIR para marcarlo como competencia DGA (no depende de la palabra "DGA").
 * - El tipo de procedimiento y el origen los fija la primera regla coincidente que los defina.
 * - Si ninguna regla define el origen, se infiere: con solicitante o RUT es una presentación de un
 *   particular ante el servicio; sin ellos, se asume emitida por la DGA.
 */
export function clasificar(campos: CamposClasificables, reglas: ReglaDga[]): Clasificacion {
  const activas = reglas.filter((r) => r.activa).sort((a, b) => a.prioridad - b.prioridad)

  let incluida = false
  let excluida = false
  let tipoProcedimiento: string | null = null
  let origen: OrigenPublicacion | null = null
  const reglasAplicadas: string[] = []

  for (const regla of activas) {
    const regex = compilarPatron(regla.patron)
    if (!regex) continue
    const valor = valorCampo(campos, regla.campo)
    if (!valor) continue
    if (!regex.test(valor) && !regex.test(stripAccents(valor))) continue

    reglasAplicadas.push(regla.nombre)
    if (regla.efecto === "EXCLUIR") {
      excluida = true
      continue
    }
    incluida = true
    if (!tipoProcedimiento && regla.tipoProcedimiento) tipoProcedimiento = regla.tipoProcedimiento
    if (!origen && (regla.origen === "DGA" || regla.origen === "PARTICULAR")) origen = regla.origen
  }

  const esDga = incluida && !excluida
  if (esDga && !origen) {
    origen = campos.solicitante?.trim() || campos.rut?.trim() ? "PARTICULAR" : "DGA"
  }
  if (esDga && !tipoProcedimiento && campos.tiposol?.trim()) {
    tipoProcedimiento = campos.tiposol.trim()
  }

  return { esDga, tipoProcedimiento: esDga ? tipoProcedimiento : null, origen: esDga ? origen : null, reglasAplicadas }
}
