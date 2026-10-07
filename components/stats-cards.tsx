import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { FileTextIcon, CheckCircle2Icon, AlertTriangleIcon, XCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardsProps {
  total: number
  confirmadas: number
  revision: number
  sinCoincidencia: number
}

export function StatsCards({ total, confirmadas, revision, sinCoincidencia }: StatsCardsProps) {
  const items = [
    { label: "Expedientes totales", value: total, icon: FileTextIcon, tone: "text-foreground" },
    { label: "Publicaciones confirmadas", value: confirmadas, icon: CheckCircle2Icon, tone: "text-success" },
    { label: "En revisión / posible", value: revision, icon: AlertTriangleIcon, tone: "text-warning-foreground" },
    { label: "Sin coincidencia", value: sinCoincidencia, icon: XCircleIcon, tone: "text-destructive" },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="flex flex-col gap-1">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{item.value}</CardTitle>
            </div>
            <item.icon className={cn("size-8 shrink-0", item.tone)} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
