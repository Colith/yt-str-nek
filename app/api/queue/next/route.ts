import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { markAsPlayed } from "@/lib/songs"
import { resolveStreamerId } from "@/lib/streamers"

/** Marca la primera canción de un streamer como reproducida y la mueve al historial. */
export async function POST(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({}))
  const target = await resolveStreamerId(guard.session, body.streamerId)
  if (target instanceof NextResponse) return target
  const { streamerId } = target

  const first = await prisma.queueItem.findFirst({
    where: { streamerId },
    orderBy: { position: "asc" },
    include: { song: true },
  })

  if (!first) {
    return NextResponse.json({ error: "La cola está vacía" }, { status: 400 })
  }

  const played = await markAsPlayed(first.id, streamerId)
  if (!played) {
    return NextResponse.json(
      { error: "Esa canción ya no está en la cola" },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true, played: first })
}
