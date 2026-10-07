"use client"

import { useRef, useState, useTransition } from "react"
import { UploadIcon, FileSpreadsheetIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import type { ImportSummary } from "@/lib/import-service"
import { toast } from "sonner"

export function ImportDialog() {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (!file) return
    const formData = new FormData()
    formData.set("file", file)

    startTransition(async () => {
      try {
        const response = await fetch("/api/importar", { method: "POST", body: formData })
        const result: ImportSummary = await response.json()
        setSummary(result)
        if (!result.error) {
          toast.success(`Importación completada: ${result.creados} nuevos, ${result.actualizados} actualizados.`)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No se pudo conectar con el servidor. Intenta nuevamente.")
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setFile(null)
          setSummary(null)
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <UploadIcon data-icon="inline-start" />
        Carga masiva (Excel)
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carga masiva de expedientes</DialogTitle>
          <DialogDescription>
            Sube el Excel de referencia (ej. Coincidencias_Admisible_Resoluciones.xlsx) con la columna
            &quot;Expediente&quot; para registrar o actualizar los expedientes a monitorear.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted/70"
        >
          <FileSpreadsheetIcon className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {file ? file.name : "Haz clic para seleccionar un archivo .xlsx"}
          </span>
          <span className="text-xs text-muted-foreground">Formato Excel (.xlsx)</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {summary && !summary.error && (
          <Alert>
            <AlertTitle>Resumen de la importación</AlertTitle>
            <AlertDescription>
              {summary.total} filas procesadas · {summary.creados} creados · {summary.actualizados} actualizados ·{" "}
              {summary.omitidos} omitidos (sin número de expediente válido).
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={!file || isPending}>
            {isPending ? "Importando..." : "Importar expedientes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
