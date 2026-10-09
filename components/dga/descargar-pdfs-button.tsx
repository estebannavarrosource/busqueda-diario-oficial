"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { FileDownIcon, LoaderIcon, RotateCwIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { EstadoDescarga } from "@/app/actions/dga"

interface ResultadoInicio {
  ejecucionId: number | null
  total: number
}

function describirErrorHttp(status: number): string {
  if (status === 401 || status === 403) return `Acceso denegado por el servidor (${status}).`
  if (status === 404) return "La ruta /api/dga/descargas no existe en el servidor (404). Verifica que el build esté actualizado."
  if (status === 502 || status === 503) return `El servidor de la aplicación no responde (${status}). Revisa que el proceso Node esté corriendo.`
  if (status === 504) return "El proxy cortó la petición por tiempo de espera (504). Aumenta proxy_read_timeout."
  return `El servidor respondió con error ${status}.`
}

async function solicitarDescarga(cves?: string[]): Promise<ResultadoInicio> {
  let res: Response
  try {
    res = await fetch("/api/dga/descargas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cves ? { cves } : {}),
      cache: "no-store",
    })
  } catch {
    throw new Error("Sin conexión con el servidor. Verifica la red o que la aplicación esté levantada.")
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? describirErrorHttp(res.status))
  if (!data) throw new Error("El servidor devolvió una respuesta no válida (no es JSON). Revisa el proxy o los logs.")
  return data as ResultadoInicio
}

async function fetchEstado(url: string): Promise<EstadoDescarga | null> {
  const res = await fetch(url, { cache: "no-store" })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Estado no disponible (${res.status})`)
  return res.json()
}

interface Props {
  pendientes: number
  ejecucionEnCurso: number | null
}

export function DescargarPdfsButton({ pendientes, ejecucionEnCurso }: Props) {
  const router = useRouter()
  const [ejecucionId, setEjecucionId] = useState<number | null>(ejecucionEnCurso)
  const [isPending, startTransition] = useTransition()

  const { data: estado } = useSWR(
    ejecucionId ? `/api/dga/descargas/${ejecucionId}` : null,
    fetchEstado,
    {
      refreshInterval: (latest) => (latest && latest.estado !== "en_progreso" ? 0 : 3000),
      shouldRetryOnError: true,
      errorRetryInterval: 5000,
      onSuccess: (latest) => {
        if (!latest) {
          setEjecucionId(null)
          return
        }
        if (latest.estado !== "en_progreso") {
          toast.success(
            `Descarga ${latest.estado}: ${latest.descargados} PDF descargados, ${latest.noDisponibles} no disponibles, ${latest.errores} con error.`,
          )
          setEjecucionId(null)
          router.refresh()
        }
      },
    },
  )

  function iniciar() {
    startTransition(async () => {
      let resultado: ResultadoInicio
      try {
        resultado = await solicitarDescarga()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo iniciar la descarga.")
        return
      }
      const { ejecucionId: id, total } = resultado
      if (!id) {
        toast.info("No hay documentos pendientes de descarga.")
        return
      }
      if (total > 0) toast.info(`Descargando ${total} PDF en segundo plano.`)
      setEjecucionId(id)
    })
  }

  if (ejecucionId) {
    const procesados = estado?.procesados ?? 0
    const total = estado?.total ?? 0
    return (
      <Button variant="outline" disabled>
        <LoaderIcon data-icon="inline-start" className="animate-spin" />
        Descargando {procesados}/{total}
      </Button>
    )
  }

  return (
    <Button variant="outline" onClick={iniciar} disabled={isPending || pendientes === 0}>
      <FileDownIcon data-icon="inline-start" />
      Descargar PDF pendientes ({pendientes})
    </Button>
  )
}

export function ReintentarPdfButton({ cve }: { cve: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Reintentar descarga del CVE ${cve}`}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const { ejecucionId } = await solicitarDescarga([cve])
            if (ejecucionId) toast.info(`Reintentando CVE ${cve} en segundo plano.`)
            router.refresh()
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "No se pudo reintentar.")
          }
        })
      }
    >
      <RotateCwIcon />
    </Button>
  )
}
