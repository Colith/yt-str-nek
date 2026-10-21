import { render, screen } from "@testing-library/react"
import { Children, isValidElement, type ReactElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Home from "@/app/page"
import LoginPage from "@/app/login/page"
import ModPage from "@/app/mod/page"
import PlayerPage from "@/app/player/page"
import SettingsPage from "@/app/settings/page"
import UsersPage from "@/app/users/page"
import { getSession } from "@/lib/auth"
import { listStreamers } from "@/lib/streamers"
import { ModDashboard } from "@/components/queue/mod-dashboard"
import { Player } from "@/components/player/player"

// Las páginas son componentes de servidor: aquí se comprueba qué deciden
// (redirigir, qué cola abrir, qué mostrar) con una sesión y unos streamers
// dados. La sesión y la base de datos reales se prueban en tests/server.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getSession: vi.fn(),
}))
vi.mock("@/lib/streamers", () => ({ listStreamers: vi.fn() }))
// La foto de perfil sale de la base de datos: aquí no interesa.
vi.mock("@/lib/avatars", () => ({ getAvatarUrl: vi.fn().mockResolvedValue(null) }))
vi.mock("@/components/queue/mod-dashboard", () => ({ ModDashboard: () => null }))
vi.mock("@/components/player/player", () => ({ Player: () => null }))
vi.mock("@/components/users/users-manager", () => ({
  UsersManager: () => <div>gestor de usuarios</div>,
}))
vi.mock("@/components/settings/profile-settings", () => ({
  ProfileSettings: () => <div>ajustes de perfil</div>,
}))
vi.mock("@/components/theme/appearance-menu", () => ({ AppearanceMenu: () => null }))

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

/**
 * Busca el hijo de un tipo concreto dentro de una página.
 *
 * Las páginas ahora envuelven su contenido (cabecera incluida) en un
 * fragmento, así que ya no se puede mirar lo que devuelven en `props`.
 */
function childOfType(
  page: ReactElement,
  type: unknown
): ReactElement<Record<string, unknown>> {
  const children = Children.toArray(
    (page.props as { children?: ReactNode }).children
  )
  const found = children.find((c) => isValidElement(c) && c.type === type)
  if (!found) throw new Error("la página no contiene ese elemento")
  return found as ReactElement<Record<string, unknown>>
}

beforeEach(() => withStreamers())

describe("portada", () => {
  it("sin sesión manda al login", async () => {
    session(null)

    await expect(Home()).rejects.toThrow("REDIRECT:/login")
  })

  it("a un streamer lo manda directo a su reproductor", async () => {
    session("streamer")

    await expect(Home()).rejects.toThrow("REDIRECT:/player")
  })

  it.each(["admin", "mod"])("a un %s lo manda al panel, donde trabaja", async (role) => {
    session(role)

    await expect(Home()).rejects.toThrow("REDIRECT:/mod")
  })
})

describe("página del panel (/mod)", () => {
  it("sin sesión manda al login recordando el destino", async () => {
    session(null)
    await expect(ModPage(params())).rejects.toThrow("REDIRECT:/login?callbackUrl=/mod")
  })

  it("un streamer abre el panel con su propia cola", async () => {
    session("streamer", "s1", "directo")
    withStreamers(A)

    const page = (await ModPage(params())) as ReactElement

    expect(childOfType(page, ModDashboard).props).toMatchObject({
      canManageUsers: false,
      streamers: [A],
      initialStreamerId: "s1",
    })
  })

  it("sin streamer en la URL abre la cola del primero", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await ModPage(params())) as ReactElement

    expect(childOfType(page, ModDashboard).props).toMatchObject({
      streamers: [A, B],
      initialStreamerId: "s1",
      fromUrl: false,
    })
  })

  it("abre la cola del streamer pedido en la URL", async () => {
    session("admin")
    withStreamers(A, B)

    const page = (await ModPage(params({ streamer: "s2" }))) as ReactElement

    expect(childOfType(page, ModDashboard).props).toMatchObject({
      canManageUsers: true,
      initialStreamerId: "s2",
      fromUrl: true,
    })
  })

  it("si la URL apunta a alguien que no es streamer, abre la del primero", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await ModPage(params({ streamer: "borrado" }))) as ReactElement

    expect(childOfType(page, ModDashboard).props).toMatchObject({
      initialStreamerId: "s1",
      fromUrl: false,
    })
  })

  it("sin ningún streamer abre el panel sin cola", async () => {
    session("mod")

    const page = (await ModPage(params())) as ReactElement

    expect(childOfType(page, ModDashboard).props).toMatchObject({
      streamers: [],
      initialStreamerId: null,
    })
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

    const page = (await PlayerPage(params({ streamer: "s2" }))) as ReactElement

    expect(childOfType(page, Player).props).toEqual({ streamer: A, streamers: [] })
  })

  it("admin y mod abren el reproductor del streamer pedido y pueden cambiar", async () => {
    session("mod")
    withStreamers(A, B)

    const page = (await PlayerPage(params({ streamer: "s2" }))) as ReactElement

    expect(childOfType(page, Player).props).toEqual({ streamer: B, streamers: [A, B] })
  })

  it("con un único streamer no hace falta elegir", async () => {
    session("admin")
    withStreamers(A)

    const page = (await PlayerPage(params())) as ReactElement

    expect(childOfType(page, Player).props).toEqual({ streamer: A, streamers: [A] })
  })

  it("con varios streamers y ninguno elegido, pregunta qué cola reproducir", async () => {
    session("mod")
    withStreamers(A, B)

    render((await PlayerPage(params())) as ReactElement)

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

    render((await PlayerPage(params())) as ReactElement)

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
    render((await UsersPage()) as ReactElement)

    expect(screen.getByText("gestor de usuarios")).toBeInTheDocument()
  })
})

describe("página de login", () => {
  it("muestra el formulario de acceso", async () => {
    render((await LoginPage(params())) as ReactElement)

    expect(screen.getByLabelText("Usuario")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument()
  })
})

describe("página de ajustes (/settings)", () => {
  it("sin sesión manda al login", async () => {
    session(null)
    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/login?callbackUrl=/settings")
  })

  it("cualquier rol dentro ve sus ajustes", async () => {
    session("streamer")
    render((await SettingsPage()) as ReactElement)

    expect(screen.getByText("ajustes de perfil")).toBeInTheDocument()
  })
})
