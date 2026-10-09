import { prisma } from "@/lib/prisma"
import type { Role, SessionUser } from "@/lib/session"
import { signInAs } from "./session"

let counter = 0

/** Vacía todas las tablas. Se llama antes de cada prueba que toca la base. */
export async function resetDatabase(): Promise<void> {
  await prisma.queueItem.deleteMany()
  await prisma.historyItem.deleteMany()
  await prisma.song.deleteMany()
  await prisma.user.deleteMany()
}

export async function createUser(
  role: Role,
  username = `${role}-${++counter}`,
  password = "sin-hash"
) {
  return prisma.user.create({ data: { username, password, role } })
}

export function toSession(user: {
  id: string
  username: string
  role: string
}): SessionUser {
  return { id: user.id, username: user.username, role: user.role }
}

/** Crea un usuario y deja la petición autenticada como él. */
export async function signInAsNew(role: Role, username?: string) {
  const user = await createUser(role, username)
  await signInAs(toSession(user))
  return user
}

export async function createSong(
  youtubeId = `video-${++counter}`,
  title = `Canción ${counter}`
) {
  return prisma.song.create({
    data: { youtubeId, title, channel: "Canal", thumbnail: "", durationSec: 200 },
  })
}

/** Añade una canción nueva al final de la cola de un streamer. */
export async function enqueue(
  streamerId: string,
  options: { addedById?: string; requesterName?: string; title?: string } = {}
) {
  const song = await createSong(undefined, options.title)
  const last = await prisma.queueItem.aggregate({
    where: { streamerId },
    _max: { position: true },
  })
  return prisma.queueItem.create({
    data: {
      position: (last._max.position ?? 0) + 1,
      songId: song.id,
      streamerId,
      addedById: options.addedById ?? null,
      requesterName: options.requesterName ?? null,
    },
    include: { song: true },
  })
}

/** Títulos de la cola de un streamer, en orden de reproducción. */
export async function queueTitles(streamerId: string): Promise<string[]> {
  const items = await prisma.queueItem.findMany({
    where: { streamerId },
    orderBy: { position: "asc" },
    include: { song: true },
  })
  return items.map((item) => item.song.title)
}

export async function queuePositions(streamerId: string): Promise<number[]> {
  const items = await prisma.queueItem.findMany({
    where: { streamerId },
    orderBy: { position: "asc" },
    select: { position: true },
  })
  return items.map((item) => item.position)
}

/** Títulos del historial de un streamer, del más reciente al más antiguo. */
export async function historyTitles(streamerId: string): Promise<string[]> {
  const items = await prisma.historyItem.findMany({
    where: { streamerId },
    orderBy: { playedAt: "desc" },
    include: { song: true },
  })
  return items.map((item) => item.song.title)
}
