import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { toast } from "sonner"
import { UsersManager } from "@/components/users/users-manager"
import { mockApi, type ApiCall } from "../helpers/fetch"

const USERS = [
  { id: "u1", username: "jefa", role: "admin", createdAt: "2026-01-01", songsAdded: 3, isSelf: true },
  { id: "u2", username: "ana", role: "mod", createdAt: "2026-01-02", songsAdded: 1, isSelf: false },
  { id: "u3", username: "directo", role: "streamer", createdAt: "2026-01-03", songsAdded: 0, isSelf: false },
]

/** Servidor de mentira de /api/users; `reply` permite simular un rechazo. */
function usersServer(reply?: (call: ApiCall) => { status: number; body: unknown } | undefined) {
  return mockApi((call) => {
    const custom = reply?.(call)
    if (custom) return custom
    if (call.method === "GET") return { body: { users: USERS } }
    if (call.method === "POST") {
      return { status: 201, body: { user: { id: "u9", ...call.body, password: undefined } } }
    }
    return { body: { ok: true, user: USERS[1] } }
  })
}

const row = (username: string) => screen.getByText(username).closest("li") as HTMLElement

describe("gestión de usuarios", () => {
  it("lista los usuarios con su rol, sus canciones y quién eres tú", async () => {
    usersServer()
    render(<UsersManager />)

    expect(await screen.findByText("jefa")).toBeInTheDocument()
    expect(within(row("jefa")).getByText("(tú)")).toBeInTheDocument()
    expect(within(row("jefa")).getByText("Admin")).toBeInTheDocument()
    expect(row("jefa")).toHaveTextContent("3 canciones añadidas")
    expect(within(row("ana")).getByText("Mod")).toBeInTheDocument()
    expect(row("ana")).toHaveTextContent(/1 canción añadida(?!s)/)
    expect(within(row("directo")).getByText("Streamer")).toBeInTheDocument()
  })

  it("no deja eliminarse a uno mismo", async () => {
    usersServer()
    render(<UsersManager />)
    await screen.findByText("jefa")

    expect(screen.getByRole("button", { name: "Eliminar jefa" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Eliminar ana" })).toBeEnabled()
  })

  it("avisa si no se puede cargar la lista", async () => {
    mockApi(() => ({ status: 500, body: {} }))
    render(<UsersManager />)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se pudo cargar la lista de usuarios")
    )
    expect(screen.getByText("No hay usuarios.")).toBeInTheDocument()
  })

  it("crea un usuario con el rol elegido y recarga la lista", async () => {
    const api = usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Usuario"), "nueva")
    await user.selectOptions(within(dialog).getByLabelText("Rol"), "streamer")
    await user.type(within(dialog).getByLabelText("Contraseña"), "clave-larga")
    await user.click(within(dialog).getByRole("button", { name: "Crear" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Usuario "nueva" creado'))
    expect(api.to("POST", "/api/users")[0].body).toEqual({
      username: "nueva",
      password: "clave-larga",
      role: "streamer",
    })
    expect(api.to("GET", "/api/users")).toHaveLength(2)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("los campos de contraseña van ocultos y vacíos", async () => {
    usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(within(row("ana")).getByRole("button", { name: /Editar/ }))
    const dialog = await screen.findByRole("dialog")
    const password = within(dialog).getByLabelText("Contraseña nueva")

    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveValue("")
    expect(within(dialog).getByLabelText("Usuario")).toHaveValue("ana")
    expect(within(dialog).getByLabelText("Rol")).toHaveValue("mod")
  })

  it("muestra el motivo si el servidor rechaza el alta y deja el diálogo abierto", async () => {
    usersServer((call) =>
      call.method === "POST"
        ? { status: 409, body: { error: "Ya existe un usuario con ese nombre" } }
        : undefined
    )
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Usuario"), "ana")
    await user.type(within(dialog).getByLabelText("Contraseña"), "clave-larga")
    await user.click(within(dialog).getByRole("button", { name: "Crear" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ya existe un usuario con ese nombre")
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("al editar sin escribir contraseña no la envía, para no cambiarla por error", async () => {
    const api = usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(within(row("ana")).getByRole("button", { name: /Editar/ }))
    const dialog = await screen.findByRole("dialog")
    await user.selectOptions(within(dialog).getByLabelText("Rol"), "admin")
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Cambios guardados"))
    const [call] = api.to("PATCH", "/api/users/u2")
    expect(call.body).toEqual({ username: "ana", role: "admin" })
    expect(call.body).not.toHaveProperty("password")
  })

  it("al editar con contraseña nueva sí la envía", async () => {
    const api = usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(within(row("ana")).getByRole("button", { name: /Editar/ }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Contraseña nueva"), "otra-clave-1")
    await user.click(within(dialog).getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(api.to("PATCH", "/api/users/u2")).toHaveLength(1))
    expect(api.to("PATCH", "/api/users/u2")[0].body.password).toBe("otra-clave-1")
  })

  it("pide confirmación antes de eliminar y avisa de que el streamer pierde su cola", async () => {
    const api = usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(screen.getByRole("button", { name: "Eliminar directo" }))
    const dialog = await screen.findByRole("dialog")

    expect(dialog).toHaveTextContent("su propia cola y su historial se borran con él")
    expect(api.to("DELETE", "/api/users/u3")).toHaveLength(0)

    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Usuario "directo" eliminado'))
    expect(api.to("DELETE", "/api/users/u3")).toHaveLength(1)
  })

  it("cancelar la confirmación no elimina nada", async () => {
    const api = usersServer()
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(screen.getByRole("button", { name: "Eliminar ana" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).not.toHaveTextContent("su propia cola y su historial")
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(api.calls.filter((c) => c.method === "DELETE")).toHaveLength(0)
  })

  it("muestra el motivo si el servidor no deja eliminar", async () => {
    usersServer((call) =>
      call.method === "DELETE"
        ? { status: 400, body: { error: "No se puede eliminar el único administrador" } }
        : undefined
    )
    const user = userEvent.setup()
    render(<UsersManager />)
    await screen.findByText("jefa")

    await user.click(screen.getByRole("button", { name: "Eliminar ana" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se puede eliminar el único administrador")
    )
  })
})
