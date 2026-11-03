import { afterEach, describe, expect, it, vi } from "vitest"
import { SignJWT } from "jose"
import {
  ADMIN_ROLES,
  PANEL_ACCESS_ROLES,
  PANEL_ROLES,
  PLAYER_ROLES,
  SESSION_MAX_AGE,
  SESSION_RENEW_BEFORE,
  getSecret,
  hasRole,
  sessionCookieOptions,
  shouldRenewSession,
  signSessionToken,
  verifySessionDetails,
  verifySessionToken,
} from "@/lib/session"

const USER = { id: "u1", username: "ana", role: "mod" }

describe("tokens de sesión", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("lo que se firma se recupera tal cual al verificar", async () => {
    const token = await signSessionToken(USER)
    expect(await verifySessionToken(token)).toEqual(USER)
  })

  it("el token no lleva la contraseña ni ningún otro dato", async () => {
    const token = await signSessionToken({ ...USER, password: "secreta" } as typeof USER)
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "id", "role", "username"])
  })

  it("sin token, o con uno que no es un JWT, no hay sesión", async () => {
    expect(await verifySessionToken(undefined)).toBeNull()
    expect(await verifySessionToken("")).toBeNull()
    expect(await verifySessionToken("esto-no-es-un-jwt")).toBeNull()
  })

  it("rechaza un token manipulado para cambiar de rol", async () => {
    const token = await signSessionToken(USER)
    const [header, , signature] = token.split(".")
    const forged = Buffer.from(JSON.stringify({ ...USER, role: "admin" })).toString("base64url")
    expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull()
  })

  it("rechaza un token firmado con otro secreto", async () => {
    const token = await new SignJWT(USER)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("otro-secreto-distinto-0123456789"))
    expect(await verifySessionToken(token)).toBeNull()
  })

  it("caduca a los 7 días", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const token = await signSessionToken(USER)

    vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE - 60) * 1000))
    expect(await verifySessionToken(token)).toEqual(USER)

    vi.setSystemTime(new Date(Date.now() + 120 * 1000))
    expect(await verifySessionToken(token)).toBeNull()
  })

  it("sin AUTH_SECRET no se puede firmar, y verificar no da sesión", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const token = await signSessionToken(USER)
    vi.stubEnv("AUTH_SECRET", "")

    expect(() => getSecret()).toThrow("AUTH_SECRET")
    await expect(signSessionToken(USER)).rejects.toThrow("AUTH_SECRET")

    expect(await verifySessionToken(token)).toBeNull()
    expect(await verifySessionDetails(token)).toEqual({ ok: false, reason: "config" })
    expect(spy).toHaveBeenCalled()
  })
})

describe("motivo del fallo de sesión", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("sin token, no hay nada que verificar", async () => {
    expect(await verifySessionDetails(undefined)).toEqual({ ok: false, reason: "missing" })
    expect(await verifySessionDetails("")).toEqual({ ok: false, reason: "missing" })
  })

  it("un token con la firma rota no es una caducidad", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(await verifySessionDetails("esto-no-es-un-jwt")).toEqual({
      ok: false,
      reason: "invalid",
    })
  })

  it("un token caducado se distingue de uno inválido", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const token = await signSessionToken(USER)

    vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE + 60) * 1000))

    expect(await verifySessionDetails(token)).toEqual({ ok: false, reason: "expired" })
  })

  it("al verificar bien devuelve también cuándo caduca", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const token = await signSessionToken(USER)

    const result = await verifySessionDetails(token)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session).toEqual(USER)
    expect(result.expiresAt).toBe(Date.now() + SESSION_MAX_AGE * 1000)
  })
})

describe("renovación deslizante", () => {
  it("no renueva un token recién firmado", () => {
    const now = Date.now()
    expect(shouldRenewSession(now + SESSION_MAX_AGE * 1000, now)).toBe(false)
  })

  it("renueva cuando quedan menos de 3 días, y no justo antes", () => {
    const now = Date.now()
    expect(shouldRenewSession(now + SESSION_RENEW_BEFORE * 1000 + 60_000, now)).toBe(false)
    expect(shouldRenewSession(now + SESSION_RENEW_BEFORE * 1000 - 60_000, now)).toBe(true)
  })

  it("las opciones de la cookie son las mismas al crear y al renovar", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    })
  })
})

describe("hasRole", () => {
  const as = (role: string) => ({ id: "u", username: "u", role })

  it("sin sesión no se tiene ningún rol", () => {
    expect(hasRole(null, PLAYER_ROLES)).toBe(false)
  })

  it("el panel es de admin y mod, el reproductor de todos, los usuarios solo de admin", () => {
    expect(hasRole(as("admin"), PANEL_ROLES)).toBe(true)
    expect(hasRole(as("mod"), PANEL_ROLES)).toBe(true)
    expect(hasRole(as("streamer"), PANEL_ROLES)).toBe(false)

    expect(hasRole(as("streamer"), PLAYER_ROLES)).toBe(true)

    expect(hasRole(as("admin"), ADMIN_ROLES)).toBe(true)
    expect(hasRole(as("mod"), ADMIN_ROLES)).toBe(false)
    expect(hasRole(as("streamer"), ADMIN_ROLES)).toBe(false)
  })

  it("acceder al panel es cosa de los tres roles, aunque un streamer solo vea su cola", () => {
    expect(hasRole(as("admin"), PANEL_ACCESS_ROLES)).toBe(true)
    expect(hasRole(as("mod"), PANEL_ACCESS_ROLES)).toBe(true)
    expect(hasRole(as("streamer"), PANEL_ACCESS_ROLES)).toBe(true)
  })

  it("un rol desconocido se trata como el más restrictivo", () => {
    expect(hasRole(as("superadmin"), ADMIN_ROLES)).toBe(false)
    expect(hasRole(as("superadmin"), PANEL_ROLES)).toBe(false)
    expect(hasRole(as("superadmin"), PLAYER_ROLES)).toBe(true)
    // Cae al rol streamer, así que entra en el panel con su propia cola.
    expect(hasRole(as("superadmin"), PANEL_ACCESS_ROLES)).toBe(true)
  })
})
