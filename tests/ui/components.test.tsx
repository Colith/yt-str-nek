import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { HistoryList } from "@/components/history/history-list"
import { QueueList } from "@/components/queue/queue-list"
import { SakuraPetals } from "@/components/sakura/sakura-petals"
import { AddByUrlForm } from "@/components/search/add-by-url-form"
import { YoutubeSearch } from "@/components/search/youtube-search"
import { StreamerSelect } from "@/components/streamers/streamer-select"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import type { HistoryItem, QueueItem, YoutubeResult } from "@/types"
import { mockApi } from "../helpers/fetch"

const setTheme = vi.fn()
let resolvedTheme: string | undefined = "light"
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme, setTheme }),
}))

const song = (id: string, title: string, durationSec: number | null = 200) => ({
  id,
  youtubeId: `v-${id}`,
  title,
  channel: "Canal",
  thumbnail: "",
  durationSec,
})

function queueItem(id: string, title: string, extra: Partial<QueueItem> = {}): QueueItem {
  return {
    id,
    position: 1,
    requesterName: null,
    addedById: null,
    songId: id,
    song: song(id, title),
    addedBy: null,
    ...extra,
  }
}

const result = (id: string, title: string): YoutubeResult => ({
  youtubeId: id,
  title,
  channel: "Canal",
  thumbnail: "",
  durationSec: 95,
})

describe("QueueList", () => {
  it("con la cola vacía invita a añadir la primera canción", () => {
    render(<QueueList queue={[]} onRemove={vi.fn()} onReorder={vi.fn()} />)

    expect(screen.getByText(/La cola está vacía/)).toBeInTheDocument()
  })

  it("muestra cada canción con su número, duración, solicitante y quién la añadió", () => {
    render(
      <QueueList
        queue={[
          queueItem("a", "Primera", {
            requesterName: "pepe",
            addedBy: { id: "m", username: "ana" },
          }),
          queueItem("b", "Segunda", { song: song("b", "Segunda", null) }),
        ]}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />
    )

    const [first, second] = screen.getAllByRole("listitem")
    expect(first).toHaveTextContent("1")
    expect(first).toHaveTextContent("Primera")
    expect(first).toHaveTextContent("3:20")
    expect(first).toHaveTextContent("pepe")
    expect(first).toHaveTextContent("añadido por ana")
    expect(second).toHaveTextContent("2")
    expect(second).not.toHaveTextContent("añadido por")
    expect(within(second).getByRole("button", { name: "Reordenar Segunda" })).toBeInTheDocument()
  })

  it("el botón de eliminar avisa con el id de la canción", async () => {
    const onRemove = vi.fn()
    render(
      <QueueList
        queue={[queueItem("a", "Primera"), queueItem("b", "Segunda")]}
        onRemove={onRemove}
        onReorder={vi.fn()}
      />
    )

    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[1])

    expect(onRemove).toHaveBeenCalledWith("b")
  })
})

describe("HistoryList", () => {
  const entry = (id: string, title: string, requesterName: string | null): HistoryItem => ({
    id,
    requesterName,
    addedByName: null,
    song: song(id, title),
    playedAt: new Date().toISOString(),
  })

  it("vacío no ofrece borrar nada", () => {
    render(
      <HistoryList history={[]} onReAdd={vi.fn()} onClear={vi.fn()} clearing={false} disabled={false} />
    )

    expect(screen.getByText("Aún no hay canciones reproducidas.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Borrar historial" })).not.toBeInTheDocument()
  })

  it("muestra lo que ya sonó y permite reañadirlo o borrarlo todo", async () => {
    const onReAdd = vi.fn()
    const onClear = vi.fn()
    const first = entry("h1", "Ya sonó", "pepe")
    render(
      <HistoryList
        history={[first, entry("h2", "Otra", null)]}
        onReAdd={onReAdd}
        onClear={onClear}
        clearing={false}
        disabled={false}
      />
    )

    expect(screen.getByText(/pedido por pepe · ahora/)).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole("button", { name: "Añadir de nuevo" })[0])
    expect(onReAdd).toHaveBeenCalledWith(first)

    await userEvent.click(screen.getByRole("button", { name: "Borrar historial" }))
    expect(onClear).toHaveBeenCalled()
  })

  it("con la cola llena no deja reañadir", () => {
    render(
      <HistoryList
        history={[entry("h1", "Ya sonó", null)]}
        onReAdd={vi.fn()}
        onClear={vi.fn()}
        clearing={false}
        disabled
      />
    )

    expect(screen.getByRole("button", { name: "Añadir de nuevo" })).toBeDisabled()
  })
})

