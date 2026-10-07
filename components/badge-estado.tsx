import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ESTADO_EXPEDIENTE } from "@/lib/matching"

const ESTADO_STYLES: Record<string, string> = {
  [ESTADO_EXPEDIENTE.PENDIENTE]: "bg-secondary text-secondary-foreground",
  [ESTADO_EXPEDIENTE.SIN_COINCIDENCIA]: "bg-destructive/10 text-destructive border-destructive/20",
  // POSIBLE y REVISION comparten el mismo texto visible ("POSIBLE PUBLICACIÓN – requiere
  // revisión"), así que una sola entrada cubre ambas claves.
  [ESTADO_EXPEDIENTE.REVISION]: "bg-warning/25 text-warning-foreground border-warning/40",
  [ESTADO_EXPEDIENTE.CONFIRMADA]: "bg-success/15 text-success border-success/30",
  [ESTADO_EXPEDIENTE.ERROR]: "bg-destructive/15 text-destructive border-destructive/30",
}

export function BadgeEstado({ estado, className }: { estado: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium", ESTADO_STYLES[estado] ?? "bg-muted text-muted-foreground", className)}
    >
      {estado}
    </Badge>
  )
}

const CLASIFICACION_STYLES: Record<string, string> = {
  confirmada: "bg-success/15 text-success border-success/30",
  probable: "bg-warning/25 text-warning-foreground border-warning/40",
  posible: "bg-warning/15 text-warning-foreground border-warning/30",
  sin_coincidencia: "bg-muted text-muted-foreground",
}

const CLASIFICACION_LABELS: Record<string, string> = {
  confirmada: "Confirmada",
  probable: "Probable",
  posible: "Posible",
  sin_coincidencia: "Sin coincidencia",
}

export function BadgeClasificacion({ clasificacion, className }: { clasificacion: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap font-medium", CLASIFICACION_STYLES[clasificacion] ?? "bg-muted", className)}
    >
      {CLASIFICACION_LABELS[clasificacion] ?? clasificacion}
    </Badge>
  )
}
