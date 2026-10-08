"use client"

import { useMemo, useState } from "react"
import { Label } from "@/components/ui/label"

export interface RegionComuna {
  region: string
  comuna: string
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const ordenar = (a: string, b: string) => a.localeCompare(b, "es")

export function RegionComunaSelects({
  opciones = [],
  region: regionInicial = "",
  comuna: comunaInicial = "",
}: {
  opciones?: RegionComuna[]
  region?: string
  comuna?: string
}) {
  const [region, setRegion] = useState(regionInicial)
  const [comuna, setComuna] = useState(comunaInicial)

  const regiones = useMemo(
    () => [...new Set(opciones.map((o) => o.region).filter(Boolean))].sort(ordenar),
    [opciones],
  )

  const comunas = useMemo(
    () =>
      [
        ...new Set(
          opciones.filter((o) => !region || o.region === region).map((o) => o.comuna).filter(Boolean),
        ),
      ].sort(ordenar),
    [opciones, region],
  )

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="region" className="text-xs text-muted-foreground">
          Región
        </Label>
        <select
          id="region"
          name="region"
          value={region}
          onChange={(e) => {
            const nueva = e.target.value
            setRegion(nueva)
            if (nueva && !opciones.some((o) => o.region === nueva && o.comuna === comuna)) setComuna("")
          }}
          className={selectClass}
        >
          <option value="">Todas</option>
          {regiones.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comuna" className="text-xs text-muted-foreground">
          Comuna
        </Label>
        <select
          id="comuna"
          name="comuna"
          value={comuna}
          onChange={(e) => setComuna(e.target.value)}
          className={selectClass}
        >
          <option value="">Todas</option>
          {comunas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
