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
  verifySessionToken,
  type Role,
} from "@/lib/session"
// lib/navigation solo usa lib/session: el proxy sigue sin arrastrar Prisma.
import { defaultPathForRole } from "@/lib/navigation"

/** Rutas y roles que las pueden abrir. */
const PROTECTED: Array<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/mod", roles: PANEL_ACCESS_ROLES },
  { prefix: "/users", roles: ADMIN_ROLES },
  { prefix: "/player", roles: PLAYER_ROLES },
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.nextUrl.origin
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === "/login" && session) {
    // Ya hay sesión: se va directo a la página de su rol.
    return NextResponse.redirect(new URL(defaultPathForRole(session.role), origin))
  }

  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix))

  if (rule && !session) {
    const url = new URL("/login", origin)
    // Con la ruta y sus parámetros: al entrar se vuelve justo a la página
    // que se quería abrir, no a una versión sin la cola seleccionada.
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Con sesión pero sin permiso: a la página que le toca a su rol, sin
  // pasar por la portada y dar un salto de más.
  if (rule && session && !hasRole(session, rule.roles)) {
    return NextResponse.redirect(new URL(defaultPathForRole(session.role), origin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/login", "/mod/:path*", "/player/:path*", "/users/:path*"],
}