import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { MAX_QUEUE, nextQueuePosition, upsertSong } from "@/lib/songs"
import { addToQueueSchema } from "@/lib/validators"

export async function GET() {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const queue = await prisma.queueItem.findMany({
    include: {
      song: true,
      addedBy: { select: { id: true, username: true } },
    },
    orderBy: {
      position: "asc",
    },
  })

  return NextResponse.json({ queue })
}

export async function POST(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const queueCount = await prisma.queueItem.count()
  if (queueCount >= MAX_QUEUE) {
    return NextResponse.json(
      { error: `La cola está llena (máx. ${MAX_QUEUE} canciones)` },
      { status: 400 }
    )
  }

  const parsed = addToQueueSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const { youtubeId, requesterName } = parsed.data

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY no está configurada en el servidor" },
      { status: 503 }
    )
  }

  const song = await upsertSong(youtubeId)
  if (!song) {
    return NextResponse.json(
      { error: "No se encontró el vídeo en YouTube" },
      { status: 404 }
    )
  }

  const item = await prisma.queueItem.create({
    data: {
      position: await nextQueuePosition(),
      requesterName: requesterName?.trim() || null,
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