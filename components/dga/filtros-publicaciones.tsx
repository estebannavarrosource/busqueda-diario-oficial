import Link from "next/link"
import { SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RegionComunaSelects, type RegionComuna } from "@/components/dga/region-comuna-selects"

export interface Filtros {
  desde: string
  hasta: string
  cve: string
  solicitante: string
  rut: string
  region: string
  comuna: string
  tipo: string
  origen: string
  estado: string
  alcance: string
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Formulario GET: los filtros viven en la URL, así se pueden compartir y la página se filtra en el servidor. */
export function FiltrosPublicaciones({
  filtros,
  opcionesUbicacion,
}: {
  filtros: Filtros
  opcionesUbicacion: RegionComuna[]
}) {
  return (
    <form method="get" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Campo id="desde" label="Desde">
          <Input id="desde" name="desde" type="date" defaultValue={filtros.desde} />
        </Campo>
        <Campo id="hasta" label="Hasta">
          <Input id="hasta" name="hasta" type="date" defaultValue={filtros.hasta} />
        </Campo>
        <Campo id="cve" label="CVE">
          <Input id="cve" name="cve" inputMode="numeric" placeholder="2875462" defaultValue={filtros.cve} />
        </Campo>
        <Campo id="rut" label="RUT">
          <Input id="rut" name="rut" placeholder="16.294.879-2" defaultValue={filtros.rut} />
        </Campo>
        <Campo id="solicitante" label="Solicitante">
          <Input id="solicitante" name="solicitante" defaultValue={filtros.solicitante} />
        </Campo>
        <Campo id="tipo" label="Tipo de solicitud">
          <Input id="tipo" name="tipo" placeholder="subterráneas, traslado..." defaultValue={filtros.tipo} />
        </Campo>
        <RegionComunaSelects opciones={opcionesUbicacion} region={filtros.region} comuna={filtros.comuna} />
        <Campo id="origen" label="Origen">
          <select id="origen" name="origen" defaultValue={filtros.origen} className={selectClass}>
            <option value="">Todos</option>
            <option value="PARTICULAR">Presentada por particular</option>
            <option value="DGA">Emitida por la DGA</option>
          </select>
        </Campo>
        <Campo id="estado" label="Estado del PDF">
          <select id="estado" name="estado" defaultValue={filtros.estado} className={selectClass}>
            <option value="">Todos</option>
            <option value="descargado">Descargado</option>
            <option value="pendiente">Pendiente</option>
            <option value="no_disponible">No disponible</option>
            <option value="error">Con error</option>
            <option value="sin_documento">Sin documento</option>
          </select>
        </Campo>
        <Campo id="alcance" label="Alcance">
          <select id="alcance" name="alcance" defaultValue={filtros.alcance} className={selectClass}>
            <option value="dga">Solo competencia DGA</option>
            <option value="todas">Todos los registros</option>
          </select>
        </Campo>
        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1">
            <SearchIcon data-icon="inline-start" />
            Filtrar
          </Button>
          <Button variant="ghost" render={<Link href="/publicaciones" />} nativeButton={false}>
            Limpiar
          </Button>
        </div>
      </div>
    </form>
  )
}
