import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import {
  createSession,
  destroySession,
  getSession,
  parseRole,
  verifyCredentials,
} from "@/lib/auth"
import { ADMIN_ROLES, PANEL_ROLES, requireRoles } from "@/lib/authorize"
import { SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken } from "@/lib/session"
import { createUser, resetDatabase } from "../../helpers/factories"
import { cookieJar, signInAs } from "../../helpers/session"

beforeEach(resetDatabase)
afterEach(() => vi.unstubAllEnvs())

describe("verifyCredentials", () => {
  it("devuelve id, nombre y rol si la contraseña coincide, y nunca el hash", async () => {
    const user = await createUser("mod", "ana", await bcrypt.hash("clave-correcta", 4))

    const session = await verifyCredentials("ana", "clave-correcta")

    expect(session).toEqual({ id: user.id, username: "ana", role: "mod" })
  })

  it("devuelve null con contraseña incorrecta o usuario inexistente", async () => {
    await createUser("mod", "ana", await bcrypt.hash("clave-correcta", 4))

    expect(await verifyCredentials("ana", "otra-clave")).toBeNull()
    expect(await verifyCredentials("nadie", "clave-correcta")).toBeNull()
  })
})

describe("cookie de sesión", () => {
  const USER = { id: "u1", username: "ana", role: "admin" }

  it("createSession guarda un token válido en una cookie httpOnly de 7 días", async () => {
    await createSession(USER)

    const cookie = cookieJar.get(SESSION_COOKIE)
    expect(await verifySessionToken(cookie?.value)).toEqual(USER)
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    })
  })

  it("la cookie solo se marca como segura en producción", async () => {
    await createSession(USER)
    expect(cookieJar.get(SESSION_COOKIE)?.options?.secure).toBe(false)

    vi.stubEnv("NODE_ENV", "production")
    await createSession(USER)
    expect(cookieJar.get(SESSION_COOKIE)?.options?.secure).toBe(true)
  })

  it("getSession lee la sesión de la cookie y destroySession la elimina", async () => {
    expect(await getSession()).toBeNull()

    await createSession(USER)
    expect(await getSession()).toEqual(USER)

    await destroySession()
    expect(await getSession()).toBeNull()
  })
})

describe("parseRole", () => {
  it("solo acepta los tres roles conocidos", () => {
    expect(parseRole("admin")).toBe("admin")
    expect(parseRole("mod")).toBe("mod")
    expect(parseRole("streamer")).toBe("streamer")
    expect(parseRole("root")).toBeNull()
    expect(parseRole("")).toBeNull()
    expect(parseRole(undefined)).toBeNull()
    expect(parseRole(1)).toBeNull()
  })
})

describe("requireRoles", () => {
  it("responde 401 si no hay sesión", async () => {
    const result = await requireRoles(PANEL_ROLES)

    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it("responde 403 si el rol no está permitido", async () => {
    await signInAs({ id: "u1", username: "ana", role: "mod" })

    const result = await requireRoles(ADMIN_ROLES)

    expect((result as NextResponse).status).toBe(403)
  })

  it("devuelve la sesión si el rol está permitido", async () => {
    const session = { id: "u1", username: "ana", role: "mod" }
    await signInAs(session)

    expect(await requireRoles(PANEL_ROLES)).toEqual({ session })
  })
})
