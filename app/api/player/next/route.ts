import { NextResponse } from "next/server"
import { requireRoles } from "@/lib/authorize"
import { PLAYER_ROLES } from "@/lib/session"
import { markAsPlayed } from "@/lib/songs"
import { resolveStreamerId } from "@/lib/streamers"

/**
 * Marca la canción actual como reproducida y deja que el siguiente sondeo
 * del reproductor cargue la nueva.
 */
export async function POST(req: Request) {
  const guard = await requireRoles(PLAYER_ROLES)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({}))
  const finishedId = typeof body.queueItemId === "string" ? body.queueItemId : null

  if (!finishedId) {
    return NextResponse.json({ error: "Falta la canción a terminar" }, { status: 400 })
  }

  const target = await resolveStreamerId(guard.session, body.streamerId)
  if (target instanceof NextResponse) return target

  // Solo avanza si el id sigue en la cola de ese streamer: es lo que el
  // reproductor tiene en pantalla. Así no se salta una canción que un mod acaba
  // de añadir por delante, ni se avanza dos veces si hay dos reproductores
  // abiertos para el mismo streamer.
  const played = await markAsPlayed(finishedId, target.streamerId)
  if (!played) {
    return NextResponse.json(
      { error: "Esa canción ya no está en la cola" },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
