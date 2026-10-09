import { NextResponse } from "next/server"
import { requireRoles } from "@/lib/authorize"
import { PLAYER_ROLES } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { resolveStreamerId } from "@/lib/streamers"

export interface PlayerSong {
  queueItemId: string
  youtubeId: string
  title: string
  channel: string
  thumbnail: string
  durationSec: number | null
  requesterName: string | null
  upNext: number
}

/**
 * Estado del reproductor de un streamer: la canción actual y cuántas van
 * detrás. No expone el resto de la cola.
 */
export async function GET(req: Request) {
  const guard = await requireRoles(PLAYER_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const target = await resolveStreamerId(
    session,
    new URL(req.url).searchParams.get("streamerId")
  )
  if (target instanceof NextResponse) return target
  const { streamerId } = target

  // Solo se trae la primera: el resto se cuenta aparte para no enviar más
  // datos de la cola de los necesarios.
  const current = await prisma.queueItem.findFirst({
    where: { streamerId },
    include: { song: true },
    orderBy: { position: "asc" },
  })

  // El volumen guardado viaja en la misma respuesta para no añadir una
  // segunda llamada al abrir la página. Es de quien escucha, no del streamer
  // cuya cola suena.
  //
  // Va con red de seguridad: si la columna volume no está en la base (migración
  // sin aplicar), el reproductor debe seguir dando la cola. Perder el volumen
  // guardado no puede parar la música.
  let savedVolume: number | null = null
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { volume: true },
    })
    savedVolume = user?.volume ?? null
  } catch (error) {
    console.error("No se pudo leer el volumen guardado:", error)
  }

  if (!current) {
    return NextResponse.json({ current: null, upNext: 0, savedVolume })
  }

  const upNext = await prisma.queueItem.count({
    where: { streamerId, position: { gt: current.position } },
  })

  const payload: PlayerSong = {
    queueItemId: current.id,
    youtubeId: current.song.youtubeId,
    title: current.song.title,
    channel: current.song.channel,
    thumbnail: current.song.thumbnail,
    durationSec: current.song.durationSec,
    requesterName: current.requesterName,
    upNext,
  }

  return NextResponse.json({ current: payload, upNext, savedVolume })
}
