"use client"

import { useTransition } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { confirmarCoincidencia, rechazarCoincidencia } from "@/app/actions/expedientes"
import { toast } from "sonner"

export function CoincidenciaActions({ coincidenciaId, estado }: { coincidenciaId: number; estado: string }) {
  const [isPending, startTransition] = useTransition()

  if (estado !== "pendiente") {
    return (
      <span className="text-sm text-muted-foreground">
        {estado === "confirmada" ? "Confirmada" : "Rechazada"}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="border-success/40 text-success hover:bg-success/10 hover:text-success"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await confirmarCoincidencia(coincidenciaId)
            toast.success("Coincidencia confirmada.")
          })
        }
      >
        <CheckIcon data-icon="inline-start" />
        Confirmar
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await rechazarCoincidencia(coincidenciaId)
            toast.success("Coincidencia rechazada.")
          })
        }
      >
        <XIcon data-icon="inline-start" />
        Rechazar
      </Button>
    </div>
  )
}
