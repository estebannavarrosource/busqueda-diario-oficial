"use client"

import { useState, useTransition } from "react"
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
import { ejecutarBusqueda, type BusquedaSummary } from "@/app/actions/expedientes"
import { toast } from "sonner"

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function RunSearchDialog() {
  const [open, setOpen] = useState(false)
  const [desde, setDesde] = useState(today())
  const [hasta, setHasta] = useState(today())
  const [summary, setSummary] = useState<BusquedaSummary | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    startTransition(async () => {
      setSummary(null)
      const result = await ejecutarBusqueda(desde, hasta)
      setSummary(result)
      if (!result.error) {
        if (result.fechasConError.length > 0) {
          toast.warning(
            `Búsqueda completada con ${result.fechasConError.length} fecha(s) que no se pudieron revisar. Reintenta esas fechas puntuales.`,
          )
        } else {
          toast.success(
            `Búsqueda completada: ${result.publicacionesNuevas} publicaciones nuevas, ${result.coincidenciasGeneradas} coincidencias generadas.`,
          )
        }
      } else {
        toast.error(result.error)
      }
    })
  }

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

        {summary && !summary.error && (
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
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Buscando..." : "Iniciar búsqueda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
