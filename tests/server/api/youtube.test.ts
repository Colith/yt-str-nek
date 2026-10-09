import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as streamers } from "@/app/api/streamers/route"
import { POST as resolve } from "@/app/api/youtube/resolve/route"
import { GET as search } from "@/app/api/youtube/search/route"
import { prisma } from "@/lib/prisma"
import { createUser, resetDatabase, signInAsNew } from "../../helpers/factories"
import { getRequest, jsonRequest, readJson } from "../../helpers/http"
import { signOut } from "../../helpers/session"
import { mockYoutubeApi } from "../../helpers/youtube"

beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const find = (q?: string) =>
  search(getRequest(`/api/youtube/search${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`))
const byUrl = (body: unknown) => resolve(jsonRequest("/api/youtube/resolve", "POST", body))

describe("GET /api/youtube/search", () => {
  it("solo admin y mod pueden buscar", async () => {
    const fetchMock = mockYoutubeApi([{ id: "a" }])

    signOut()
    expect((await find("algo")).status).toBe(401)
    await signInAsNew("streamer")
    expect((await find("algo")).status).toBe(403)

    // Sin permiso no se gasta cuota de la API
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("devuelve los resultados de YouTube", async () => {
    await signInAsNew("mod")
    mockYoutubeApi([{ id: "a", title: "Uno", duration: "PT1M" }])

    const body = await readJson(await find("  uno  "))

    expect(body.results).toEqual([
      {
        youtubeId: "a",
        title: "Uno",
        channel: "Canal",
        thumbnail: "https://img.test/a.jpg",
        durationSec: 60,
      },
    ])
  })

  it("con menos de 2 caracteres no consulta a YouTube", async () => {
    await signInAsNew("mod")
    const fetchMock = mockYoutubeApi([{ id: "a" }])

    expect(await readJson(await find())).toEqual({ results: [] })
    expect(await readJson(await find("a"))).toEqual({ results: [] })
    expect(await readJson(await find("   "))).toEqual({ results: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("responde 502 si YouTube falla y 503 si falta la API key", async () => {
    await signInAsNew("mod")
    mockYoutubeApi([], { failSearch: true })
    expect((await find("algo")).status).toBe(502)

    vi.stubEnv("YOUTUBE_API_KEY", "")
    expect((await find("algo")).status).toBe(503)
  })
})

describe("POST /api/youtube/resolve", () => {
  it("solo admin y mod pueden resolver enlaces", async () => {
    signOut()
    expect((await byUrl({ url: "https://youtu.be/abc" })).status).toBe(401)
    await signInAsNew("streamer")
    expect((await byUrl({ url: "https://youtu.be/abc" })).status).toBe(403)
  })

  it("convierte un enlace en los datos del vídeo sin guardarlo en la cola", async () => {
    await signInAsNew("mod")
    mockYoutubeApi([{ id: "abc", title: "Por enlace" }])

    const res = await byUrl({ url: "https://www.youtube.com/watch?v=abc&t=10s" })

    expect(res.status).toBe(200)
    expect((await readJson(res)).video).toMatchObject({ youtubeId: "abc", title: "Por enlace" })
    expect(await prisma.queueItem.count()).toBe(0)
    expect(await prisma.song.count()).toBe(0)
  })

  it("rechaza lo que no es un enlace de YouTube", async () => {
    await signInAsNew("mod")
    mockYoutubeApi([{ id: "abc" }])

    expect((await byUrl({})).status).toBe(400)
    expect((await byUrl({ url: "   " })).status).toBe(400)
    expect((await byUrl({ url: "https://vimeo.com/123" })).status).toBe(400)
  })

  it("responde 404 si el vídeo no existe, 502 si YouTube falla y 503 sin API key", async () => {
    await signInAsNew("mod")
    mockYoutubeApi([])
    expect((await byUrl({ url: "https://youtu.be/no-existe" })).status).toBe(404)

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")))
    expect((await byUrl({ url: "https://youtu.be/abc" })).status).toBe(502)

    vi.stubEnv("YOUTUBE_API_KEY", "")
    expect((await byUrl({ url: "https://youtu.be/abc" })).status).toBe(503)
  })
})

describe("GET /api/streamers", () => {
  it("sin sesión responde 401", async () => {
    signOut()
    expect((await streamers()).status).toBe(401)
  })

  it("admin y mod reciben todos los streamers; un streamer, solo a sí mismo", async () => {
    const a = await createUser("streamer", "primera")
    const b = await createUser("streamer", "segunda")
    const all = [
      { id: a.id, username: "primera" },
      { id: b.id, username: "segunda" },
    ]

    await signInAsNew("admin")
    expect((await readJson(await streamers())).streamers).toEqual(all)
    await signInAsNew("mod")
    expect((await readJson(await streamers())).streamers).toEqual(all)

    const me = await signInAsNew("streamer", "tercera")
    expect((await readJson(await streamers())).streamers).toEqual([
      { id: me.id, username: "tercera" },
    ])
  })
})
