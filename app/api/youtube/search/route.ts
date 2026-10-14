import { NextResponse } from "next/server"
import { requireRoles, PANEL_ACCESS_ROLES } from "@/lib/authorize"
import { YoutubeApiError, searchYoutube, youtubeApiKeys } from "@/lib/youtube"

export async function GET(req: Request) {
  const guard = await requireRoles(PANEL_ACCESS_ROLES)
  if (guard instanceof NextResponse) return guard

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  if (youtubeApiKeys().length === 0) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY no está configurada en el servidor" },
      { status: 503 }
    )
  }

  try {
    const results = await searchYoutube(q.trim())
    return NextResponse.json({ results })
  } catch (error) {
    // La búsqueda de YouTube tiene una cuota diaria muy corta. Sin este
    // mensaje, el usuario solo veía un 502 genérico y parecía rota.
    if (error instanceof YoutubeApiError && error.isQuota) {
      return NextResponse.json(
        {
          error:
            "Se agotó la cuota diaria de búsquedas de YouTube. Prueba más tarde o añade la canción pegando el enlace.",
        },
        { status: 429 }
      )
    }

    if (error instanceof YoutubeApiError && error.reason === "keyInvalid") {
      return NextResponse.json(
        { error: "La clave de YouTube no es válida o está restringida." },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: "No se pudo completar la búsqueda. Intenta de nuevo." },
      { status: 502 }
    )
  }
}
