import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { toast } from "sonner"
import { ModDashboard } from "@/components/queue/mod-dashboard"
import type { HistoryItem, QueueItem } from "@/types"
import { mockApi } from "../helpers/fetch"
import { router } from "../helpers/navigation"

const STREAMERS = [
  { id: "s1", username: "directo" },
  { id: "s2", username: "otra" },
]

function queueItem(id: string, title: string, position: number): QueueItem {
  return {
    id,
    position,
    requesterName: null,
    addedById: "m1",
    songId: `song-${id}`,
    song: { id: `song-${id}`, youtubeId: `v-${id}`, title, channel: "Canal", thumbnail: "", durationSec: 200 },
    addedBy: { id: "m1", username: "ana" },
  }
}

function historyItem(id: string, title: string): HistoryItem {
  return {
    id,
    requesterName: "pepe",
    addedByName: "ana",
    song: { id: `song-${id}`, youtubeId: `v-${id}`, title, channel: "Canal", thumbnail: "", durationSec: 200 },
    playedAt: new Date().toISOString(),
  }
}

/** Servidor de mentira con una cola y un historial por streamer. */
function dashboardServer() {
  const queues: Record<string, QueueItem[]> = {
    s1: [queueItem("a1", "Primera de directo", 1), queueItem("a2", "Segunda de directo", 2)],
    s2: [queueItem("b1", "Única de otra", 1)],
  }
  const histories: Record<string, HistoryItem[]> = {
    s1: [historyItem("h1", "Ya sonó en directo")],
    s2: [],
  }

  const api = mockApi((call) => {
    const streamerId = call.query.get("streamerId") ?? call.body?.streamerId

    if (call.path === "/api/queue" && call.method === "GET") {
      return { body: { queue: queues[streamerId] } }
    }
    if (call.path === "/api/history" && call.method === "GET") {
      return { body: { history: histories[streamerId] } }
    }
    if (call.path === "/api/queue" && call.method === "POST") {
      const list = queues[streamerId]
      list.push(queueItem(`n${list.length}`, "Recién añadida", list.length + 1))
      return { status: 201, body: { item: list.at(-1) } }
    }
    if (call.path === "/api/queue/next") {
      const [played] = queues[streamerId].splice(0, 1)
      histories[streamerId].unshift(historyItem(`p${played.id}`, played.song.title))
      return { body: { ok: true } }
    }
    if (call.path.startsWith("/api/queue/") && call.method === "DELETE") {
      const id = call.path.split("/").pop()
      for (const list of Object.values(queues)) {
        const index = list.findIndex((item) => item.id === id)
        if (index >= 0) list.splice(index, 1)
      }
      return { body: { ok: true } }
    }
    if (call.path === "/api/history" && call.method === "POST") {
      queues.s1.push(queueItem("again", "Ya sonó en directo", queues.s1.length + 1))
      return { status: 201, body: { item: queues.s1.at(-1) } }
    }
    if (call.path === "/api/history" && call.method === "DELETE") {
      histories[streamerId] = []
      return { body: { ok: true, removed: 1 } }
    }
    if (call.path === "/api/youtube/search") {
      return {
        body: {
          results: [
            { youtubeId: "yt1", title: "Resultado uno", channel: "Canal", thumbnail: "", durationSec: 95 },
          ],
        },
      }
    }
    if (call.path === "/api/youtube/resolve") {
      return {
        body: {
          video: { youtubeId: "yt2", title: "Vídeo del enlace", channel: "Canal", thumbnail: "", durationSec: 61 },
        },
      }
    }
    return { status: 404, body: { error: "no encontrado" } }
  })

  return { api, queues, histories }
}

function renderDashboard(props: Partial<Parameters<typeof ModDashboard>[0]> = {}) {
  return render(
    <ModDashboard
      username="ana"
      canManageUsers={false}
      streamers={STREAMERS}
      initialStreamerId="s1"
      fromUrl={false}
      {...props}
    />
  )
}

