"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import type { HistoryItem, QueueItem, YoutubeResult } from "@/types"
import { MAX_QUEUE } from "@/types"

export function useQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    try {
      const [qRes, hRes] = await Promise.all([
        fetch("/api/queue"),
        fetch("/api/history"),
      ])
      const qData = await qRes.json()
      const hData = await hRes.json()
      setQueue(qData.queue || [])
      setHistory(hData.history || [])
    } catch {
      toast.error("Error al cargar la cola")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial de la cola. El setState ocurre después del await,
    // no de forma síncrona en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  const addSong = useCallback(
    async (result: YoutubeResult, requester: string) => {
      if (queue.length >= MAX_QUEUE) {
        toast.error(`La cola está llena (máx. ${MAX_QUEUE})`)
        return
      }

      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    [queue.length, loadAll]
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
    const res = await fetch("/api/queue/next", { method: "POST" })
    const data = await res.json()
    if (data.error) {
      toast.error(data.error)
      return
    }
    toast.success("Marcada como reproducida")
    await loadAll()
  }, [loadAll])

  const reorder = useCallback(
    async (items: QueueItem[]) => {
      const previous = queue
      setQueue(items)
      const res = await fetch("/api/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item, i) => ({ id: item.id, position: i + 1 })),
        }),
      })
      if (!res.ok) {
        setQueue(previous)
        toast.error("Error al reordenar")
      }
    },
    [queue]
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
    refresh: loadAll,
  }
}