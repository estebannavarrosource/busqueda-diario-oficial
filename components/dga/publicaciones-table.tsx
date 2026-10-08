import { DownloadIcon, ExternalLinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ReintentarPdfButton } from "./descargar-pdfs-button"

export interface PublicacionRow {
  id: number
  idDoe: string
  cve: string | null
  fechaPublicacion: string | null
  titulo: string | null
  tiposol: string | null
  solicitante: string | null
  rut: string | null
  region: string | null
  comuna: string | null
  esDga: boolean
  tipoProcedimiento: string | null
  origen: string | null
  estadoDocumento: string | null
  ultimoError: string | null
  tieneArchivo: boolean
}

const ESTADOS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  descargado: { label: "Descargado", variant: "default" },
  pendiente: { label: "Pendiente", variant: "secondary" },
  no_disponible: { label: "No disponible", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
}

function formatearFecha(fecha: string | null) {
  if (!fecha) return "—"
  const [y, m, d] = fecha.split("-")
  return `${d}-${m}-${y}`
}

export function PublicacionesTable({ filas }: { filas: PublicacionRow[] }) {
  if (filas.length === 0) {
    return (
      <Empty className="rounded-lg border border-border">
        <EmptyHeader>
          <EmptyTitle>Sin registros</EmptyTitle>
          <EmptyDescription>Importa un Excel del Diario Oficial o ajusta los filtros.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>CVE</TableHead>
            <TableHead className="min-w-64">Solicitante / Título</TableHead>
            <TableHead>Procedimiento</TableHead>
            <TableHead>Ubicación</TableHead>
            <TableHead>PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((fila) => {
            const estado = fila.estadoDocumento ? ESTADOS[fila.estadoDocumento] : null
            return (
              <TableRow key={fila.id}>
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                  {formatearFecha(fila.fechaPublicacion)}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{fila.cve ?? "—"}</TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {fila.solicitante ?? <span className="text-muted-foreground">Sin solicitante</span>}
                    </span>
                    {fila.rut && <span className="font-mono text-xs text-muted-foreground">{fila.rut}</span>}
                    <span className="line-clamp-2 text-xs text-muted-foreground">{fila.titulo}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-56 whitespace-normal">
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-xs text-foreground">{fila.tipoProcedimiento ?? fila.tiposol ?? "—"}</span>
                    {fila.esDga ? (
                      <Badge variant="outline">{fila.origen === "DGA" ? "Emitida por DGA" : "Particular"}</Badge>
                    ) : (
                      <Badge variant="secondary">No DGA</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal text-xs text-muted-foreground">
                  {[fila.comuna, fila.region].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {estado ? (
                      <Badge variant={estado.variant} title={fila.ultimoError ?? undefined}>
                        {estado.label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {fila.tieneArchivo && fila.cve && (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Ver PDF del CVE ${fila.cve}`}
                          render={<a href={`/api/dga/pdf/${fila.cve}`} target="_blank" rel="noreferrer" />}
                          nativeButton={false}
                        >
                          <ExternalLinkIcon />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Descargar PDF del CVE ${fila.cve}`}
                          render={<a href={`/api/dga/pdf/${fila.cve}?descargar=1`} />}
                          nativeButton={false}
                        >
                          <DownloadIcon />
                        </Button>
                      </>
                    )}
                    {fila.cve && (fila.estadoDocumento === "error" || fila.estadoDocumento === "no_disponible") && (
                      <ReintentarPdfButton cve={fila.cve} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
