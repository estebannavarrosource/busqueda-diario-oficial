"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { FileDownIcon, LoaderIcon, RotateCwIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { iniciarDescargaPdfs, obtenerEstadoDescarga } from "@/app/actions/dga"

interface Props {
  pendientes: number
  ejecucionEnCurso: number | null
}

export function DescargarPdfsButton({ pendientes, ejecucionEnCurso }: Props) {
  const router = useRouter()
  const [ejecucionId, setEjecucionId] = useState<number | null>(ejecucionEnCurso)
  const [isPending, startTransition] = useTransition()

  const { data: estado } = useSWR(
    ejecucionId ? ["descarga", ejecucionId] : null,
    () => obtenerEstadoDescarga(ejecucionId!),
    {
      refreshInterval: (latest) => (latest && latest.estado !== "en_progreso" ? 0 : 3000),
      onSuccess: (latest) => {
        if (latest && latest.estado !== "en_progreso") {
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
      const { ejecucionId: id, total } = await iniciarDescargaPdfs()
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
          const { ejecucionId } = await iniciarDescargaPdfs([cve])
          if (ejecucionId) toast.info(`Reintentando CVE ${cve} en segundo plano.`)
          router.refresh()
        })
      }
    >
      <RotateCwIcon />
    </Button>
  )
}
