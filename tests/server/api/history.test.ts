import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE, GET, POST } from "@/app/api/history/route"
import { prisma } from "@/lib/prisma"
import { MAX_QUEUE } from "@/lib/songs"
import {
  createSong,
  createUser,
  enqueue,
  historyTitles,
  queueTitles,
  resetDatabase,
  signInAsNew,
} from "../../helpers/factories"
import { getRequest, jsonRequest, readJson } from "../../helpers/http"
import { signOut } from "../../helpers/session"

beforeEach(resetDatabase)
afterEach(() => vi.unstubAllGlobals())

const list = (streamerId?: string) =>
  GET(getRequest(`/api/history${streamerId ? `?streamerId=${streamerId}` : ""}`))
const reAdd = (body: unknown) => POST(jsonRequest("/api/history", "POST", body))
const clear = (query: string) => DELETE(jsonRequest(`/api/history${query}`, "DELETE"))

/** Apunta una canción ya reproducida en el historial de un streamer. */
async function played(streamerId: string, title: string, requesterName?: string) {
  const song = await createSong(undefined, title)
  return prisma.historyItem.create({
    data: { songId: song.id, streamerId, requesterName: requesterName ?? null },
  })
}

describe("permisos del historial", () => {
  it("sin sesión responde 401 y un streamer recibe 403", async () => {
    const streamer = await createUser("streamer")
    const entry = await played(streamer.id, "Vieja")

    signOut()
    expect((await list(streamer.id)).status).toBe(401)
    expect((await reAdd({ id: entry.id })).status).toBe(401)
    expect((await clear(`?streamerId=${streamer.id}`)).status).toBe(401)

    await signInAsNew("streamer")
    expect((await list(streamer.id)).status).toBe(403)
    expect((await reAdd({ id: entry.id })).status).toBe(403)
    expect((await clear(`?streamerId=${streamer.id}`)).status).toBe(403)

    expect(await historyTitles(streamer.id)).toEqual(["Vieja"])
  })
})

describe("GET /api/history", () => {
  beforeEach(() => signInAsNew("mod"))

  it("devuelve solo el historial del streamer pedido", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await played(a.id, "De A")
    await played(b.id, "De B")

    const body = await readJson(await list(a.id))

    expect(body.history.map((h: { song: { title: string } }) => h.song.title)).toEqual(["De A"])
  })

  it("devuelve como mucho las 20 últimas, de la más reciente a la más antigua", async () => {
    const streamer = await createUser("streamer")
    const song = await createSong()
    for (let i = 1; i <= 22; i++) {
      await prisma.historyItem.create({
        data: {
          songId: song.id,
          streamerId: streamer.id,
          requesterName: `n${i}`,
          playedAt: new Date(2026, 0, 1, 0, i),
        },
      })
    }

    const body = await readJson(await list(streamer.id))

    expect(body.history).toHaveLength(20)
    expect(body.history[0].requesterName).toBe("n22")
    expect(body.history[19].requesterName).toBe("n3")
  })

  it("exige indicar un streamer que exista", async () => {
    expect((await list()).status).toBe(400)
    expect((await list("no-existe")).status).toBe(404)
  })
})

describe("POST /api/history (reañadir a la cola)", () => {
  it("vuelve a poner la canción al final de la cola del mismo streamer", async () => {
    const mod = await signInAsNew("mod")
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "En cola" })
    const entry = await played(a.id, "Repetir", "pepe")
    // La canción ya está guardada, así que no hace falta llamar a YouTube
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const res = await reAdd({ id: entry.id })

    expect(res.status).toBe(201)
    expect((await readJson(res)).item).toMatchObject({
      position: 2,
      requesterName: "pepe",
      streamerId: a.id,
      addedById: mod.id,
    })
    expect(await queueTitles(a.id)).toEqual(["En cola", "Repetir"])
    expect(await queueTitles(b.id)).toEqual([])
    // Reañadir no borra la entrada del historial
    expect(await historyTitles(a.id)).toEqual(["Repetir"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("respeta el máximo de la cola de ese streamer", async () => {
    await signInAsNew("mod")
    const streamer = await createUser("streamer")
    for (let i = 0; i < MAX_QUEUE; i++) await enqueue(streamer.id)
    const entry = await played(streamer.id, "Repetir")

    const res = await reAdd({ id: entry.id })

    expect(res.status).toBe(400)
    expect(await queueTitles(streamer.id)).toHaveLength(MAX_QUEUE)
  })

  it("valida que se indique una entrada que exista", async () => {
    await signInAsNew("mod")

    expect((await reAdd({})).status).toBe(400)
    expect((await reAdd({ id: 5 })).status).toBe(400)
    expect((await reAdd({ id: "no-existe" })).status).toBe(404)
  })
})

describe("DELETE /api/history", () => {
  beforeEach(() => signInAsNew("mod"))

  it("vacía el historial del streamer indicado sin tocar el de otros ni las colas", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await played(a.id, "A1")
    await played(a.id, "A2")
    await played(b.id, "B1")
    await enqueue(a.id, { title: "En cola" })

    const res = await clear(`?streamerId=${a.id}`)

    expect(await readJson(res)).toEqual({ ok: true, removed: 2 })
    expect(await historyTitles(a.id)).toEqual([])
    expect(await historyTitles(b.id)).toEqual(["B1"])
    expect(await queueTitles(a.id)).toEqual(["En cola"])
  })

  it("con ?id= borra solo esa entrada", async () => {
    const streamer = await createUser("streamer")
    const gone = await played(streamer.id, "Fuera")
    await played(streamer.id, "Se queda")

    const res = await clear(`?streamerId=${streamer.id}&id=${gone.id}`)

    expect(await readJson(res)).toEqual({ ok: true, removed: 1 })
    expect(await historyTitles(streamer.id)).toEqual(["Se queda"])
  })

  it("no borra una entrada del historial de otro streamer", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    const foreign = await played(b.id, "De B")

    const res = await clear(`?streamerId=${a.id}&id=${foreign.id}`)

    expect(res.status).toBe(404)
    expect(await historyTitles(b.id)).toEqual(["De B"])
  })

  it("exige indicar el streamer: sin él no se borra nada", async () => {
    const streamer = await createUser("streamer")
    await played(streamer.id, "Se queda")

    expect((await clear("")).status).toBe(400)
    expect(await historyTitles(streamer.id)).toEqual(["Se queda"])
  })
})
