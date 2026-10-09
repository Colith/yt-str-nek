import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Home from "@/app/page"
import LoginPage from "@/app/login/page"
import ModPage from "@/app/mod/page"
import PlayerPage from "@/app/player/page"
import UsersPage from "@/app/users/page"
import { getSession } from "@/lib/auth"
import { listStreamers } from "@/lib/streamers"

// Las páginas son componentes de servidor: aquí se comprueba qué deciden
// (redirigir, qué cola abrir, qué mostrar) con una sesión y unos streamers
// dados. La sesión y la base de datos reales se prueban en tests/server.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getSession: vi.fn(),
}))
vi.mock("@/lib/streamers", () => ({ listStreamers: vi.fn() }))
vi.mock("@/components/queue/mod-dashboard", () => ({ ModDashboard: () => null }))
vi.mock("@/components/player/player", () => ({ Player: () => null }))
vi.mock("@/components/users/users-manager", () => ({
  UsersManager: () => <div>gestor de usuarios</div>,
}))
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }))

const A = { id: "s1", username: "directo" }
const B = { id: "s2", username: "otra" }

function session(role: string | null, id = "u1", username = "ana") {
  vi.mocked(getSession).mockResolvedValue(role ? { id, username, role } : null)
}

const withStreamers = (...streamers: (typeof A)[]) =>
  vi.mocked(listStreamers).mockResolvedValue(streamers)

const params = (query: Record<string, string | string[]> = {}) => ({
  searchParams: Promise.resolve(query),
})

beforeEach(() => withStreamers())

describe("portada", () => {
  it("sin sesión enseña los dos modos y avisa de que hay que entrar", async () => {
    session(null)
    render(await Home())

    expect(screen.getByRole("link", { name: /Modo moderador/ })).toHaveAttribute("href", "/mod")
    expect(screen.getByRole("link", { name: /Modo streamer/ })).toHaveAttribute("href", "/player")
    expect(screen.getByText("Ambas vistas requieren iniciar sesión.")).toBeInTheDocument()
  })

  it("a un streamer solo le ofrece el reproductor", async () => {
    session("streamer")
    render(await Home())

    expect(screen.queryByRole("link", { name: /Modo moderador/ })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Modo streamer/ })).toBeInTheDocument()
    expect(screen.getByText(/Hola, ana/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Cerrar sesión/ })).toBeInTheDocument()
  })

  it.each(["admin", "mod"])("a un %s le ofrece los dos modos", async (role) => {
    session(role)
    render(await Home())

    expect(screen.getByRole("link", { name: /Modo moderador/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Modo streamer/ })).toBeInTheDocument()
  })
})

describe("página del panel (/mod)", () => {
  it("sin sesión manda al login recordando el destino", async () => {
    session(null)
    await expect(ModPage(params())).rejects.toThrow("REDIRECT:/login?callbackUrl=/mod")
  })

  it("a un streamer lo devuelve a la portada", async () => {
    session("streamer")
    await expect(ModPage(params())).rejects.toThrow("REDIRECT:/")
  })

  it("sin streamer en la URL abre la cola del primero", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await ModPage(params())) as ReactElement<Record<string, unknown>>

    expect(page.props).toMatchObject({
      username: "ana",
      canManageUsers: false,
      streamers: [A, B],
      initialStreamerId: "s1",
      fromUrl: false,
    })
  })

  it("abre la cola del streamer pedido en la URL", async () => {
    session("admin")
    withStreamers(A, B)

    const page = (await ModPage(params({ streamer: "s2" }))) as ReactElement<Record<string, unknown>>

    expect(page.props).toMatchObject({
      canManageUsers: true,
      initialStreamerId: "s2",
      fromUrl: true,
    })
  })

  it("si la URL apunta a alguien que no es streamer, abre la del primero", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await ModPage(params({ streamer: "borrado" }))) as ReactElement<
      Record<string, unknown>
    >

    expect(page.props).toMatchObject({ initialStreamerId: "s1", fromUrl: false })
  })

  it("sin ningún streamer abre el panel sin cola", async () => {
    session("mod")

    const page = (await ModPage(params())) as ReactElement<Record<string, unknown>>

    expect(page.props).toMatchObject({ streamers: [], initialStreamerId: null })
  })
})

describe("página del reproductor (/player)", () => {
  it("sin sesión manda al login", async () => {
    session(null)
    await expect(PlayerPage(params())).rejects.toThrow("REDIRECT:/login?callbackUrl=/player")
  })

  it("un streamer abre directamente su cola, sin poder cambiar a otra", async () => {
    session("streamer", "s1", "directo")
    withStreamers(A)

    const page = (await PlayerPage(params({ streamer: "s2" }))) as ReactElement<
      Record<string, unknown>
    >

    expect(page.props).toEqual({ streamer: A, streamers: [] })
    expect(page.key).toBe("s1")
  })

  it("admin y mod abren el reproductor del streamer pedido y pueden cambiar", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await PlayerPage(params({ streamer: "s2" }))) as ReactElement<
      Record<string, unknown>
    >

    expect(page.props).toEqual({ streamer: B, streamers: [A, B] })
  })

  it("con un único streamer no hace falta elegir", async () => {
    session("admin")
    withStreamers(A)

    const page = (await PlayerPage(params())) as ReactElement<Record<string, unknown>>

    expect(page.props).toEqual({ streamer: A, streamers: [A] })
  })

  it("con varios streamers y ninguno elegido, pregunta qué cola reproducir", async () => {
    session("mod")
    withStreamers(A, B)

    render(await PlayerPage(params()))

    expect(screen.getByText("¿Qué cola quieres reproducir?")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "directo" })).toHaveAttribute(
      "href",
      "/player?streamer=s1"
    )
    expect(screen.getByRole("link", { name: "otra" })).toHaveAttribute(
      "href",
      "/player?streamer=s2"
    )
  })

  it("si no existe ningún streamer, lo explica", async () => {
    session("admin")

    render(await PlayerPage(params()))

    expect(screen.getByText("Todavía no hay ningún streamer")).toBeInTheDocument()
  })
})

describe("página de usuarios (/users)", () => {
  it("sin sesión manda al login", async () => {
    session(null)
    await expect(UsersPage()).rejects.toThrow("REDIRECT:/login?callbackUrl=/users")
  })

  it("a un mod lo devuelve al panel", async () => {
    session("mod")
    await expect(UsersPage()).rejects.toThrow("REDIRECT:/mod")
  })

  it("un admin ve el gestor de usuarios", async () => {
    session("admin")
    render(await UsersPage())

    expect(screen.getByText("gestor de usuarios")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Volver al panel/ })).toHaveAttribute("href", "/mod")
  })
})

describe("página de login", () => {
  it("muestra el formulario de acceso", () => {
    render(<LoginPage />)

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })
})
