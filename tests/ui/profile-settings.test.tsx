import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { ProfileSettings } from "@/components/settings/profile-settings"
import { mockApi } from "../helpers/fetch"
import { router } from "../helpers/navigation"

// El recorte se hace con canvas, que no existe en jsdom: aquí se comprueba
// que la imagen llega al servidor, no cómo se recorta.
const { resizeToAvatar } = vi.hoisted(() => ({ resizeToAvatar: vi.fn() }))
vi.mock("@/components/settings/resize-image", () => ({ resizeToAvatar }))

beforeEach(() => {
  resizeToAvatar.mockResolvedValue(
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" })
  )
})

const PICTURE = "/api/avatars/u1?v=1"

function renderSettings(avatarUrl: string | null = null) {
  return render(<ProfileSettings username="ana" avatarUrl={avatarUrl} />)
}

/** Elige un fichero en el campo de la foto. */
async function choosePicture(user: ReturnType<typeof userEvent.setup>) {
  const input = document.getElementById("avatar-file") as HTMLInputElement
  const file = new File(["imagen"], "foto.png", { type: "image/png" })
  await user.upload(input, file)
  return file
}

describe("ajustes de la foto de perfil", () => {
  it("sin foto, se pintan las iniciales y se ofrece subirla", () => {
    const { container } = renderSettings()

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("AN")
    expect(screen.getByRole("button", { name: "Subir una foto" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Quitar la foto" })).not.toBeInTheDocument()
  })

  it("con foto, se ve la imagen y se puede cambiarla o quitarla", () => {
    const { container } = renderSettings(PICTURE)

    expect(container.querySelector("img")).toHaveAttribute("src", PICTURE)
    expect(screen.getByRole("button", { name: "Cambiar la foto" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Quitar la foto" })).toBeInTheDocument()
  })

  it("al elegir una imagen, la recorta y la sube", async () => {
    const api = mockApi(() => ({ body: { ok: true, url: "/api/avatars/u1?v=2" } }))
    const user = userEvent.setup()
    renderSettings()

    await choosePicture(user)

    await waitFor(() => expect(api.to("PUT", "/api/me/avatar")).toHaveLength(1))
    expect(resizeToAvatar).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Foto guardada"))
  })

  it("al guardar, la página se refresca para que la cabecera muestre la foto", async () => {
    mockApi(() => ({ body: { ok: true, url: "/api/avatars/u1?v=2" } }))
    const user = userEvent.setup()
    renderSettings()

    await choosePicture(user)

    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
  })

  it("si el servidor rechaza la imagen, avisa y no cambia la foto", async () => {
    mockApi(() => ({ status: 400, body: { error: "Ese fichero no es una imagen" } }))
    const user = userEvent.setup()
    const { container } = renderSettings(PICTURE)

    await choosePicture(user)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ese fichero no es una imagen")
    )
    expect(container.querySelector("img")).toHaveAttribute("src", PICTURE)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("si no se puede recortar la imagen, avisa", async () => {
    mockApi(() => ({ body: { ok: true } }))
    resizeToAvatar.mockRejectedValueOnce(new Error("No se ha podido leer esa imagen"))
    const user = userEvent.setup()
    renderSettings()

    await choosePicture(user)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No se ha podido leer esa imagen")
    )
  })

  it("quitar la foto la borra y vuelve a las iniciales", async () => {
    const api = mockApi(() => ({ body: { ok: true } }))
    const user = userEvent.setup()
    const { container } = renderSettings(PICTURE)

    await user.click(screen.getByRole("button", { name: "Quitar la foto" }))

    await waitFor(() => expect(api.to("DELETE", "/api/me/avatar")).toHaveLength(1))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Foto quitada"))
    expect(container.querySelector("img")).toBeNull()
    expect(screen.queryByRole("button", { name: "Quitar la foto" })).not.toBeInTheDocument()
  })

  it("si no se puede quitar la foto, avisa", async () => {
    mockApi(() => ({ status: 500, body: { error: "Algo ha ido mal" } }))
    const user = userEvent.setup()
    renderSettings(PICTURE)

    await user.click(screen.getByRole("button", { name: "Quitar la foto" }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Algo ha ido mal"))
  })
})
