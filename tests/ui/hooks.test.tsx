import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { useQueue } from "@/hooks/use-queue"
import { useQueueSync } from "@/hooks/use-queue-sync"
import type { QueueItem } from "@/types"
import { mockApi, type ApiCall } from "../helpers/fetch"

function item(id: string): QueueItem {
  return {
    id,
    position: 1,
    requesterName: null,
    addedById: null,
    songId: id,
    song: { id, youtubeId: `v-${id}`, title: `Canción ${id}`, channel: "Canal", thumbnail: "", durationSec: 200 },
    addedBy: null,
  }
}

const VIDEO = { youtubeId: "yt1", title: "Nueva", channel: "Canal", thumbnail: "", durationSec: 100 }

function queueServer(
  queues: Record<string, QueueItem[]>,
  override?: (call: ApiCall) => { status?: number; body?: unknown } | undefined
) {
  return mockApi((call) => {
    const custom = override?.(call)
    if (custom) return custom
    const streamerId = call.query.get("streamerId") ?? ""
    if (call.path === "/api/queue" && call.method === "GET") {
      return { body: { queue: queues[streamerId] ?? [] } }
    }
    if (call.path === "/api/history" && call.method === "GET") return { body: { history: [] } }
    return { body: { ok: true } }
  })
}

const ids = (queue: QueueItem[]) => queue.map((q) => q.id)

describe("useQueue", () => {
  it("sin streamer elegido no pide nada ni se queda cargando", () => {
    const api = queueServer({})

    const { result } = renderHook(() => useQueue(null))

    expect(result.current.loading).toBe(false)
    expect(result.current.queue).toEqual([])
    expect(api.calls).toHaveLength(0)
  })

  it("carga la cola y el historial del streamer indicado", async () => {
    const api = queueServer({ s1: [item("a"), item("b")] })

    const { result } = renderHook(() => useQueue("s1"))
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(ids(result.current.queue)).toEqual(["a", "b"])
    expect(api.calls.map((c) => `${c.path}?${c.query}`).sort()).toEqual([
      "/api/history?streamerId=s1",
      "/api/queue?streamerId=s1",
    ])
  })

  it("al cambiar de streamer deja de mostrar la cola anterior en el acto", async () => {
    queueServer({ s1: [item("a")], s2: [item("z")] })
    const { result, rerender } = renderHook(({ id }) => useQueue(id), {
      initialProps: { id: "s1" },
    })
    await waitFor(() => expect(ids(result.current.queue)).toEqual(["a"]))

    rerender({ id: "s2" })

    // Antes incluso de que responda el servidor ya no se ve la del otro
    expect(result.current.queue).toEqual([])
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(ids(result.current.queue)).toEqual(["z"]))
  })

  it("añade una canción a la cola del streamer y recarga", async () => {
    const api = queueServer({ s1: [item("a")] })
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.addSong(VIDEO, "  pepe "))

    expect(api.to("POST", "/api/queue")[0].body).toEqual({
      streamerId: "s1",
      youtubeId: "yt1",
      requesterName: "pepe",
    })
    expect(toast.success).toHaveBeenCalledWith("Añadida a la cola")
    expect(api.to("GET", "/api/queue")).toHaveLength(2)
  })

  it("con la cola llena no llega a pedir el alta", async () => {
    const full = Array.from({ length: 20 }, (_, i) => item(`q${i}`))
    const api = queueServer({ s1: full })
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.queueFull).toBe(true))

    await act(() => result.current.addSong(VIDEO, ""))
    await act(() => result.current.reAddFromHistory({ id: "h1" } as never))

    expect(toast.error).toHaveBeenCalledWith("La cola está llena (máx. 20)")
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0)
  })

  it("muestra el error del servidor si rechaza el alta", async () => {
    queueServer({ s1: [] }, (call) =>
      call.method === "POST"
        ? { status: 404, body: { error: "No se encontró el vídeo en YouTube" } }
        : undefined
    )
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.addSong(VIDEO, ""))

    expect(toast.error).toHaveBeenCalledWith("No se encontró el vídeo en YouTube")
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("reordenar se ve al instante y envía las posiciones nuevas", async () => {
    const api = queueServer({ s1: [item("a"), item("b"), item("c")] })
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const [a, b, c] = result.current.queue

    await act(() => result.current.reorder([c, a, b]))

    expect(ids(result.current.queue)).toEqual(["c", "a", "b"])
    expect(api.to("POST", "/api/queue/reorder")[0].body).toEqual({
      streamerId: "s1",
      items: [
        { id: "c", position: 1 },
        { id: "a", position: 2 },
        { id: "b", position: 3 },
      ],
    })
  })

  it("si el servidor rechaza el orden, vuelve al que había", async () => {
    queueServer({ s1: [item("a"), item("b")] }, (call) =>
      call.path === "/api/queue/reorder" ? { status: 409, body: { error: "no coincide" } } : undefined
    )
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const [a, b] = result.current.queue

    await act(() => result.current.reorder([b, a]))

    expect(ids(result.current.queue)).toEqual(["a", "b"])
    expect(toast.error).toHaveBeenCalledWith("Error al reordenar")
  })

  it("marcar como reproducida y borrar el historial actúan sobre el streamer", async () => {
    const api = queueServer({ s1: [item("a")] })
    const { result } = renderHook(() => useQueue("s1"))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.playNext())
    await act(() => result.current.clearHistory())

    expect(api.to("POST", "/api/queue/next")[0].body).toEqual({ streamerId: "s1" })
    expect(api.to("DELETE", "/api/history")[0].query.get("streamerId")).toBe("s1")
    expect(toast.success).toHaveBeenCalledWith("Historial borrado")
  })

  it("si no se puede cargar, avisa y deja de girar", async () => {
    mockApi(() => {
      throw new Error("sin red")
    })

    const { result } = renderHook(() => useQueue("s1"))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Error al cargar la cola"))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

describe("useQueueSync", () => {
  it("refresca cada 5 segundos y al volver a la pestaña", () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    renderHook(() => useQueueSync(refresh))

    vi.advanceTimersByTime(5000)
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10000)
    expect(refresh).toHaveBeenCalledTimes(3)

    window.dispatchEvent(new Event("focus"))
    expect(refresh).toHaveBeenCalledTimes(4)
  })

  it("no gasta peticiones con la pestaña oculta", () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    renderHook(() => useQueueSync(refresh))

    vi.advanceTimersByTime(20000)
    expect(refresh).not.toHaveBeenCalled()

    visibility.mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    expect(refresh).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })

  it("deja de refrescar al desmontar", () => {
    vi.useFakeTimers()
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useQueueSync(refresh))

    unmount()
    vi.advanceTimersByTime(20000)
    window.dispatchEvent(new Event("focus"))

    expect(refresh).not.toHaveBeenCalled()
  })
})
