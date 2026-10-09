import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import { NextRequest } from "next/server"
import { POST as login } from "@/app/api/auth/login/route"
import { POST as apiLogout } from "@/app/api/auth/logout/route"
import { GET as logoutGet, POST as logoutPost } from "@/app/logout/route"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session"
import { createUser, resetDatabase } from "../../helpers/factories"
import { jsonRequest, readJson } from "../../helpers/http"
import { cookieJar, signInAs } from "../../helpers/session"

beforeEach(async () => {
  await resetDatabase()
  await createUser("mod", "ana", await bcrypt.hash("clave-correcta", 4))
})
afterEach(() => vi.restoreAllMocks())

const attempt = (body: unknown) => login(jsonRequest("/api/auth/login", "POST", body))

describe("POST /api/auth/login", () => {
  it("con credenciales correctas abre sesión con el rol del usuario", async () => {
    const res = await attempt({ username: "ana", password: "clave-correcta" })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ ok: true })
    const session = await verifySessionToken(cookieJar.get(SESSION_COOKIE)?.value)
    expect(session).toMatchObject({ username: "ana", role: "mod" })
  })

  it("ignora los espacios alrededor del nombre de usuario", async () => {
    const res = await attempt({ username: "  ana  ", password: "clave-correcta" })
    expect(res.status).toBe(200)
  })

  it("con contraseña incorrecta responde 401 y no abre sesión", async () => {
    const res = await attempt({ username: "ana", password: "otra" })

    expect(res.status).toBe(401)
    expect(await readJson(res)).toEqual({ error: "Usuario o contraseña incorrectos" })
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)
  })

  it("da el mismo error si el usuario no existe, para no revelar cuáles hay", async () => {
    const res = await attempt({ username: "nadie", password: "clave-correcta" })

    expect(res.status).toBe(401)
    expect(await readJson(res)).toEqual({ error: "Usuario o contraseña incorrectos" })
  })

  it("exige usuario y contraseña", async () => {
    const noUser = await attempt({ username: "   ", password: "x" })
    expect(noUser.status).toBe(400)
    expect(await readJson(noUser)).toEqual({ error: "Usuario requerido" })

    const noPassword = await attempt({ username: "ana", password: "" })
    expect(noPassword.status).toBe(400)
    expect(await readJson(noPassword)).toEqual({ error: "Contraseña requerida" })

    expect((await attempt({})).status).toBe(400)
  })

  it("responde 500 si el cuerpo no es JSON", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await login(
      new Request("http://localhost:3000/api/auth/login", { method: "POST", body: "{" })
    )
    expect(res.status).toBe(500)
  })
})

describe("cierre de sesión", () => {
  beforeEach(() => signInAs({ id: "u1", username: "ana", role: "mod" }))

  it("POST /api/auth/logout borra la cookie", async () => {
    const res = await apiLogout()

    expect(await readJson(res)).toEqual({ ok: true })
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)
  })

  it("/logout borra la cookie y vuelve a la portada, por POST y por GET", async () => {
    const post = await logoutPost(
      new NextRequest("http://localhost:3000/logout", { method: "POST" })
    )
    expect(post.status).toBe(303)
    expect(post.headers.get("location")).toBe("http://localhost:3000/")
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)

    await signInAs({ id: "u1", username: "ana", role: "mod" })
    const get = await logoutGet(new NextRequest("http://localhost:3000/logout"))
    expect(get.headers.get("location")).toBe("http://localhost:3000/")
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false)
  })
})
