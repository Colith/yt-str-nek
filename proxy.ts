import { NextResponse, type NextRequest } from "next/server"
// Importa lib/session y no lib/auth a propósito: así el proxy no arrastra
// Prisma. Aquí solo se hace una comprobación optimista del token; cada ruta
// y cada API vuelven a validar la sesión y el rol por su cuenta.
import {
  ADMIN_ROLES,
  PANEL_ROLES,
  PLAYER_ROLES,
  SESSION_COOKIE,
  hasRole,
  verifySessionToken,
  type Role,
} from "@/lib/session"

/** Rutas y roles que las pueden abrir. */
const PROTECTED: Array<{ prefix: string; roles: readonly Role[] }> = [
  { prefix: "/mod", roles: PANEL_ROLES },
  { prefix: "/users", roles: ADMIN_ROLES },
  { prefix: "/player", roles: PLAYER_ROLES },
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.nextUrl.origin
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/", origin))
  }

  const rule = PROTECTED.find((r) => pathname.startsWith(r.prefix))

  if (rule && !session) {
    const url = new URL("/login", origin)
    url.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(url)
  }

  // Con sesión pero sin permiso: a la portada, que indica el modo disponible.
  if (rule && !hasRole(session, rule.roles)) {
    return NextResponse.redirect(new URL("/", origin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/login", "/mod/:path*", "/player/:path*", "/users/:path*"],
}