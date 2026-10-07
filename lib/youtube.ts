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

function requireApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error("YOUTUBE_API_KEY no configurada")
  return apiKey
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

export async function searchYoutube(query: string): Promise<YoutubeResult[]> {
  const apiKey = requireApiKey()

  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search")
  searchUrl.searchParams.set("key", apiKey)
  searchUrl.searchParams.set("q", query)
  searchUrl.searchParams.set("part", "snippet")
  searchUrl.searchParams.set("type", "video")
  searchUrl.searchParams.set("maxResults", "10")

  const res = await fetch(searchUrl.toString())
  if (!res.ok) throw new Error("Error al buscar en YouTube")

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

export async function getVideoDetails(youtubeId: string): Promise<YoutubeResult | null> {
  const apiKey = requireApiKey()

  const url = new URL("https://www.googleapis.com/youtube/v3/videos")
  url.searchParams.set("key", apiKey)
  url.searchParams.set("part", "snippet,contentDetails")
  url.searchParams.set("id", youtubeId)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = (await res.json()) as VideosApiResponse
  const item = data.items?.[0]
  if (!item?.id) return null

  const duration = item.contentDetails?.duration
  return toResult(item.id, item.snippet || {}, duration ? parseDuration(duration) : null)
}