import { NextResponse } from "next/server"
import { requireRoles } from "@/lib/authorize"
import { PLAYER_ROLES } from "@/lib/session"
import { listStreamers } from "@/lib/streamers"

/** Streamers cuya cola puede abrir el usuario: todos, o solo él si es streamer. */
export async function GET() {
  const guard = await requireRoles(PLAYER_ROLES)
  if (guard instanceof NextResponse) return guard

  return NextResponse.json({ streamers: await listStreamers(guard.session) })
}
