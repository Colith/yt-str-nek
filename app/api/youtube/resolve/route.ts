import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRoles, PANEL_ACCESS_ROLES } from "@/lib/authorize"
import { extractYoutubeId, getVideoDetails, youtubeApiKeys } from "@/lib/youtube"

const bodySchema = z.object({ url: z.string().trim().min(1) })

/** Resuelve un enlace de YouTube a los datos del vídeo, sin guardarlo en la cola. */
export async function POST(req: Request) {
  const guard = await requireRoles(PANEL_ACCESS_ROLES)
  if (guard instanceof NextResponse) return guard

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Pega el enlace del video" }, { status: 400 })
  }

  const id = extractYoutubeId(parsed.data.url)
  if (!id) {
    return NextResponse.json(
      { error: "Ese enlace no es un video de YouTube válido" },
      { status: 400 }
    )
  }

  if (youtubeApiKeys().length === 0) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY no está configurada en el servidor" },
      { status: 503 }
    )
  }

  try {
    const video = await getVideoDetails(id)
    if (!video) {
      return NextResponse.json(
        { error: "No se encontró el video. Revisa el enlace." },
        { status: 404 }
      )
    }
    return NextResponse.json({ video })
  } catch {
    return NextResponse.json(
      { error: "No se pudo obtener el video. Intenta de nuevo." },
      { status: 502 }
    )
  }
}