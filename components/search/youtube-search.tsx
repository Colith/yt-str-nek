"use client"

import { useState, useRef } from "react"
import { toast } from "sonner"
import { Loader2, Search, Music4 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatDuration } from "@/lib/format"
import type { YoutubeResult } from "@/types"

function ResultRow({
  result,
  onAdd,
  disabled,
}: {
  result: YoutubeResult
  onAdd: (r: YoutubeResult, requester: string) => Promise<void>
  disabled: boolean
}) {
  const [requester, setRequester] = useState("")
  const [adding, setAdding] = useState(false)

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/40 sm:flex-row sm:items-center min-w-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {result.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.thumbnail}
            alt=""
            className="h-14 w-24 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md bg-muted">
            <Music4 className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={result.title}>
            {result.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {result.channel}
            {result.durationSec !== null && ` · ${formatDuration(result.durationSec)}`}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Input
          value={requester}
          onChange={(e) => setRequester(e.target.value)}
          placeholder="Pedido por (opcional)"
          className="h-9 w-full text-sm sm:w-40"
          maxLength={50}
        />
        <Button
          size="sm"
          disabled={disabled || adding}
          onClick={async () => {
            setAdding(true)
            await onAdd(result, requester)
            setAdding(false)
          }}
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Añadir"}
        </Button>
      </div>
    </li>
  )
}

export function YoutubeSearch({
  onAdd,
  disabled,
  preloaded,
  clearPreloaded,
}: {
  onAdd: (r: YoutubeResult, requester: string) => Promise<void>
  disabled: boolean
  preloaded: YoutubeResult | null
  clearPreloaded: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<YoutubeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  async function doSearch(q: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        setResults([])
      } else {
        setResults(data.results || [])
      }
      setSearched(true)
    } catch {
      toast.error("Error al buscar en YouTube")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-primary" />
          Buscar en YouTube
        </CardTitle>
        <CardDescription>Encuentra la canción y añádela a la cola</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (debounceRef.current) clearTimeout(debounceRef.current)
            if (query.trim().length >= 2) doSearch(query.trim())
          }}
        >
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              const q = e.target.value.trim()
              if (debounceRef.current) clearTimeout(debounceRef.current)
              if (q.length >= 2) {
                debounceRef.current = setTimeout(() => doSearch(q), 500)
              } else if (q.length === 0) {
                setResults([])
                setSearched(false)
              }
            }}
            placeholder="Título de la canción o artista..."
            disabled={disabled}
          />
        </form>

        {preloaded && (
          <div className="rounded-lg border border-primary/50 bg-accent/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Vídeo cargado desde el enlace</p>
            <ul>
              <ResultRow result={preloaded} onAdd={onAdd} disabled={disabled} />
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                clearPreloaded()
                setQuery("")
                setResults([])
              }}
            >
              Limpiar
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {!preloaded && !loading && results.length > 0 && (
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1 min-w-0">
            {results.map((r) => (
              <ResultRow key={r.youtubeId} result={r} onAdd={onAdd} disabled={disabled} />
            ))}
          </ul>
        )}

        {!preloaded && !loading && searched && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No se encontraron resultados.</p>
        )}
      </CardContent>
    </Card>
  )
}