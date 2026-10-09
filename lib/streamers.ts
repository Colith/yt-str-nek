import { NextResponse } from "next/server"
import { PANEL_ROLES, hasRole, type SessionUser } from "@/lib/session"
import { prisma } from "@/lib/prisma"

export interface StreamerOption {
  id: string
  username: string
}

/** Streamers a los que la sesión puede acceder, por orden de antigüedad. */
export async function listStreamers(session: SessionUser): Promise<StreamerOption[]> {
  // Un streamer solo se ve a sí mismo: no tiene por qué saber quién más hay.
  if (!hasRole(session, PANEL_ROLES)) {
    return [{ id: session.id, username: session.username }]
  }

  return prisma.user.findMany({
    where: { role: "streamer" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true },
  })
}

/**
 * Decide sobre la cola de qué streamer actúa una petición.
 *
 * Un streamer siempre actúa sobre la suya, pida lo que pida: así no puede leer
 * ni tocar la de otro cambiando un parámetro. Admin y mod tienen que indicar
 * una, y debe ser la de un usuario que de verdad sea streamer.
 */
export async function resolveStreamerId(
  session: SessionUser,
  requested: unknown
): Promise<{ streamerId: string } | NextResponse> {
  if (!hasRole(session, PANEL_ROLES)) {
    return { streamerId: session.id }
  }

  if (typeof requested !== "string" || !requested) {
    return NextResponse.json({ error: "Falta indicar el streamer" }, { status: 400 })
  }

  const streamer = await prisma.user.findFirst({
    where: { id: requested, role: "streamer" },
    select: { id: true },
  })
  if (!streamer) {
    return NextResponse.json({ error: "Ese streamer no existe" }, { status: 404 })
  }

  return { streamerId: streamer.id }
}
