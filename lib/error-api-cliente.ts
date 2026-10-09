/** Error de API ya interpretado en el navegador, con datos para buscarlo en los logs del servidor. */
export class ErrorApi extends Error {
  constructor(
    mensaje: string,
    public readonly info: { codigo?: string; sugerencia?: string; requestId?: string; detalle?: string; status?: number } = {},
  ) {
    super(mensaje)
    this.name = "ErrorApi"
  }

  /** Línea secundaria: sugerencia + referencia para cruzar con los logs. */
  get descripcion(): string {
    const { sugerencia, codigo, requestId, status } = this.info
    const ref = [codigo, status && `HTTP ${status}`, requestId && `ref ${requestId}`].filter(Boolean).join(" · ")
    return [sugerencia, ref && `(${ref})`].filter(Boolean).join(" ")
  }
}

function describirHttp(status: number, ruta: string): string {
  if (status === 413) return "Archivo rechazado por tamaño (HTTP 413). Revisa client_max_body_size en nginx."
  if (status === 401 || status === 403) return `Acceso denegado por el servidor o proxy (HTTP ${status}).`
  if (status === 404) return `La ruta ${ruta} no existe en el servidor (HTTP 404). Verifica que el build esté actualizado.`
  if (status === 502 || status === 503) return `La aplicación no responde (HTTP ${status}). Revisa que el proceso Node esté corriendo (pm2/systemd).`
  if (status === 504) return "El proxy cortó la petición por tiempo (HTTP 504). Aumenta proxy_read_timeout en nginx."
  return `Respuesta inesperada del servidor (HTTP ${status}).`
}

/** fetch + interpretación uniforme de errores de red, de proxy (HTML) y de la app (JSON con codigo/requestId). */
export async function fetchApi<T>(ruta: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(ruta, { cache: "no-store", ...init })
  } catch (error) {
    throw new ErrorApi("Sin conexión con el servidor: la petición no llegó o se cortó.", {
      codigo: "RED",
      sugerencia: `Verifica la red y que la aplicación esté levantada. (${error instanceof Error ? error.message : String(error)})`,
    })
  }

  const requestId = res.headers.get("x-request-id") ?? undefined
  const esJson = res.headers.get("content-type")?.includes("application/json")
  const data = esJson ? await res.json().catch(() => null) : null

  if (!res.ok || data?.error) {
    if (data?.error) {
      throw new ErrorApi(data.error, {
        codigo: data.codigo,
        sugerencia: data.sugerencia,
        requestId: data.requestId ?? requestId,
        detalle: data.detalle,
        status: res.status,
      })
    }
    throw new ErrorApi(describirHttp(res.status, ruta), {
      codigo: esJson ? "RESPUESTA_INVALIDA" : "PROXY",
      sugerencia: esJson ? undefined : "La respuesta no vino de la aplicación (posible página de error del proxy). Revisa los logs de nginx.",
      requestId,
      status: res.status,
    })
  }
  if (data === null) {
    throw new ErrorApi("El servidor devolvió una respuesta que no es JSON.", {
      codigo: "PROXY",
      sugerencia: "Revisa el proxy inverso: puede estar sirviendo otra aplicación o una página de error.",
      requestId,
      status: res.status,
    })
  }
  return data as T
}
