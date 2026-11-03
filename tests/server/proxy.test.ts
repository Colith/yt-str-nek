import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { config, proxy } from "@/proxy"
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session"

const ORIGIN = "http://localhost:3000"
const USER = { id: "u1", username: "ana", role: "mod" }

function request(path: string, token?: string) {
  const headers = new Headers()
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${token}`)
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }))
}

async function visit(path: string, role?: string) {
  const token = role ? await signSessionToken({ ...USER, role }) : undefined
  return request(path, token)
}

/** Token firmado hace `days` días, para probar la renovación. */
async function tokenFrom(days: number) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  const token = await signSessionToken(USER)
  vi.setSystemTime(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
  return token
}

/** A dónde manda el proxy, o null si deja pasar la petición. */
function destination(res: Response): string | null {
  const location = res.headers.get("location")
  if (!location) return null
  const url = new URL(location)
  return url.pathname + url.search
}

describe("proxy", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("sin sesión, las páginas protegidas llevan al login recordando el destino", async () => {
    expect(destination(await visit("/mod"))).toBe("/login?callbackUrl=%2Fmod")
    expect(destination(await visit("/player"))).toBe("/login?callbackUrl=%2Fplayer")
    expect(destination(await visit("/users"))).toBe("/login?callbackUrl=%2Fusers")
    expect(destination(await visit("/settings"))).toBe("/login?callbackUrl=%2Fsettings")
  })

  it("un token inválido cuenta como no tener sesión y lo dice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const res = await request("/mod", "token-falso")
    expect(destination(res)).toBe("/login?callbackUrl=%2Fmod&motivo=invalida")
  })

  it("un token caducado manda al login explicando que ha caducado", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const token = await tokenFrom(8)

    const res = await request("/mod", token)

    expect(destination(res)).toBe("/login?callbackUrl=%2Fmod&motivo=caducada")
  })

  it("el login se deja ver sin sesión, pero con sesión manda a la página del rol", async () => {
    expect(destination(await visit("/login"))).toBeNull()
    expect(destination(await visit("/login", "mod"))).toBe("/mod")
    expect(destination(await visit("/login", "streamer"))).toBe("/player")
  })

  it("admin entra en todo", async () => {
    expect(destination(await visit("/mod", "admin"))).toBeNull()
    expect(destination(await visit("/player", "admin"))).toBeNull()
    expect(destination(await visit("/users", "admin"))).toBeNull()
    expect(destination(await visit("/settings", "admin"))).toBeNull()
  })

  it("mod entra en el panel y el reproductor, pero no en usuarios", async () => {
    expect(destination(await visit("/mod", "mod"))).toBeNull()
    expect(destination(await visit("/player", "mod"))).toBeNull()
    expect(destination(await visit("/users", "mod"))).toBe("/mod")
  })

  it("streamer entra en el panel (solo su cola) y en el reproductor, pero no en usuarios", async () => {
    expect(destination(await visit("/player", "streamer"))).toBeNull()
    expect(destination(await visit("/mod", "streamer"))).toBeNull()
    expect(destination(await visit("/users", "streamer"))).toBe("/player")
  })

  it("los ajustes son de todos: cada rol entra en los suyos", async () => {
    for (const role of ["admin", "mod", "streamer"]) {
      expect(destination(await visit("/settings", role))).toBeNull()
    }
  })

  it("un rol desconocido se trata como streamer", async () => {
    expect(destination(await visit("/player", "inventado"))).toBeNull()
    expect(destination(await visit("/mod", "inventado"))).toBeNull()
    expect(destination(await visit("/users", "inventado"))).toBe("/player")
  })

  it("el destino al entrar conserva los parámetros de la página", async () => {
    expect(destination(await visit("/mod?streamer=s1"))).toBe(
      "/login?callbackUrl=%2Fmod%3Fstreamer%3Ds1"
    )
  })

  it("vigila el login y las cuatro zonas protegidas", () => {
    expect(config.matcher).toEqual([
      "/login",
      "/mod/:path*",
      "/player/:path*",
      "/users/:path*",
      "/settings/:path*",
    ])
  })
})

describe("sesión deslizante", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("renueva la cookie cuando al token le quedan pocos días", async () => {
    const token = await tokenFrom(6) // de 7 días, le queda 1
    const before = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    ).exp as number

    const res = await request("/mod", token)

    expect(destination(res)).toBeNull()
    const renewed = res.cookies.get(SESSION_COOKIE)?.value
    expect(renewed).toBeTruthy()
    expect(renewed).not.toBe(token)
    expect(await verifySessionToken(renewed)).toEqual(USER)

    // El token nuevo vuelve a durar los 7 días completos.
    const after = JSON.parse(
      Buffer.from(renewed!.split(".")[1], "base64url").toString()
    ).exp as number
    expect(after).toBe(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    expect(after).toBeGreaterThan(before)

    const header = res.headers.get("set-cookie") ?? ""
    expect(header).toContain("HttpOnly")
    expect(header).toContain(`Max-Age=${SESSION_MAX_AGE}`)
  })

  it("no toca la cookie si al token le queda margen de sobra", async () => {
    const res = await request("/mod", await tokenFrom(1))

    expect(destination(res)).toBeNull()
    expect(res.headers.get("set-cookie")).toBeNull()
  })

  it("también renueva al redirigir desde /login a la página del rol", async () => {
    const token = await tokenFrom(6)

    const res = await request("/login", token)

    expect(destination(res)).toBe("/mod")
    expect(res.cookies.get(SESSION_COOKIE)?.value).not.toBe(token)
  })
})
