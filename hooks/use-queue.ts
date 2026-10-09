"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { HistoryItem, QueueItem, YoutubeResult } from "@/types"
import { MAX_QUEUE } from "@/types"

interface QueueState {
  streamerId: string | null
  queue: QueueItem[]
  history: HistoryItem[]
}

// Listas vacías estables, para no cambiar de referencia en cada render
const NO_QUEUE: QueueItem[] = []
const NO_HISTORY: HistoryItem[] = []

/** Cola e historial de un streamer. Sin streamer elegido no carga nada. */
export function useQueue(streamerId: string | null) {
  // Los datos se guardan junto al streamer al que pertenecen: al cambiar de
  // streamer, lo del anterior deja de mostrarse en el acto, sin esperar a la
  // respuesta del servidor.
  const [state, setState] = useState<QueueState>({
    streamerId: null,
    queue: [],
    history: [],
  })

  const loaded = state.streamerId === streamerId
  const queue = loaded ? state.queue : NO_QUEUE
  const history = loaded ? state.history : NO_HISTORY
  const loading = streamerId !== null && !loaded

  const loadAll = useCallback(async () => {
    if (!streamerId) return

    try {
      const query = `?streamerId=${encodeURIComponent(streamerId)}`
      const [qRes, hRes] = await Promise.all([
        fetch(`/api/queue${query}`),
        fetch(`/api/history${query}`),
      ])
      const qData = await qRes.json()
      const hData = await hRes.json()
      setState({
        streamerId,
        queue: qData.queue || [],
        history: hData.history || [],
      })
    } catch {
      toast.error("Error al cargar la cola")
      // Se marca como cargado para no dejar el panel girando para siempre.
      setState((prev) =>
        prev.streamerId === streamerId ? prev : { streamerId, queue: [], history: [] }
      )
    }
  }, [streamerId])

  useEffect(() => {
    // Carga inicial de la cola. El setState ocurre después del await,
    // no de forma síncrona en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
  }, [loadAll])

  const addSong = useCallback(
    async (result: YoutubeResult, requester: string) => {
      if (!streamerId) return
      if (queue.length >= MAX_QUEUE) {
        toast.error(`La cola está llena (máx. ${MAX_QUEUE})`)
        return
      }

      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamerId,
          youtubeId: result.youtubeId,
          requesterName: requester.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }

      toast.success("Añadida a la cola")
      await loadAll()
    },
    [streamerId, queue.length, loadAll]
  )

  const removeItem = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/queue/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success("Eliminada de la cola")
      await loadAll()
    },
    [loadAll]
  )

  const playNext = useCallback(async () => {
    if (!streamerId) return
    const res = await fetch("/api/queue/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamerId }),
    })
    const data = await res.json()
    if (data.error) {
      toast.error(data.error)
      return
    }
    toast.success("Marcada como reproducida")
    await loadAll()
  }, [streamerId, loadAll])

  const reorder = useCallback(
    async (items: QueueItem[]) => {
      if (!streamerId) return
      const previous = queue
      setState((prev) => ({ ...prev, queue: items }))
      const res = await fetch("/api/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamerId,
          items: items.map((item, i) => ({ id: item.id, position: i + 1 })),
        }),
      })
      if (!res.ok) {
        setState((prev) => ({ ...prev, queue: previous }))
        toast.error("Error al reordenar")
      }
    },
    [streamerId, queue]
  )

  const reAddFromHistory = useCallback(
    async (item: HistoryItem) => {
      if (queue.length >= MAX_QUEUE) {
        toast.error(`La cola está llena (máx. ${MAX_QUEUE})`)
        return
      }
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success("Añadida de nuevo a la cola")
      await loadAll()
    },
    [queue.length, loadAll]
  )

  const clearHistory = useCallback(async () => {
    if (!streamerId) return
    const res = await fetch(
      `/api/history?streamerId=${encodeURIComponent(streamerId)}`,
      { method: "DELETE" }
    )
    if (!res.ok) {
      toast.error("No se pudo borrar el historial")
      return
    }
    toast.success("Historial borrado")
    await loadAll()
  }, [streamerId, loadAll])

  const queueFull = queue.length >= MAX_QUEUE

  return {
    queue,
    history,
    loading,
    queueFull,
    addSong,
    removeItem,
    playNext,
    reorder,
    reAddFromHistory,
    clearHistory,
    refresh: loadAll,
  }
}
