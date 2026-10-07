"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BadgeEstado } from "@/components/badge-estado"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { SearchIcon, InboxIcon } from "lucide-react"
import { ESTADO_EXPEDIENTE } from "@/lib/matching"

export interface ExpedienteRow {
  id: number
  numeroExpediente: string
  solicitante: string | null
  rut: string | null
  estado: string
  fechaSolicitud: string | null
  coincidenciasPendientes: number
}

// ESTADO_EXPEDIENTE tiene varias claves que comparten el mismo texto visible (ej. POSIBLE y
// REVISION se unificaron en "POSIBLE PUBLICACIÓN – requiere revisión"), de ahí el Set para que el
// filtro no muestre la misma opción repetida.
const ESTADOS_FILTRO = Array.from(new Set(Object.values(ESTADO_EXPEDIENTE)))

export function ExpedientesTable({ expedientes }: { expedientes: ExpedienteRow[] }) {
  const [query, setQuery] = useState("")
  const [estadoFiltro, setEstadoFiltro] = useState<string>("todos")

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expedientes.filter((exp) => {
      const matchesQuery =
        !q ||
        exp.numeroExpediente.toLowerCase().includes(q) ||
        (exp.solicitante ?? "").toLowerCase().includes(q) ||
        (exp.rut ?? "").toLowerCase().includes(q)
      const matchesEstado = estadoFiltro === "todos" || exp.estado === estadoFiltro
      return matchesQuery && matchesEstado
    })
  }, [expedientes, query, estadoFiltro])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por expediente, solicitante o RUT..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={estadoFiltro} onValueChange={(value) => setEstadoFiltro(value ?? "todos")}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="todos">Todos los estados</SelectItem>
              {ESTADOS_FILTRO.map((estado) => (
                <SelectItem key={estado} value={estado}>
                  {estado}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expediente</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Fecha solicitud</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Coincidencias</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <InboxIcon />
                      </EmptyMedia>
                      <EmptyTitle>Sin resultados</EmptyTitle>
                      <EmptyDescription>
                        {expedientes.length === 0
                          ? "Todavía no hay expedientes cargados. Usa Carga masiva (Excel) para comenzar."
                          : "Ningún expediente coincide con el filtro actual."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((exp) => (
                <TableRow key={exp.id} className="group">
                  <TableCell className="font-medium">
                    <Link href={`/expedientes/${exp.id}`} className="hover:underline">
                      {exp.numeroExpediente}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">{exp.solicitante ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{exp.rut ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{exp.fechaSolicitud ?? "—"}</TableCell>
                  <TableCell>
                    <BadgeEstado estado={exp.estado} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {exp.coincidenciasPendientes > 0 ? exp.coincidenciasPendientes : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
