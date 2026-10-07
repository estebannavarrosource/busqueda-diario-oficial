"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { iniciarBusqueda, obtenerEstadoEjecucion, type EstadoEjecucion } from "@/app/actions/expedientes"
import { toast } from "sonner"

function today() {
  return new Date().toISOString().slice(0, 10)
}

const ESTADOS_FINALES = ["completado", "completado_con_errores", "error"]

export function RunSearchDialog() {
  const [open, setOpen] = useState(false)
  const [desde, setDesde] = useState(today())
  const [hasta, setHasta] = useState(today())
  const [summary, setSummary] = useState<EstadoEjecucion | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPolling, setIsPolling] = useState(false)
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimeout.current) clearTimeout(pollTimeout.current)
    }
  }, [])

  function pollEstado(ejecucionId: number) {
    setIsPolling(true)
    const check = async () => {
      const estado = await obtenerEstadoEjecucion(ejecucionId)
      if (!estado) {
        setIsPolling(false)
        toast.error("No se encontró el registro de la búsqueda.")
        return
      }

      if (!ESTADOS_FINALES.includes(estado.estado)) {
        pollTimeout.current = setTimeout(check, 3000)
        return
      }

      setIsPolling(false)
      setSummary(estado)

      if (estado.error) {
        toast.error(estado.error)
      } else if (estado.fechasConError.length > 0) {
        toast.warning(
          `Búsqueda completada con ${estado.fechasConError.length} fecha(s) que no se pudieron revisar. Reintenta esas fechas puntuales.`,
        )
      } else {
        toast.success(
          `Búsqueda completada: ${estado.publicacionesNuevas} publicaciones nuevas, ${estado.coincidenciasGeneradas} coincidencias generadas.`,
        )
      }
    }
    check()
  }

  function handleSubmit() {
    startTransition(async () => {
      setSummary(null)
      const { ejecucionId } = await iniciarBusqueda(desde, hasta)
      pollEstado(ejecucionId)
    })
  }

  const buscando = isPending || isPolling

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <SearchIcon data-icon="inline-start" />
        Ejecutar búsqueda
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buscar en el Diario Oficial</DialogTitle>
          <DialogDescription>
            Consulta el sumario del Diario Oficial en el rango de fechas indicado y concilia automáticamente las
            publicaciones contra los expedientes registrados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} min={desde} max={today()} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>

        {buscando && (
          <Alert>
            <AlertTitle>Buscando...</AlertTitle>
            <AlertDescription>
              Esto puede tardar varios minutos si el rango incluye muchas fechas. Puedes cerrar este diálogo; la
              búsqueda sigue corriendo en segundo plano.
            </AlertDescription>
          </Alert>
        )}

        {summary && !buscando && !summary.error && (
          <Alert>
            <AlertTitle>Resultado de la búsqueda</AlertTitle>
            <AlertDescription>
              {summary.publicacionesEncontradas} publicaciones revisadas · {summary.publicacionesNuevas} nuevas ·{" "}
              {summary.coincidenciasGeneradas} coincidencias generadas.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={buscando}>
            {buscando ? "Buscando..." : "Iniciar búsqueda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
