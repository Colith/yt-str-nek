import { SignJWT, jwtVerify } from "jose"

/**
 * Verificación de sesión sin acceso a la base de datos.
 *
 * Se separa de lib/auth.ts a propósito: proxy.ts solo necesita comprobar el
 * token, y arrastrar Prisma hasta el proxy abriría un cliente de base de datos
 * en cada petición, que es justo lo que Next 16 desaconseja para proxy.
 */

export const SESSION_COOKIE = "ytstrnek.session"
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 días

export interface SessionUser {
  id: string
  username: string
  role: string
}

/**
 * Roles:
 * - admin:    panel, reproductor y gestión de usuarios
 * - mod:      panel y reproductor
 * - streamer: solo el reproductor
 *
 * El rol viaja dentro del JWT, por eso vive aquí y no en lib/auth: el proxy
 * necesita comprobarlo sin arrastrar Prisma.
 */
export const ROLES = ["admin", "mod", "streamer"] as const
export type Role = (typeof ROLES)[number]

export const PANEL_ROLES: readonly Role[] = ["admin", "mod"]
export const ADMIN_ROLES: readonly Role[] = ["admin"]
export const PLAYER_ROLES: readonly Role[] = ["admin", "mod", "streamer"]

/** Un rol desconocido se trata como el más restrictivo. */
export function hasRole(
  session: SessionUser | null,
  allowed: readonly Role[]
): boolean {
  if (!session) return false
  const role = ROLES.includes(session.role as Role)
    ? (session.role as Role)
    : "streamer"
  return allowed.includes(role)
}

export function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurada")
  }
  return new TextEncoder().encode(secret)
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
}

/** Verifica un token JWT y devuelve la sesión, o null si es inválido. */
export async function verifySessionToken(
  token: string | undefined
): Promise<SessionUser | null> {
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      id: payload.id as string,
      username: payload.username as string,
      role: payload.role as string,
    }
  } catch {
    return null
  }
}