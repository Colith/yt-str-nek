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

/** Devuelve la siguiente posición libre en la cola de un streamer. */
export async function nextQueuePosition(streamerId: string): Promise<number> {
  const last = await prisma.queueItem.aggregate({
    where: { streamerId },
    _max: { position: true },
  })
  return (last._max.position || 0) + 1
}

/** Renumera la cola de un streamer de forma contigua desde 1. */
export async function renumberQueue(streamerId: string): Promise<void> {
  const items = await prisma.queueItem.findMany({
    where: { streamerId },
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

/**
 * Saca una canción de la cola y la apunta en el historial de su streamer.
 *
 * Devuelve false si ya no estaba en la cola. Va en una transacción y solo
 * apunta el historial si el borrado encontró la fila: si dos reproductores
 * abiertos terminan la misma canción a la vez, solo uno la avanza, y así ni se
 * salta la siguiente ni se duplica la entrada del historial.
 */
export async function markAsPlayed(
  queueItemId: string,
  streamerId: string
): Promise<boolean> {
  const played = await prisma.$transaction(async (tx) => {
    const item = await tx.queueItem.findFirst({
      where: { id: queueItemId, streamerId },
      include: { addedBy: { select: { username: true } } },
    })
    if (!item) return false

    const removed = await tx.queueItem.deleteMany({ where: { id: item.id } })
    if (removed.count === 0) return false

    await tx.historyItem.create({
      data: {
        requesterName: item.requesterName,
        addedById: item.addedById,
        addedByName: item.addedBy?.username ?? null,
        songId: item.songId,
        streamerId,
      },
    })
    return true
  })

  if (played) await renumberQueue(streamerId)
  return played
}

/** Máximo de canciones en la cola de cada streamer. */
export const MAX_QUEUE = 20
