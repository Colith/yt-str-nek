import { vi } from "vitest"

export interface FakeVideo {
  id: string
  title?: string
  channel?: string
  duration?: string
  thumbnail?: string
}

function snippet(video: FakeVideo) {
  return {
    title: video.title ?? `Título ${video.id}`,
    channelTitle: video.channel ?? "Canal",
    thumbnails: { medium: { url: video.thumbnail ?? `https://img.test/${video.id}.jpg` } },
  }
}

/**
 * Sustituye fetch por una API de YouTube de mentira que solo conoce los vídeos
 * indicados. Devuelve el espía, para comprobar qué se le pidió.
 */
export function mockYoutubeApi(videos: FakeVideo[], options: { failSearch?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input.toString())

    if (url.pathname.endsWith("/search")) {
      if (options.failSearch) return new Response("cuota agotada", { status: 403 })
      return Response.json({
        items: videos.map((v) => ({ id: { videoId: v.id }, snippet: snippet(v) })),
      })
    }

    if (url.pathname.endsWith("/videos")) {
      const ids = (url.searchParams.get("id") ?? "").split(",")
      return Response.json({
        items: videos
          .filter((v) => ids.includes(v.id))
          .map((v) => ({
            id: v.id,
            snippet: snippet(v),
            contentDetails: { duration: v.duration ?? "PT3M20S" },
          })),
      })
    }

    return new Response("no encontrado", { status: 404 })
  })

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}
