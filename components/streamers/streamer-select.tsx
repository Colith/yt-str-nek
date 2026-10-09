"use client"

import { Radio } from "lucide-react"
import type { Streamer } from "@/types"

/** Desplegable para elegir la cola de qué streamer se está viendo. */
export function StreamerSelect({
  streamers,
  value,
  onChange,
  id = "streamer-select",
}: {
  streamers: Streamer[]
  value: string
  onChange: (streamerId: string) => void
  id?: string
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm">
      <Radio className="h-4 w-4 shrink-0 text-primary" />
      <span className="shrink-0 text-muted-foreground">Cola de</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 max-w-48 rounded-lg border border-input bg-background px-3 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {streamers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.username}
          </option>
        ))}
      </select>
    </label>
  )
}
