import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { searchYoutube } from "@/lib/youtube"

export async function GET(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY no está configurada en el servidor" },
      { status: 503 }
    )
  }

  try {
    const results = await searchYoutube(q.trim())
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda. Intenta de nuevo." },
      { status: 502 }
    )
  }
}