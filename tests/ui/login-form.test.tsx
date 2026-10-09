import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { LoginForm } from "@/components/auth/login-form"
import { mockApi } from "../helpers/fetch"
import { router, setSearchParams } from "../helpers/navigation"

async function fillAndSubmit(username = "ana", password = "clave-correcta") {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText("Usuario"), username)
  await user.type(screen.getByLabelText("Contraseña"), password)
  await user.click(screen.getByRole("button", { name: "Entrar" }))
  return user
}

describe("formulario de login", () => {
  it("envía las credenciales y, si son correctas, entra al panel", async () => {
    const api = mockApi(() => ({ body: { ok: true } }))
    render(<LoginForm />)

    await fillAndSubmit()

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/mod"))
    expect(router.refresh).toHaveBeenCalled()
    expect(api.to("POST", "/api/auth/login")[0].body).toEqual({
      username: "ana",
      password: "clave-correcta",
    })
  })

  it("tras entrar vuelve a la página que se intentaba abrir", async () => {
    setSearchParams("callbackUrl=/player")
    mockApi(() => ({ body: { ok: true } }))
    render(<LoginForm />)

    await fillAndSubmit()

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/player"))
  })

  it("muestra el error del servidor y no navega si las credenciales fallan", async () => {
    mockApi(() => ({ status: 401, body: { error: "Usuario o contraseña incorrectos" } }))
    render(<LoginForm />)

    await fillAndSubmit("ana", "mala")

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuario o contraseña incorrectos")
    expect(router.push).not.toHaveBeenCalled()
    // El botón vuelve a estar disponible para reintentar
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled()
  })

  it("muestra un error genérico si no hay conexión", async () => {
    mockApi(() => {
      throw new Error("sin red")
    })
    render(<LoginForm />)

    await fillAndSubmit()

    expect(await screen.findByRole("alert")).toHaveTextContent("Error al iniciar sesión")
  })

  it("la contraseña va oculta y el botón del ojo solo muestra lo que se está tecleando", async () => {
    render(<LoginForm />)
    const user = userEvent.setup()
    const password = screen.getByLabelText("Contraseña")

    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveValue("")

    await user.type(password, "secreta")
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }))
    expect(password).toHaveAttribute("type", "text")

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }))
    expect(password).toHaveAttribute("type", "password")
  })
})
