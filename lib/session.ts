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

/**
 * Cuánto antes de caducar se renueva el token.
 *
 * La sesión es deslizante: cada visita (o cada sondeo del reproductor) mira
 * cuánto le queda y, si está por debajo de este margen, firma un token nuevo.
 * Así solo se cierra la sesión tras 7 días *sin abrir nada*, no 7 días después
 * de haber entrado. Antes caducaba siempre a los 7 días exactos y, con el
 * reproductor abierto varios días, el corte llegaba en mitad de la música.
 */
export const SESSION_RENEW_BEFORE = 60 * 60 * 24 * 3 // 3 días

export interface SessionUser {
  id: string
  username: string
  role: string
}

/**
 * Opciones de la cookie de sesión.
 *
 * Viven en una sola función para que la cookie que se crea al entrar y la que
 * se renueva a mitad de sesión no puedan quedar distintas.
 */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // En producción, solo por HTTPS. Se decide en cada llamada (no al cargar
    // el módulo) para que las pruebas puedan cambiar el entorno.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  }
}

/**
 * Roles:
 * - admin:    panel, reproductor y gestión de usuarios
 * - mod:      panel y reproductor
 * - streamer: su propio panel y su reproductor
 *
 * El rol viaja dentro del JWT, por eso vive aquí y no en lib/auth: el proxy
 * necesita comprobarlo sin arrastrar Prisma.
 */
export const ROLES = ["admin", "mod", "streamer"] as const
export type Role = (typeof ROLES)[number]

/**
 * Quién puede gestionar la cola de *cualquier* streamer.
 *
 * Es la lista que usan `listStreamers` y `resolveStreamerId`: admin y mod
 * eligen la cola que abren, mientras que un streamer siempre actúa sobre la
 * suya, pida lo que pida.
 */
export const PANEL_ROLES: readonly Role[] = ["admin", "mod"]

/**
 * Quién puede abrir el panel /mod y sus API.
 *
 * Un streamer entra en el panel, pero solo ve y toca su propia cola: el
 * scoping lo hace `resolveStreamerId`. Así puede añadir sus propias canciones
 * sin depender de un moderador.
 */
export const PANEL_ACCESS_ROLES: readonly Role[] = ["admin", "mod", "streamer"]

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

/** Por qué no hay sesión, para poder registrarlo y explicarlo en el login. */
export type SessionFailure = "missing" | "expired" | "invalid" | "config"

/**
 * Resultado de verificar el token.
 *
 * `expiresAt` va en milisegundos. Se devuelve aparte de la sesión porque el
 * proxy y las rutas de API lo usan para decidir si toca renovar la cookie.
 */
export type SessionVerification =
  | { ok: true; session: SessionUser; expiresAt: number }
  | { ok: false; reason: SessionFailure }

/**
 * Verifica el token y dice *por qué* falla si falla.
 *
 * Antes todo se convertía en `null`, así que un `AUTH_SECRET` mal configurado
 * era indistinguible de "no hay sesión" y acababa en un cierre de sesión
 * silencioso. Aquí se separa, y solo se registra el motivo: nunca el token.
 */
export async function verifySessionDetails(
  token: string | undefined
): Promise<SessionVerification> {
  if (!token) return { ok: false, reason: "missing" }

  let secret: Uint8Array
  try {
    secret = getSecret()
  } catch (error) {
    console.error(
      "[session] AUTH_SECRET no está configurada: no se puede verificar ninguna sesión",
      error
    )
    return { ok: false, reason: "config" }
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    return {
      ok: true,
      session: {
        id: payload.id as string,
        username: payload.username as string,
        role: payload.role as string,
      },
      // Si el token no trajera `exp` (no debería), se renueva en cuanto pase
      // por el proxy: así nunca queda una sesión sin fecha de caducidad.
      expiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : 0,
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "JWTExpired"
      ? "expired"
      : "invalid"
    // Un token caducado es lo normal y no ensucia los registros; uno con la
    // firma rota (por ejemplo, tras cambiar el secreto) sí interesa verlo.
    if (reason === "expired") {
      console.info("[session] token caducado")
    } else {
      console.warn("[session] token rechazado:", error instanceof Error ? error.name : error)
    }
    return { ok: false, reason }
  }
}

/** Verifica un token JWT y devuelve la sesión, o null si es inválido. */
export async function verifySessionToken(
  token: string | undefined
): Promise<SessionUser | null> {
  const result = await verifySessionDetails(token)
  return result.ok ? result.session : null
}

/** ¿Le queda tan poco al token que conviene firmar otro? */
export function shouldRenewSession(expiresAt: number, now = Date.now()): boolean {
  return expiresAt - now <= SESSION_RENEW_BEFORE * 1000
}
