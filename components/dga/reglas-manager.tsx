"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { alternarRegla, crearRegla, eliminarRegla, reclasificar } from "@/app/actions/dga"

interface Regla {
  id: number
  nombre: string
  campo: string
  patron: string
  efecto: string
  tipoProcedimiento: string | null
  origen: string | null
  prioridad: number
  activa: boolean
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

export function ReglasManager({ reglas }: { reglas: Regla[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    nombre: "",
    campo: "TITULO",
    patron: "",
    efecto: "INCLUIR",
    tipoProcedimiento: "",
    origen: "",
    prioridad: "100",
  })

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onCrear(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await crearRegla({
        ...form,
        tipoProcedimiento: form.tipoProcedimiento || null,
        origen: form.origen || null,
        prioridad: Number(form.prioridad),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success("Regla creada. Reclasifica para aplicarla a los registros existentes.")
      setForm((f) => ({ ...f, nombre: "", patron: "", tipoProcedimiento: "" }))
      router.refresh()
    })
  }

  function onReclasificar() {
    startTransition(async () => {
      const r = await reclasificar()
      toast.success(`${r.total} registros reclasificados: ${r.dga} DGA, ${r.documentosNuevos} CVE nuevos por descargar.`)
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">{reglas.length} reglas</h2>
        <Button variant="outline" onClick={onReclasificar} disabled={isPending}>
          <RefreshCwIcon data-icon="inline-start" className={isPending ? "animate-spin" : undefined} />
          Reclasificar todos los registros
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prioridad</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Campo</TableHead>
              <TableHead>Patrón</TableHead>
              <TableHead>Efecto</TableHead>
              <TableHead>Procedimiento / Origen</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reglas.map((r) => (
              <TableRow key={r.id} className={r.activa ? undefined : "opacity-50"}>
                <TableCell className="font-mono text-xs tabular-nums">{r.prioridad}</TableCell>
                <TableCell className="text-sm">{r.nombre}</TableCell>
                <TableCell className="font-mono text-xs">{r.campo}</TableCell>
                <TableCell className="max-w-72 whitespace-normal break-all font-mono text-xs">{r.patron}</TableCell>
                <TableCell>
                  <Badge variant={r.efecto === "EXCLUIR" ? "destructive" : "outline"}>{r.efecto}</Badge>
                </TableCell>
                <TableCell className="whitespace-normal text-xs text-muted-foreground">
                  {[r.tipoProcedimiento, r.origen].filter(Boolean).join(" · ") || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await alternarRegla(r.id, !r.activa)
                          router.refresh()
                        })
                      }
                    >
                      {r.activa ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Eliminar regla ${r.nombre}`}
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await eliminarRegla(r.id)
                          router.refresh()
                        })
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <form onSubmit={onCrear} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground">Nueva regla</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="r-nombre" className="text-xs text-muted-foreground">Nombre</Label>
            <Input id="r-nombre" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="r-patron" className="text-xs text-muted-foreground">Patrón (expresión regular)</Label>
            <Input
              id="r-patron"
              className="font-mono"
              placeholder="aguas\s+subterr"
              value={form.patron}
              onChange={(e) => set("patron", e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-campo" className="text-xs text-muted-foreground">Campo</Label>
            <select id="r-campo" className={selectClass} value={form.campo} onChange={(e) => set("campo", e.target.value)}>
              <option value="TITULO">TITULO</option>
              <option value="TIPOSOL">TIPOSOL</option>
              <option value="TEXTO">TEXTO</option>
              <option value="CUALQUIERA">Cualquiera</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-efecto" className="text-xs text-muted-foreground">Efecto</Label>
            <select id="r-efecto" className={selectClass} value={form.efecto} onChange={(e) => set("efecto", e.target.value)}>
              <option value="INCLUIR">Incluir</option>
              <option value="EXCLUIR">Excluir</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-tipo" className="text-xs text-muted-foreground">Tipo de procedimiento</Label>
            <Input id="r-tipo" value={form.tipoProcedimiento} onChange={(e) => set("tipoProcedimiento", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-origen" className="text-xs text-muted-foreground">Origen</Label>
            <select id="r-origen" className={selectClass} value={form.origen} onChange={(e) => set("origen", e.target.value)}>
              <option value="">Inferir</option>
              <option value="PARTICULAR">Particular</option>
              <option value="DGA">DGA</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-prioridad" className="text-xs text-muted-foreground">Prioridad</Label>
            <Input
              id="r-prioridad"
              type="number"
              min={0}
              value={form.prioridad}
              onChange={(e) => set("prioridad", e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={isPending}>
              <PlusIcon data-icon="inline-start" />
              Agregar regla
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
