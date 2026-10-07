import { prisma } from "@/lib/prisma"
import { getVideoDetails } from "@/lib/youtube"

/**
 * Devuelve la canción almacenada para un vídeo de YouTube.
 * Si no existe todavía, consulta la API y la guarda (upsert por youtubeId).
 */
export async function upsertSong(youtubeId: string) {
  const existing = await prisma.song.findUnique({ where: { youtubeId } })
  if (existing) return existing

  const details = await getVideoDetails(youtubeId)
  if (!details) return null

  return prisma.song.upsert({
    where: { youtubeId },
    create: {
      youtubeId: details.youtubeId,
      title: details.title,
      channel: details.channel,
      thumbnail: details.thumbnail,
      durationSec: details.durationSec,
    },
    update: {
      title: details.title,
      channel: details.channel,
      thumbnail: details.thumbnail,
      durationSec: details.durationSec,
    },
  })
}

/**
 * Devuelve el siguiente position libre en la cola.
 */
export async function nextQueuePosition(): Promise<number> {
  const last = await prisma.queueItem.aggregate({ _max: { position: true } })
  return (last._max.position || 0) + 1
}

/** Renumera la cola de forma contigua desde 1. */
export async function renumberQueue(): Promise<void> {
  const items = await prisma.queueItem.findMany({
    orderBy: { position: "asc" },
    select: { id: true },
  })

  for (const [index, item] of items.entries()) {
    await prisma.queueItem.update({
      where: { id: item.id },
      data: { position: index + 1 },
    })
  }
}

/** Inserción en la cola respetando el máximo. Devuelve el error si está llena. */
export const MAX_QUEUE = 20