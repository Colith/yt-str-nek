import { afterEach, describe, expect, it, vi } from "vitest"
import {
  extractYoutubeId,
  getVideoDetails,
  isValidYoutubeUrl,
  searchYoutube,
} from "@/lib/youtube"
import { mockYoutubeApi } from "../../helpers/youtube"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("extractYoutubeId", () => {
  it("entiende los formatos de enlace habituales", () => {
    expect(extractYoutubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYoutubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe("dQw4w9WgXcQ")
    expect(extractYoutubeId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(extractYoutubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ")
    expect(extractYoutubeId("https://www.youtube.com/shorts/abc123XYZ_-")).toBe("abc123XYZ_-")
    expect(extractYoutubeId("https://www.youtube.com/embed/abc123XYZ_-")).toBe("abc123XYZ_-")
    expect(extractYoutubeId("  https://youtu.be/dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ")
  })

  it("devuelve null si no es un vídeo de YouTube", () => {
    expect(extractYoutubeId("https://vimeo.com/123")).toBeNull()
    expect(extractYoutubeId("https://www.youtube.com/")).toBeNull()
    expect(extractYoutubeId("https://www.youtube.com/channel/abc")).toBeNull()
    expect(extractYoutubeId("https://youtu.be/")).toBeNull()
    expect(extractYoutubeId("no es una url")).toBeNull()
    expect(extractYoutubeId("")).toBeNull()
  })

  it("isValidYoutubeUrl dice lo mismo en forma de booleano", () => {
    expect(isValidYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true)
    expect(isValidYoutubeUrl("https://example.com")).toBe(false)
  })
})

describe("getVideoDetails", () => {
  it("devuelve los datos del vídeo con la duración en segundos", async () => {
    const fetchMock = mockYoutubeApi([
      { id: "abc", title: "Mi canción", channel: "Mi canal", duration: "PT1H2M3S" },
    ])

    expect(await getVideoDetails("abc")).toEqual({
      youtubeId: "abc",
      title: "Mi canción",
      channel: "Mi canal",
      thumbnail: "https://img.test/abc.jpg",
      durationSec: 3723,
    })

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe("https://www.googleapis.com/youtube/v3/videos")
    expect(url.searchParams.get("id")).toBe("abc")
    expect(url.searchParams.get("key")).toBe("clave-de-prueba")
  })

  it("interpreta duraciones con solo minutos o solo segundos", async () => {
    mockYoutubeApi([
      { id: "a", duration: "PT4M" },
      { id: "b", duration: "PT45S" },
    ])
    expect((await getVideoDetails("a"))?.durationSec).toBe(240)
    expect((await getVideoDetails("b"))?.durationSec).toBe(45)
  })

  it("devuelve null si el vídeo no existe o la API falla", async () => {
    mockYoutubeApi([])
    expect(await getVideoDetails("no-existe")).toBeNull()

    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })))
    expect(await getVideoDetails("abc")).toBeNull()
  })

  it("falla con un mensaje claro si no hay API key", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    await expect(getVideoDetails("abc")).rejects.toThrow("YOUTUBE_API_KEY")
  })
})

describe("searchYoutube", () => {
  it("devuelve los resultados con su duración, pidiéndola en una segunda llamada", async () => {
    const fetchMock = mockYoutubeApi([
      { id: "a", title: "Uno", duration: "PT3M" },
      { id: "b", title: "Dos", duration: "PT10S" },
    ])

    const results = await searchYoutube("mi búsqueda")

    expect(results.map((r) => [r.youtubeId, r.title, r.durationSec])).toEqual([
      ["a", "Uno", 180],
      ["b", "Dos", 10],
    ])

    const search = new URL(String(fetchMock.mock.calls[0][0]))
    expect(search.searchParams.get("q")).toBe("mi búsqueda")
    expect(search.searchParams.get("type")).toBe("video")
    const details = new URL(String(fetchMock.mock.calls[1][0]))
    expect(details.searchParams.get("id")).toBe("a,b")
  })

  it("sin resultados no hace la segunda llamada", async () => {
    const fetchMock = mockYoutubeApi([])
    expect(await searchYoutube("nada")).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("si falla la consulta de duraciones, devuelve los resultados sin duración", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/search")
          ? Response.json({ items: [{ id: { videoId: "a" }, snippet: { title: "Uno" } }] })
          : new Response("error", { status: 500 })
      )
    )

    expect(await searchYoutube("algo")).toEqual([
      { youtubeId: "a", title: "Uno", channel: "", thumbnail: "", durationSec: null },
    ])
  })

  it("lanza un error si la búsqueda falla", async () => {
    mockYoutubeApi([], { failSearch: true })
    await expect(searchYoutube("algo")).rejects.toThrow("Error al buscar en YouTube")
  })
})
