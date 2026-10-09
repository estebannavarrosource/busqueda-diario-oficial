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
import { ErrorApi, fetchApi } from "@/lib/error-api-cliente"

const VACIO = { total: 0, dga: 0, nuevos: 0, actualizados: 0, documentosNuevos: 0 }

type ResultadoArchivo = ResumenImportacionDga & { descripcion?: string; detalle?: string }

export function ImportDgaDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [resumenes, setResumenes] = useState<ResultadoArchivo[]>([])
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (files.length === 0) return
    startTransition(async () => {
      const resultados: ResultadoArchivo[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.set("file", file)
        try {
          const result = await fetchApi<ResumenImportacionDga>("/api/dga/importar", { method: "POST", body: formData })
          resultados.push({ ...result, archivo: file.name })
        } catch (error) {
          const api = error instanceof ErrorApi ? error : null
          console.error("[importar-dga]", file.name, api?.info ?? error)
          resultados.push({
            ...VACIO,
            archivo: file.name,
            error: error instanceof Error ? error.message : String(error),
            descripcion: api?.descripcion,
            detalle: api?.info.detalle,
          })
          toast.error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`)
        }
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
                <AlertDescription className="flex flex-col gap-1">
                  {r.error ? (
                    <>
                      <span>{r.error}</span>
                      {r.descripcion && <span className="text-xs text-muted-foreground">{r.descripcion}</span>}
                      {r.detalle && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">Detalle técnico</summary>
                          <code className="block break-all font-mono">{r.detalle}</code>
                        </details>
                      )}
                    </>
                  ) : (
                    `${r.total} registros · ${r.dga} competencia DGA · ${r.nuevos} nuevos · ${r.actualizados} actualizados · ${r.documentosNuevos} CVE por descargar`
                  )}
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