describe("YoutubeSearch", () => {
  const renderSearch = (props: Partial<Parameters<typeof YoutubeSearch>[0]> = {}) =>
    render(
      <YoutubeSearch
        onAdd={vi.fn()}
        disabled={false}
        preloaded={null}
        clearPreloaded={vi.fn()}
        {...props}
      />
    )

  it("busca al dejar de escribir, sin lanzar una petición por tecla", async () => {
    vi.useFakeTimers()
    const api = mockApi(() => ({ body: { results: [result("a", "Encontrada")] } }))
    renderSearch()
    const input = screen.getByPlaceholderText("Título de la canción o artista...")

    fireEvent.change(input, { target: { value: "ca" } })
    fireEvent.change(input, { target: { value: "can" } })
    fireEvent.change(input, { target: { value: "canción" } })
    expect(api.calls).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(api.calls).toHaveLength(1)
    expect(api.calls[0].query.get("q")).toBe("canción")
    expect(screen.getByText("Encontrada")).toBeInTheDocument()
    expect(screen.getByText(/1:35/)).toBeInTheDocument()
  })

  it("no busca con menos de 2 caracteres", async () => {
    vi.useFakeTimers()
    const api = mockApi(() => ({ body: { results: [] } }))
    renderSearch()

    fireEvent.change(screen.getByPlaceholderText("Título de la canción o artista..."), {
      target: { value: "a" },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(api.calls).toHaveLength(0)
  })

  it("avisa cuando no hay resultados", async () => {
    mockApi(() => ({ body: { results: [] } }))
    renderSearch()

    await userEvent.type(
      screen.getByPlaceholderText("Título de la canción o artista..."),
      "nada{Enter}"
    )

    expect(await screen.findByText("No se encontraron resultados.")).toBeInTheDocument()
  })

  it("muestra el error que devuelva el servidor", async () => {
    mockApi(() => ({ status: 503, body: { error: "YOUTUBE_API_KEY no está configurada en el servidor" } }))
    renderSearch()

    await userEvent.type(
      screen.getByPlaceholderText("Título de la canción o artista..."),
      "algo{Enter}"
    )

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("YOUTUBE_API_KEY no está configurada en el servidor")
    )
  })

  it("añadir pasa el resultado y el solicitante escrito", async () => {
    mockApi(() => ({ body: { results: [result("a", "Encontrada")] } }))
    const onAdd = vi.fn().mockResolvedValue(undefined)
    renderSearch({ onAdd })
    await userEvent.type(
      screen.getByPlaceholderText("Título de la canción o artista..."),
      "algo{Enter}"
    )
    await screen.findByText("Encontrada")

    await userEvent.type(screen.getByPlaceholderText("Pedido por (opcional)"), "pepe")
    await userEvent.click(screen.getByRole("button", { name: "Añadir" }))

    expect(onAdd).toHaveBeenCalledWith(result("a", "Encontrada"), "pepe")
  })

  it("con la cola llena no deja añadir ni buscar", () => {
    renderSearch({ disabled: true, preloaded: result("p", "Del enlace") })

    expect(screen.getByPlaceholderText("Título de la canción o artista...")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Añadir" })).toBeDisabled()
  })

  it("muestra el vídeo cargado desde un enlace y permite descartarlo", async () => {
    const clearPreloaded = vi.fn()
    renderSearch({ preloaded: result("p", "Del enlace"), clearPreloaded })

    expect(screen.getByText("Vídeo cargado desde el enlace")).toBeInTheDocument()
    expect(screen.getByText("Del enlace")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Limpiar" }))
    expect(clearPreloaded).toHaveBeenCalled()
  })
})

describe("AddByUrlForm", () => {
  it("resuelve el enlace y entrega el vídeo", async () => {
    const api = mockApi(() => ({ body: { video: result("a", "Del enlace") } }))
    const onResolved = vi.fn()
    render(<AddByUrlForm onResolved={onResolved} disabled={false} />)

    await userEvent.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://youtu.be/a"
    )
    await userEvent.click(screen.getByRole("button", { name: "Cargar vídeo" }))

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(result("a", "Del enlace")))
    expect(api.to("POST", "/api/youtube/resolve")[0].body).toEqual({ url: "https://youtu.be/a" })
    expect(toast.success).toHaveBeenCalledWith("Vídeo cargado")
  })

  it("muestra el error del servidor y no entrega nada", async () => {
    mockApi(() => ({ status: 400, body: { error: "Ese enlace no es un vídeo de YouTube válido" } }))
    const onResolved = vi.fn()
    render(<AddByUrlForm onResolved={onResolved} disabled={false} />)

    await userEvent.type(
      screen.getByPlaceholderText("https://www.youtube.com/watch?v=..."),
      "https://vimeo.com/1"
    )
    await userEvent.click(screen.getByRole("button", { name: "Cargar vídeo" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ese enlace no es un vídeo de YouTube válido")
    )
    expect(onResolved).not.toHaveBeenCalled()
  })

  it("con la cola llena el botón queda desactivado", () => {
    render(<AddByUrlForm onResolved={vi.fn()} disabled />)

    expect(screen.getByRole("button", { name: "Cargar vídeo" })).toBeDisabled()
  })
})

describe("StreamerSelect", () => {
  it("lista los streamers, marca el actual y avisa al elegir otro", async () => {
    const onChange = vi.fn()
    render(
      <StreamerSelect
        streamers={[
          { id: "s1", username: "directo" },
          { id: "s2", username: "otra" },
        ]}
        value="s1"
        onChange={onChange}
      />
    )

    const select = screen.getByRole("combobox")
    expect(select).toHaveValue("s1")
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "directo",
      "otra",
    ])

    await userEvent.selectOptions(select, "s2")
    expect(onChange).toHaveBeenCalledWith("s2")
  })
})

describe("ThemeToggle", () => {
  it("cambia al tema contrario del actual", async () => {
    resolvedTheme = "light"
    const { unmount } = render(<ThemeToggle />)
    await userEvent.click(screen.getByRole("button", { name: "Cambiar entre tema claro y oscuro" }))
    expect(setTheme).toHaveBeenLastCalledWith("dark")
    unmount()

    resolvedTheme = "dark"
    render(<ThemeToggle />)
    await userEvent.click(screen.getByRole("button", { name: "Cambiar entre tema claro y oscuro" }))
    expect(setTheme).toHaveBeenLastCalledWith("light")
  })

  it("pinta lo mismo sea cual sea el tema, para no romper la hidratación", () => {
    resolvedTheme = undefined
    const server = render(<ThemeToggle />).container.innerHTML
    resolvedTheme = "dark"
    const client = render(<ThemeToggle />).container.innerHTML

    expect(client).toBe(server)
  })
})

describe("SakuraPetals", () => {
  it("genera los pétalos en el navegador y los rehace al cambiar de tema", async () => {
    const { container } = render(<SakuraPetals />)
    const petals = () => Array.from(container.querySelectorAll<HTMLElement>(".petal"))

    expect(petals()).toHaveLength(20)
    expect(petals().every((p) => Number(p.style.opacity) >= 0.4)).toBe(true)

    document.documentElement.classList.add("dark")
    await waitFor(() => expect(petals().every((p) => Number(p.style.opacity) <= 0.5)).toBe(true))
    expect(petals()).toHaveLength(20)

    document.documentElement.classList.remove("dark")
  })
})
