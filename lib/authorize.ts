import { NextResponse } from "next/server"
import {
  ADMIN_ROLES,
  PANEL_ROLES,
  getSession,
  hasRole,
  type Role,
  type SessionUser,
} from "@/lib/auth"

export { ADMIN_ROLES, PANEL_ROLES }

/**
 * Exige una sesión con alguno de los roles indicados.
 *
 * Devuelve la sesión o una respuesta ya preparada, para poder escribir
 * `const guard = await requireRoles(PANEL_ROLES); if (guard) return guard`.
 *
 * El proxy ya filtra las páginas, pero repeatido en cada ruta: si alguien llega
 * a /api/queue directamente, la comprobación tiene que estar aquí también.
 */
export async function requireRoles(
  allowed: readonly Role[]
): Promise<{ session: SessionUser } | NextResponse> {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  if (!hasRole(session, allowed)) {
    return NextResponse.json({ error: "Sin permiso para esta acción" }, { status: 403 })
  }

  return { session }
}