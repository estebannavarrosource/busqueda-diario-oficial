"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileSpreadsheetIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
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
import type { ResumenImportacionDga } from "@/lib/dga/import"

function describirErrorHttp(status: number): string {
  if (status === 413) return "Archivo rechazado por tamaño (HTTP 413). Revisa el límite del proxy, p. ej. client_max_body_size en nginx."
  if (status === 502) return "El servidor de la aplicación no respondió (HTTP 502). Puede haberse caído o reiniciado; revisa sus logs."
  if (status === 504) return "Tiempo de espera agotado en el proxy (HTTP 504). Sube proxy_read_timeout o importa archivos más pequeños."
  if (status === 401 || status === 403) return `Acceso denegado (HTTP ${status}). Revisa la autenticación o las reglas del proxy.`
  return `Respuesta inesperada del servidor (HTTP ${status}). Revisa los logs del servidor.`
}

export function ImportDgaDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [resumenes, setResumenes] = useState<ResumenImportacionDga[]>([])
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (files.length === 0) return
    startTransition(async () => {
      const resultados: ResumenImportacionDga[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.set("file", file)
  const vacio = { total: 0, dga: 0, nuevos: 0, actualizados: 0, documentosNuevos: 0 }
  let response: Response
  try {
  response = await fetch("/api/dga/importar", { method: "POST", body: formData })
  } catch {
  resultados.push({ archivo: file.name, error: "Sin conexión con el servidor (la petición no llegó o se cortó).", ...vacio })
  setResumenes([...resultados])
  continue
  }
  const esJson = response.headers.get("content-type")?.includes("application/json")
  if (!esJson) {
  resultados.push({ archivo: file.name, error: describirErrorHttp(response.status), ...vacio })
  setResumenes([...resultados])
  continue
  }
  const result: ResumenImportacionDga = await response.json()
  resultados.push({ ...result, archivo: file.name })
  if (result.error) toast.error(`${file.name}: ${result.error}`)
        setResumenes([...resultados])
      }
      const ok = resultados.filter((r) => !r.error)
      if (ok.length) {
        toast.success(`${ok.length} archivo(s) importado(s).`)
        router.refresh()
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setFiles([])
          setResumenes([])
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <UploadIcon data-icon="inline-start" />
        Importar Excel
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar publicaciones del Diario Oficial</DialogTitle>
          <DialogDescription>
            Excel con las columnas ID_DOE, CVE, FECPUB, CUERPO, TITULO, TIPOSOL, SOLICITANTE, RUT, REGION, PROVINCIA,
            COMUNA y TEXTO. Se conservan todas las columnas originales y se clasifican según las reglas vigentes.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-6 py-8 text-center transition-colors hover:bg-muted/70"
        >
          <FileSpreadsheetIcon className="size-8 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {files.length ? files.map((f) => f.name).join(", ") : "Selecciona uno o más archivos .xlsx"}
          </span>
          <span className="text-xs text-muted-foreground">Puedes cargar varias quincenas a la vez</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />

        {resumenes.length > 0 && (
          <div className="flex flex-col gap-2">
            {resumenes.map((r) => (
              <Alert key={r.archivo} variant={r.error ? "destructive" : "default"}>
                <AlertTitle className="truncate">{r.archivo}</AlertTitle>
                <AlertDescription>
                  {r.error
                    ? r.error
                    : `${r.total} registros · ${r.dga} competencia DGA · ${r.nuevos} nuevos · ${r.actualizados} actualizados · ${r.documentosNuevos} CVE por descargar`}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cerrar
          </Button>
          <Button onClick={handleSubmit} disabled={files.length === 0 || isPending}>
            {isPending ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
