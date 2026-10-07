import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { MAX_QUEUE, nextQueuePosition, upsertSong } from "@/lib/songs"

export async function GET() {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const history = await prisma.historyItem.findMany({
    include: {
      song: true,
    },
    orderBy: {
      playedAt: "desc",
    },
    take: 20,
  })

  return NextResponse.json({ history })
}

/** Reañade una canción del historial al final de la cola. */
export async function POST(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const body = await req.json().catch(() => ({}))
  const historyId = typeof body.id === "string" ? body.id : null
  if (!historyId) {
    return NextResponse.json({ error: "Cancción no indicada" }, { status: 400 })
  }

  const queueCount = await prisma.queueItem.count()
  if (queueCount >= MAX_QUEUE) {
    return NextResponse.json(
      { error: `La cola está llena (máx. ${MAX_QUEUE} canciones)` },
      { status: 400 }
    )
  }

  const historyItem = await prisma.historyItem.findUnique({
    where: { id: historyId },
    include: { song: true },
  })
  if (!historyItem) {
    return NextResponse.json({ error: "La canción no está en el historial" }, { status: 404 })
  }

  const song = await upsertSong(historyItem.song.youtubeId)
  if (!song) {
    return NextResponse.json({ error: "El vídeo ya no está disponible" }, { status: 404 })
  }

  const item = await prisma.queueItem.create({
    data: {
      position: await nextQueuePosition(),
      requesterName: historyItem.requesterName,
      addedById: session.id,
      songId: song.id,
    },
    include: {
      song: true,
      addedBy: { select: { id: true, username: true } },
    },
  })

  return NextResponse.json({ item }, { status: 201 })
}

/**
 * Vacía el historial.
 *
 * Solo borra el historial: la cola no se toca. Si el caller no dice nada, se
 * borra entero; con ?id= se borra una entrada concreta.
 */
export async function DELETE(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const url = new URL(req.url)
  const id = url.searchParams.get("id")

  if (id) {
    const removed = await prisma.historyItem.deleteMany({ where: { id } })
    if (removed.count === 0) {
      return NextResponse.json(
        { error: "Esa canción no está en el historial" },
        { status: 404 }
      )
    }
    return NextResponse.json({ ok: true, removed: removed.count })
  }

  const removed = await prisma.historyItem.deleteMany({})
  return NextResponse.json({ ok: true, removed: removed.count })
}