export function extractYoutubeId(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.slice(1)
      return id.split("/")[0] || null
    }

    if (parsed.hostname.includes("youtube.com")) {
      const v = parsed.searchParams.get("v")
      if (v) return v

      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/shorts/")[1]
        return id?.split("/")[0] || null
      }

      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/embed/")[1]
        return id?.split("?")[0] || null
      }
    }
    return null
  } catch {
    return null
  }
}

export function isValidYoutubeUrl(url: string): boolean {
  return extractYoutubeId(url) !== null
}

/** Convierte una duración ISO 8601 (PT1H2M3S) a segundos. */
function parseDuration(duration: string): number | null {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return null
  const hours = parseInt(match[1] || "0", 10)
  const minutes = parseInt(match[2] || "0", 10)
  const seconds = parseInt(match[3] || "0", 10)
  return hours * 3600 + minutes * 60 + seconds
}

export interface YoutubeResult {
  youtubeId: string
  title: string
  channel: string
  thumbnail: string
  durationSec: number | null
}

interface ApiSnippet {
  title?: string
  channelTitle?: string
  thumbnails?: {
    medium?: { url?: string }
    default?: { url?: string }
  }
}

interface SearchApiItem {
  id?: { videoId?: string }
  snippet?: ApiSnippet
}

interface SearchApiResponse {
  items?: SearchApiItem[]
}

interface VideosApiItem {
  id?: string
  snippet?: ApiSnippet
  contentDetails?: { duration?: string }
}

interface VideosApiResponse {
  items?: VideosApiItem[]
}

/** Claves de YouTube configuradas, en orden de preferencia. */
export function youtubeApiKeys(): string[] {
  return [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2]
    .map((key) => key?.trim())
    .filter((key): key is string => Boolean(key))
}

interface GoogleErrorPayload {
  error?: {
    code?: number
    message?: string
    errors?: { reason?: string }[]
  }
}

/**
 * Error de la API de YouTube, con el motivo real que devuelve Google.
 *
 * El endpoint de búsqueda lo traduce a un mensaje útil (cuota agotada, clave
 * inválida...) en vez de un 502 genérico que no dice nada.
 */
export class YoutubeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string | null
  ) {
    super(message)
    this.name = "YoutubeApiError"
  }

  /** ¿El problema es que se agotó la cuota (diaria o por minuto)? */
  get isQuota(): boolean {
    return (
      this.status === 429 ||
      this.reason === "quotaExceeded" ||
      this.reason === "dailyLimitExceeded" ||
      this.reason === "rateLimitExceeded"
    )
  }
}

async function youtubeError(res: Response): Promise<YoutubeApiError> {
  let payload: GoogleErrorPayload | null = null
  try {
    payload = (await res.json()) as GoogleErrorPayload
  } catch {
    // Sin cuerpo JSON: nos quedamos con el estado HTTP.
  }
  const error = payload?.error
  return new YoutubeApiError(
    error?.message ?? `YouTube respondió ${res.status}`,
    error?.code ?? res.status,
    error?.errors?.[0]?.reason ?? null
  )
}

function toResult(id: string, snippet: ApiSnippet, durationSec: number | null): YoutubeResult {
  return {
    youtubeId: id,
    title: snippet.title || "",
    channel: snippet.channelTitle || "",
    thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
    durationSec,
  }
}

async function searchWithKey(apiKey: string, query: string): Promise<YoutubeResult[]> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
  searchUrl.searchParams.set("key", apiKey)
  searchUrl.searchParams.set("q", query)
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", "10")

  const res = await fetch(searchUrl.toString())
  if (!res.ok) throw await youtubeError(res)

  const data = (await res.json()) as SearchApiResponse
  const items = data.items || []
  const ids = items.map((i) => i.id?.videoId).filter((id): id is string => Boolean(id))

  const durations: Record<string, number | null> = {}
  if (ids.length > 0) {
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos")
    detailsUrl.searchParams.set("key", apiKey)
    detailsUrl.searchParams.set("part", "contentDetails")
    detailsUrl.searchParams.set("id", ids.join(","))

    const dres = await fetch(detailsUrl.toString())
    if (dres.ok) {
      const ddata = (await dres.json()) as VideosApiResponse
      for (const v of ddata.items || []) {
        if (v.id && v.contentDetails?.duration) {
          durations[v.id] = parseDuration(v.contentDetails.duration)
        }
      }
    }
  }

  return items
    .map((item) => {
      const id = item.id?.videoId
      if (!id) return null
      return toResult(id, item.snippet || {}, durations[id] ?? null)
    })
    .filter((r): r is YoutubeResult => r !== null)
}

/**
 * Busca vídeos. Si la clave principal agotó su cuota y hay una de reserva
 * (`YOUTUBE_API_KEY_2`), se reintenta con ella para no quedarse sin búsqueda.
 */
export async function searchYoutube(query: string): Promise<YoutubeResult[]> {
  const keys = youtubeApiKeys()
  if (keys.length === 0) throw new Error("YOUTUBE_API_KEY no configurada")

  let lastError: unknown
  for (const [index, apiKey] of keys.entries()) {
    try {
      return await searchWithKey(apiKey, query)
    } catch (error) {
      lastError = error
      const retry = error instanceof YoutubeApiError && error.isQuota && index < keys.length - 1
      if (!retry) throw error
    }
  }
  throw lastError
}

export async function getVideoDetails(youtubeId: string): Promise<YoutubeResult | null> {
  const keys = youtubeApiKeys()
  if (keys.length === 0) throw new Error("YOUTUBE_API_KEY no configurada")

  for (const [index, apiKey] of keys.entries()) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("key", apiKey)
    url.searchParams.set("part", "snippet,contentDetails")
    url.searchParams.set("id", youtubeId)

    const res = await fetch(url.toString())
    if (res.ok) {
      const data = (await res.json()) as VideosApiResponse
      const item = data.items?.[0]
      if (!item?.id) return null

      const duration = item.contentDetails?.duration
      return toResult(item.id, item.snippet || {}, duration ? parseDuration(duration) : null)
    }

    // Un fallo normal (vídeo inexistente, error puntual...) no se reintenta;
    // solo se prueba la clave de reserva si lo que falló fue la cuota.
    const error = await youtubeError(res)
    if (!error.isQuota || index === keys.length - 1) return null
  }

  return null
}