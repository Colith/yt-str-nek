import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { config, proxy } from "@/proxy"
import { SESSION_COOKIE, signSessionToken } from "@/lib/session"

const ORIGIN = "http://localhost:3000"

async function visit(path: string, role?: string) {
  const headers = new Headers()
  if (role) {
    const token = await signSessionToken({ id: "u1", username: "ana", role })
    headers.set("cookie", `${SESSION_COOKIE}=${token}`)
  }
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }))
}

/** A dónde manda el proxy, o null si deja pasar la petición. */
function destination(res: Response): string | null {
  const location = res.headers.get("location")
  if (!location) return null
  const url = new URL(location)
  return url.pathname + url.search
}

describe("proxy", () => {
  it("sin sesión, las páginas protegidas llevan al login recordando el destino", async () => {
    expect(destination(await visit("/mod"))).toBe("/login?callbackUrl=%2Fmod")
    expect(destination(await visit("/player"))).toBe("/login?callbackUrl=%2Fplayer")
    expect(destination(await visit("/users"))).toBe("/login?callbackUrl=%2Fusers")
  })

  it("un token inválido cuenta como no tener sesión", async () => {
    const res = await proxy(
      new NextRequest(`${ORIGIN}/mod`, {
        headers: { cookie: `${SESSION_COOKIE}=token-falso` },
      })
    )
    expect(destination(res)).toBe("/login?callbackUrl=%2Fmod")
  })

  it("el login se deja ver sin sesión, pero con sesión manda a la portada", async () => {
    expect(destination(await visit("/login"))).toBeNull()
    expect(destination(await visit("/login", "mod"))).toBe("/")
  })

  it("admin entra en todo", async () => {
    expect(destination(await visit("/mod", "admin"))).toBeNull()
    expect(destination(await visit("/player", "admin"))).toBeNull()
    expect(destination(await visit("/users", "admin"))).toBeNull()
  })

  it("mod entra en el panel y el reproductor, pero no en usuarios", async () => {
    expect(destination(await visit("/mod", "mod"))).toBeNull()
    expect(destination(await visit("/player", "mod"))).toBeNull()
    expect(destination(await visit("/users", "mod"))).toBe("/")
  })

  it("streamer solo entra en el reproductor", async () => {
    expect(destination(await visit("/player", "streamer"))).toBeNull()
    expect(destination(await visit("/mod", "streamer"))).toBe("/")
    expect(destination(await visit("/users", "streamer"))).toBe("/")
  })

  it("un rol desconocido se trata como streamer", async () => {
    expect(destination(await visit("/player", "inventado"))).toBeNull()
    expect(destination(await visit("/mod", "inventado"))).toBe("/")
  })

  it("vigila el login y las tres zonas protegidas", () => {
    expect(config.matcher).toEqual(["/login", "/mod/:path*", "/player/:path*", "/users/:path*"])
  })
})
