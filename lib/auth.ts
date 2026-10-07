import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import {
  ADMIN_ROLES,
  PANEL_ROLES,
  PLAYER_ROLES,
  ROLES,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  hasRole,
  signSessionToken,
  verifySessionToken,
  type Role,
  type SessionUser,
} from "@/lib/session"

export { SESSION_COOKIE, verifySessionToken }
export type { SessionUser, Role }

export async function createSession(user: SessionUser): Promise<void> {
  const token = await signSessionToken(user)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value)
}

/** Verifica credenciales contra la base de datos. Devuelve null si no coinciden. */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return null

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) return null

  return { id: user.id, username: user.username, role: user.role }
}

export { ROLES, PANEL_ROLES, ADMIN_ROLES, PLAYER_ROLES, hasRole }

/** Convierte un valor en un rol válido, o null si no lo es. */
export function parseRole(role: unknown): Role | null {
  if (typeof role !== "string") return null
  return ROLES.includes(role as Role) ? (role as Role) : null
}