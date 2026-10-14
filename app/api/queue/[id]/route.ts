import { NextResponse } from "next/server"
import { requireRoles, PANEL_ACCESS_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { renumberQueue } from "@/lib/songs"
import { canAccessStreamer } from "@/lib/streamers"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRoles(PANEL_ACCESS_ROLES)
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  // Se busca primero para saber de qué cola es: un streamer solo puede borrar
  // de la suya. Si no existe o no es suya se responde igual, para no revelar
  // ids de la cola de otro.
  const item = await prisma.queueItem.findUnique({ where: { id } })
  if (!item || !canAccessStreamer(guard.session, item.streamerId)) {
    return NextResponse.json({ error: "La canción no está en la cola" }, { status: 404 })
  }

  await prisma.queueItem.delete({ where: { id } }).catch(() => null)

  // Solo se renumera la cola a la que pertenecía la canción.
  await renumberQueue(item.streamerId)

  return NextResponse.json({ ok: true })
}