describe("panel de moderadores", () => {
  it("muestra la cola y el historial del streamer con el que se abre", async () => {
    const { api } = dashboardServer()
    renderDashboard()

    expect(await screen.findByText("Primera de directo")).toBeInTheDocument()
    expect(screen.getByText("Segunda de directo")).toBeInTheDocument()
    expect(screen.getByText("Ya sonó en directo")).toBeInTheDocument()
    expect(screen.getByText("Cola de directo")).toBeInTheDocument()
    expect(screen.getByText("2/20")).toBeInTheDocument()
    expect(screen.queryByText("Única de otra")).not.toBeInTheDocument()

    expect(api.to("GET", "/api/queue")[0].query.get("streamerId")).toBe("s1")
    expect(api.to("GET", "/api/history")[0].query.get("streamerId")).toBe("s1")
  })

  it("al cambiar de streamer muestra su cola, lo refleja en la URL y lo recuerda", async () => {
    dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")

    await user.selectOptions(screen.getByRole("combobox"), "s2")

    expect(await screen.findByText("Única de otra")).toBeInTheDocument()
    expect(screen.queryByText("Primera de directo")).not.toBeInTheDocument()
    expect(screen.queryByText("Ya sonó en directo")).not.toBeInTheDocument()
    expect(screen.getByText("Cola de otra")).toBeInTheDocument()
    expect(router.replace).toHaveBeenCalledWith("/mod?streamer=s2", { scroll: false })
    expect(window.localStorage.getItem("ytstrnek.lastStreamer")).toBe("s2")
  })

  it("sin streamer en la URL abre el último que se gestionó en este navegador", async () => {
    window.localStorage.setItem("ytstrnek.lastStreamer", "s2")
    dashboardServer()
    renderDashboard({ initialStreamerId: "s1", fromUrl: false })

    expect(await screen.findByText("Única de otra")).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("s2")
  })

  it("el streamer pedido en la URL manda sobre el recordado", async () => {
    window.localStorage.setItem("ytstrnek.lastStreamer", "s2")
    dashboardServer()
    renderDashboard({ initialStreamerId: "s1", fromUrl: true })

    expect(await screen.findByText("Primera de directo")).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toHaveValue("s1")
  })

  it("ignora un streamer recordado que ya no existe", async () => {
    window.localStorage.setItem("ytstrnek.lastStreamer", "borrado")
    dashboardServer()
    renderDashboard()

    expect(await screen.findByText("Primera de directo")).toBeInTheDocument()
  })

  it("el botón Reproductor abre el del streamer seleccionado", async () => {
    dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")

    expect(screen.getByRole("link", { name: /Reproductor/ })).toHaveAttribute(
      "href",
      "/player?streamer=s1"
    )
    await user.selectOptions(screen.getByRole("combobox"), "s2")
    expect(screen.getByRole("link", { name: /Reproductor/ })).toHaveAttribute(
      "href",
      "/player?streamer=s2"
    )
  })

  it("una canción buscada se añade a la cola del streamer seleccionado", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")
    await user.selectOptions(screen.getByRole("combobox"), "s2")
    await screen.findByText("Única de otra")

    await user.type(screen.getByPlaceholderText("Título de la canción o artista..."), "algo{Enter}")
    const result = (await screen.findByText("Resultado uno")).closest("li") as HTMLElement
    await user.type(within(result).getByPlaceholderText("Pedido por (opcional)"), " pepe ")
    await user.click(within(result).getByRole("button", { name: "Añadir" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Añadida a la cola"))
    expect(api.to("POST", "/api/queue")[0].body).toEqual({
      streamerId: "s2",
      youtubeId: "yt1",
      requesterName: "pepe",
    })
    expect(await screen.findByText("Recién añadida")).toBeInTheDocument()
  })

  it("un enlace pegado se resuelve y queda listo para añadir", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")

    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://youtu.be/yt2"
    )
    await user.click(screen.getByRole("button", { name: "Cargar vídeo" }))

    const loaded = (await screen.findByText("Vídeo del enlace")).closest("li") as HTMLElement
    expect(api.to("POST", "/api/youtube/resolve")[0].body).toEqual({ url: "https://youtu.be/yt2" })

    await user.click(within(loaded).getByRole("button", { name: "Añadir" }))
    await waitFor(() => expect(api.to("POST", "/api/queue")).toHaveLength(1))
    expect(api.to("POST", "/api/queue")[0].body).toMatchObject({ streamerId: "s1", youtubeId: "yt2" })
  })

  it("lo cargado desde un enlace no se arrastra a la cola de otro streamer", async () => {
    dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")
    await user.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://youtu.be/yt2"
    )
    await user.click(screen.getByRole("button", { name: "Cargar vídeo" }))
    await screen.findByText("Vídeo del enlace")

    await user.selectOptions(screen.getByRole("combobox"), "s2")

    await screen.findByText("Única de otra")
    expect(screen.queryByText("Vídeo del enlace")).not.toBeInTheDocument()
  })

  it("Reproducir siguiente marca la primera del streamer seleccionado", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")

    await user.click(screen.getByRole("button", { name: "Reproducir siguiente" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Marcada como reproducida"))
    expect(api.to("POST", "/api/queue/next")[0].body).toEqual({ streamerId: "s1" })
    await waitFor(() => expect(screen.getByText("1/20")).toBeInTheDocument())
  })

  it("quitar una canción la elimina de la cola", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    const first = (await screen.findByText("Primera de directo")).closest("li") as HTMLElement

    await user.click(within(first).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Eliminada de la cola"))
    expect(api.to("DELETE", "/api/queue/a1")).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText("Primera de directo")).not.toBeInTheDocument())
  })

  it("reañade una canción desde el historial", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Ya sonó en directo")

    await user.click(screen.getByRole("button", { name: "Añadir de nuevo" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Añadida de nuevo a la cola"))
    expect(api.to("POST", "/api/history")[0].body).toEqual({ id: "h1" })
    expect(await screen.findByText("3/20")).toBeInTheDocument()
  })

  it("borra el historial del streamer seleccionado", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Ya sonó en directo")

    await user.click(screen.getByRole("button", { name: "Borrar historial" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Historial borrado"))
    expect(api.to("DELETE", "/api/history")[0].query.get("streamerId")).toBe("s1")
    expect(await screen.findByText("Aún no hay canciones reproducidas.")).toBeInTheDocument()
  })

  it("solo un admin ve el acceso a la gestión de usuarios", async () => {
    dashboardServer()
    const { unmount } = renderDashboard({ canManageUsers: false })
    await screen.findByText("Primera de directo")
    expect(screen.queryByRole("link", { name: /Usuarios/ })).not.toBeInTheDocument()
    unmount()

    renderDashboard({ canManageUsers: true })
    expect(await screen.findByRole("link", { name: /Usuarios/ })).toHaveAttribute("href", "/users")
  })

  it("cierra la sesión y vuelve al login", async () => {
    const { api } = dashboardServer()
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText("Primera de directo")

    await user.click(screen.getByRole("button", { name: "Salir" }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"))
    expect(api.to("POST", "/api/auth/logout")).toHaveLength(1)
  })
})

describe("panel sin streamers", () => {
  it("explica que hace falta un streamer y no pide ninguna cola", async () => {
    const { api } = dashboardServer()
    renderDashboard({ streamers: [], initialStreamerId: null })

    expect(screen.getByText("Todavía no hay ningún streamer")).toBeInTheDocument()
    expect(screen.getByText(/Pide a un administrador que cree uno/)).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Reproductor/ })).not.toBeInTheDocument()
    expect(api.calls).toHaveLength(0)
  })

  it("a un admin le ofrece ir a crearlo", () => {
    dashboardServer()
    renderDashboard({ streamers: [], initialStreamerId: null, canManageUsers: true })

    expect(screen.getByRole("link", { name: /Ir a usuarios/ })).toHaveAttribute("href", "/users")
  })
})
