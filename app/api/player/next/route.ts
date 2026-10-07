import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { renumberQueue } from "@/lib/songs"

/**
 * Marca la canción actual como reproducida y deja que el siguiente sondeo
 * del reproductor cargue la nueva.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const finishedId = typeof body.queueItemId === "string" ? body.queueItemId : null

  if (!finishedId) {
    return NextResponse.json({ error: "Falta la canción a terminar" }, { status: 400 })
  }

  // Solo avanza si el id coincide con lo que el reproductor tiene en pantalla,
  // para no saltarse una canción que un mod acaba de añadir por delante.
  const playing = await prisma.queueItem.findUnique({
    where: { id: finishedId },
    include: { addedBy: { select: { username: true } } },
  })

  if (!playing) {
    return NextResponse.json(
      { error: "Esa canción ya no está en la cola" },
      { status: 409 }
    )
  }

  await prisma.historyItem.create({
    data: {
      requesterName: playing.requesterName,
      addedById: playing.addedById,
      addedByName: playing.addedBy?.username ?? null,
      songId: playing.songId,
    },
  })

  await prisma.queueItem.delete({ where: { id: playing.id } })
  await renumberQueue()

  return NextResponse.json({ ok: true })
}