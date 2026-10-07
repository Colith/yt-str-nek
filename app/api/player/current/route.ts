import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
 * Estado del reproductor: la canción actual y cuántas van detrás.
 * No expone el resto de la cola.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  // Solo se trae la primera: el resto se cuenta aparte para no enviar más
  // datos de la cola de los necesarios.
  const current = await prisma.queueItem.findFirst({
    include: {
      song: true,
      addedBy: { select: { username: true } },
    },
    orderBy: { position: "asc" },
  })

  // El volumen guardado viaja en la misma respuesta para no añadir una
  // segunda llamada al abrir la página.
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
    where: { position: { gt: current.position } },
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