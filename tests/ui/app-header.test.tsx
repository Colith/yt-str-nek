import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { AppHeader } from "@/components/layout/app-header"
import { mockApi } from "../helpers/fetch"
import { router } from "../helpers/navigation"

// El menú de apariencia tiene su propia prueba; aquí no aporta nada.
vi.mock("@/components/theme/appearance-menu", () => ({ AppearanceMenu: () => null }))

const SESSION = { id: "u1", username: "ana", role: "admin" }

function renderHeader(
  props: Partial<Parameters<typeof AppHeader>[0]> = {}
) {
  return render(<AppHeader session={SESSION} {...props} />)
}

describe("cabecera", () => {
  it("un admin ve el panel, el reproductor y la gestión de usuarios", () => {
    renderHeader()

    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/mod")
    expect(screen.getByRole("link", { name: "Reproductor" })).toHaveAttribute(
      "href",
      "/player"
    )
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "/users")
  })

  it("un mod no ve la gestión de usuarios", () => {
    renderHeader({ session: { ...SESSION, role: "mod" } })

    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/mod")
    expect(screen.getByRole("link", { name: "Reproductor" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument()
  })

  it("un streamer ve su cola y su reproductor, y nada del panel de administración", () => {
    renderHeader({ session: { ...SESSION, role: "streamer" } })

    expect(screen.getByRole("link", { name: "Mi cola" })).toHaveAttribute("href", "/mod")
    expect(screen.getByRole("link", { name: "Reproductor" })).toHaveAttribute(
      "href",
      "/player"
    )
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Panel" })).not.toBeInTheDocument()
  })

  it("el reproductor se abre en otra pestaña, para no parar la música", () => {
    renderHeader()

    expect(screen.getByRole("link", { name: "Reproductor" })).toHaveAttribute(
      "target",
      "_blank"
    )
    expect(screen.getByRole("link", { name: "Panel" })).not.toHaveAttribute("target")
  })

  it("el reproductor puede apuntar a la cola que se está gestionando", () => {
    renderHeader({ playerHref: "/player?streamer=s1" })

    expect(screen.getByRole("link", { name: "Reproductor" })).toHaveAttribute(
      "href",
      "/player?streamer=s1"
    )
  })

  it("la sección en la que se está no es un enlace", () => {
    const { container } = renderHeader({ active: "panel" })

    expect(screen.queryByRole("link", { name: "Panel" })).not.toBeInTheDocument()

    const active = container.querySelector('[aria-current="page"]')
    expect(active).not.toBeNull()
    expect(active).toHaveTextContent("Panel")
  })
  it("muestra el nombre y el rol del usuario", () => {
    renderHeader({ session: { ...SESSION, username: "koi", role: "mod" } })

    expect(screen.getByText("koi")).toBeInTheDocument()
    expect(screen.getByText("Mod")).toBeInTheDocument()
  })

  it("la marca lleva a la página del rol", () => {
    const { rerender } = renderHeader()
    expect(screen.getByRole("link", { name: /yt-str-nek/ })).toHaveAttribute("href", "/mod")

    rerender(<AppHeader session={{ ...SESSION, role: "streamer" }} />)
    expect(screen.getByRole("link", { name: /yt-str-nek/ })).toHaveAttribute(
      "href",
      "/player"
    )
  })

  it("cierra la sesión y vuelve al login", async () => {
    const api = mockApi(() => ({ body: { ok: true } }))
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"))
    expect(api.to("POST", "/api/auth/logout")).toHaveLength(1)
  })
})
