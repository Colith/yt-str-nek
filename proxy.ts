import { NextResponse, type NextRequest } from "next/server"
// Importa lib/session y no lib/auth a propósito: así el proxy no arrastra
// Prisma. Aquí solo se hace una comprobación optimista del token; cada ruta
// y cada API vuelven a validar la sesión y el rol por su cuenta.
import {
  ADMIN_ROLES,
  PANEL_ACCESS_ROLES,
  PLAYER_ROLES,
  SESSION_COOKIE,
  hasRole,
  sessionCookieOptions,
  shouldRenewSession,
  signSessionToken,
  verifySessionDetails,
  type Role,
} from "@/lib/session"
// lib/navigation solo usa lib/session: el proxy sigue sin arrastrar Prisma.
import { defaultPathForRole } from "@/lib/navigation"

/** Rutas y roles que las pueden abrir. */
const PROTECTED: Array<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/mod", roles: PANEL_ACCESS_ROLES },
  { prefix: "/users", roles: ADMIN_ROLES },
  { prefix: "/player", roles: PLAYER_ROLES },
  { prefix: "/settings", roles: PLAYER_ROLES },
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.nextUrl.origin
  const result = await verifySessionDetails(request.cookies.get(SESSION_COOKIE)?.value)
  const session = result.ok ? result.session : null

  // Sesión deslizante: si al token le queda poco, se firma otro y se manda en
  // la misma respuesta. Da igual que la respuesta sea un pase o un redirect:
  // lo importante es que el navegador reciba la cookie nueva.
  const renewed =
    result.ok && shouldRenewSession(result.expiresAt)
      ? await signSessionToken(result.session)
      : null

  const finish = (response: NextResponse) => {
    if (renewed) {
      response.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions())
    }
    return response
  }

  if (pathname === "/login" && session) {
    // Ya hay sesión: se va directo a la página de su rol.
    return finish(NextResponse.redirect(new URL(defaultPathForRole(session.role), origin)))
  }

  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix))

  if (rule && !session) {
    const url = new URL("/login", origin)
    // Con la ruta y sus parámetros: al entrar se vuelve justo a la página
    // que se quería abrir, no a una versión sin la cola seleccionada.
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search)
    // El motivo se muestra en el login y ayuda a distinguir una caducidad
    // normal (7 días sin entrar) de un secreto que ha cambiado.
    if (!result.ok && result.reason === "expired") url.searchParams.set("motivo", "caducada")
    if (!result.ok && result.reason === "invalid") url.searchParams.set("motivo", "invalida")
    return finish(NextResponse.redirect(url))
  }

  // Con sesión pero sin permiso: a la página que le toca a su rol, sin
  // pasar por la portada y dar un salto de más.
  if (rule && session && !hasRole(session, rule.roles)) {
    return finish(NextResponse.redirect(new URL(defaultPathForRole(session.role), origin)))
  }

  return finish(NextResponse.next())
}

export const config = {
  matcher: [
    "/login",
    "/mod/:path*",
    "/player/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
}