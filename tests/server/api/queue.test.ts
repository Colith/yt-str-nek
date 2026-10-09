import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/queue/route"
import { DELETE } from "@/app/api/queue/[id]/route"
import { POST as playNext } from "@/app/api/queue/next/route"
import { POST as reorder } from "@/app/api/queue/reorder/route"
import { prisma } from "@/lib/prisma"
import { MAX_QUEUE } from "@/lib/songs"
import {
  createUser,
  enqueue,
  historyTitles,
  queuePositions,
  queueTitles,
  resetDatabase,
  signInAsNew,
} from "../../helpers/factories"
import { getRequest, jsonRequest, readJson, routeParams } from "../../helpers/http"
import { signOut } from "../../helpers/session"
import { mockYoutubeApi } from "../../helpers/youtube"

beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const list = (streamerId?: string) =>
  GET(getRequest(`/api/queue${streamerId ? `?streamerId=${streamerId}` : ""}`))
const add = (body: unknown) => POST(jsonRequest("/api/queue", "POST", body))
const remove = (id: string) =>
  DELETE(jsonRequest(`/api/queue/${id}`, "DELETE"), routeParams({ id }))
const next = (body: unknown) => playNext(jsonRequest("/api/queue/next", "POST", body))
const sort = (body: unknown) => reorder(jsonRequest("/api/queue/reorder", "POST", body))

describe("permisos de la cola", () => {
  it("sin sesión responde 401 en todas las operaciones", async () => {
    const streamer = await createUser("streamer")
    const item = await enqueue(streamer.id)
    signOut()

    expect((await list(streamer.id)).status).toBe(401)
    expect((await add({ streamerId: streamer.id, youtubeId: "abc" })).status).toBe(401)
    expect((await remove(item.id)).status).toBe(401)
    expect((await next({ streamerId: streamer.id })).status).toBe(401)
    expect((await sort({ streamerId: streamer.id, items: [{ id: item.id, position: 1 }] })).status).toBe(401)
    expect(await queueTitles(streamer.id)).toHaveLength(1)
  })

  it("un streamer no puede gestionar colas, ni siquiera la suya", async () => {
    const streamer = await signInAsNew("streamer")
    const item = await enqueue(streamer.id)

    expect((await list(streamer.id)).status).toBe(403)
    expect((await add({ streamerId: streamer.id, youtubeId: "abc" })).status).toBe(403)
    expect((await remove(item.id)).status).toBe(403)
    expect((await next({ streamerId: streamer.id })).status).toBe(403)
    expect((await sort({ streamerId: streamer.id, items: [{ id: item.id, position: 1 }] })).status).toBe(403)
    expect(await queueTitles(streamer.id)).toHaveLength(1)
  })

  it.each(["admin", "mod"] as const)("un %s gestiona la cola de cualquier streamer", async (role) => {
    await signInAsNew(role)
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id)
    await enqueue(b.id)

    expect((await list(a.id)).status).toBe(200)
    expect((await list(b.id)).status).toBe(200)
  })
})

describe("GET /api/queue", () => {
  beforeEach(() => signInAsNew("mod", "moderadora"))

  it("devuelve solo la cola del streamer pedido, en orden", async () => {
    const mod = await prisma.user.findUniqueOrThrow({ where: { username: "moderadora" } })
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "A1", addedById: mod.id, requesterName: "pepe" })
    await enqueue(b.id, { title: "B1" })
    await enqueue(a.id, { title: "A2" })

    const body = await readJson(await list(a.id))

    expect(body.queue.map((i: { song: { title: string } }) => i.song.title)).toEqual(["A1", "A2"])
    expect(body.queue[0]).toMatchObject({
      position: 1,
      requesterName: "pepe",
      addedBy: { id: mod.id, username: "moderadora" },
    })
    expect(JSON.stringify(body)).not.toContain("password")
  })

  it("exige indicar un streamer que exista", async () => {
    const mod = await prisma.user.findUniqueOrThrow({ where: { username: "moderadora" } })

    expect((await list()).status).toBe(400)
    expect((await list("no-existe")).status).toBe(404)
    expect((await list(mod.id)).status).toBe(404)
  })
})

describe("POST /api/queue", () => {
  it("añade la canción al final de la cola del streamer indicado", async () => {
    const mod = await signInAsNew("mod")
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "Ya estaba" })
    mockYoutubeApi([{ id: "abc", title: "Nueva" }])

    const res = await add({ streamerId: a.id, youtubeId: "abc", requesterName: "  pepe  " })

    expect(res.status).toBe(201)
    expect((await readJson(res)).item).toMatchObject({
      position: 2,
      requesterName: "pepe",
      streamerId: a.id,
      addedById: mod.id,
      song: { youtubeId: "abc", title: "Nueva" },
    })
    expect(await queueTitles(a.id)).toEqual(["Ya estaba", "Nueva"])
    expect(await queueTitles(b.id)).toEqual([])
  })

  it("la misma canción puede estar en las colas de dos streamers a la vez", async () => {
    await signInAsNew("mod")
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    mockYoutubeApi([{ id: "abc", title: "Compartida" }])

    expect((await add({ streamerId: a.id, youtubeId: "abc" })).status).toBe(201)
    expect((await add({ streamerId: b.id, youtubeId: "abc" })).status).toBe(201)

    expect(await queueTitles(a.id)).toEqual(["Compartida"])
    expect(await queueTitles(b.id)).toEqual(["Compartida"])
    expect(await queuePositions(b.id)).toEqual([1])
    expect(await prisma.song.count()).toBe(1)
  })

  it("un solicitante vacío se guarda como nulo", async () => {
    await signInAsNew("mod")
    const streamer = await createUser("streamer")
    mockYoutubeApi([{ id: "abc" }])

    const body = await readJson(await add({ streamerId: streamer.id, youtubeId: "abc", requesterName: "" }))

    expect(body.item.requesterName).toBeNull()
  })

  it("el límite de 20 canciones es por streamer", async () => {
    await signInAsNew("mod")
    const full = await createUser("streamer")
    const empty = await createUser("streamer")
    for (let i = 0; i < MAX_QUEUE; i++) await enqueue(full.id)
    mockYoutubeApi([{ id: "abc" }])

    const rejected = await add({ streamerId: full.id, youtubeId: "abc" })
    expect(rejected.status).toBe(400)
    expect((await readJson(rejected)).error).toContain("La cola está llena")
    expect(await queueTitles(full.id)).toHaveLength(MAX_QUEUE)

    expect((await add({ streamerId: empty.id, youtubeId: "abc" })).status).toBe(201)
  })

  it("valida el cuerpo y el streamer", async () => {
    await signInAsNew("mod")
    const streamer = await createUser("streamer")
    mockYoutubeApi([{ id: "abc" }])

    expect((await add({ streamerId: streamer.id })).status).toBe(400)
    expect((await add({ streamerId: streamer.id, youtubeId: "abc", requesterName: "x".repeat(51) })).status).toBe(400)
    expect((await add({ youtubeId: "abc" })).status).toBe(400)
    expect((await add({ streamerId: "no-existe", youtubeId: "abc" })).status).toBe(404)
    expect(await prisma.queueItem.count()).toBe(0)
  })

  it("responde 404 si el vídeo no existe en YouTube", async () => {
    await signInAsNew("mod")
    const streamer = await createUser("streamer")
    mockYoutubeApi([])

    expect((await add({ streamerId: streamer.id, youtubeId: "no-existe" })).status).toBe(404)
    expect(await prisma.queueItem.count()).toBe(0)
  })

  it("responde 503 si el servidor no tiene API key de YouTube", async () => {
    await signInAsNew("mod")
    const streamer = await createUser("streamer")
    vi.stubEnv("YOUTUBE_API_KEY", "")

    expect((await add({ streamerId: streamer.id, youtubeId: "abc" })).status).toBe(503)
  })
})

describe("DELETE /api/queue/[id]", () => {
  beforeEach(() => signInAsNew("mod"))

  it("quita la canción y renumera solo la cola a la que pertenecía", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    const first = await enqueue(a.id, { title: "A1" })
    await enqueue(a.id, { title: "A2" })
    await enqueue(a.id, { title: "A3" })
    await enqueue(b.id, { title: "B1" })
    await enqueue(b.id, { title: "B2" })

    const res = await remove(first.id)

    expect(await readJson(res)).toEqual({ ok: true })
    expect(await queueTitles(a.id)).toEqual(["A2", "A3"])
    expect(await queuePositions(a.id)).toEqual([1, 2])
    expect(await queueTitles(b.id)).toEqual(["B1", "B2"])
    // Quitarla de la cola no es reproducirla: no va al historial
    expect(await prisma.historyItem.count()).toBe(0)
  })

  it("responde 404 si la canción no está en ninguna cola", async () => {
    expect((await remove("no-existe")).status).toBe(404)
  })
})

describe("POST /api/queue/next", () => {
  beforeEach(() => signInAsNew("mod"))

  it("marca como reproducida la primera del streamer indicado y no toca a los demás", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "A1" })
    await enqueue(a.id, { title: "A2" })
    await enqueue(b.id, { title: "B1" })

    const res = await next({ streamerId: a.id })

    expect(res.status).toBe(200)
    expect((await readJson(res)).played.song.title).toBe("A1")
    expect(await queueTitles(a.id)).toEqual(["A2"])
    expect(await queuePositions(a.id)).toEqual([1])
    expect(await historyTitles(a.id)).toEqual(["A1"])
    expect(await queueTitles(b.id)).toEqual(["B1"])
    expect(await historyTitles(b.id)).toEqual([])
  })

  it("responde 400 si la cola de ese streamer está vacía, aunque otras no lo estén", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(b.id)

    const res = await next({ streamerId: a.id })

    expect(res.status).toBe(400)
    expect((await readJson(res)).error).toBe("La cola está vacía")
    expect(await queueTitles(b.id)).toHaveLength(1)
  })

  it("exige indicar el streamer", async () => {
    expect((await next({})).status).toBe(400)
  })
})

describe("POST /api/queue/reorder", () => {
  beforeEach(() => signInAsNew("mod"))

  it("aplica el nuevo orden a la cola del streamer", async () => {
    const streamer = await createUser("streamer")
    const one = await enqueue(streamer.id, { title: "Uno" })
    const two = await enqueue(streamer.id, { title: "Dos" })
    const three = await enqueue(streamer.id, { title: "Tres" })

    const res = await sort({
      streamerId: streamer.id,
      items: [
        { id: three.id, position: 1 },
        { id: one.id, position: 2 },
        { id: two.id, position: 3 },
      ],
    })

    expect(res.status).toBe(200)
    expect(await queueTitles(streamer.id)).toEqual(["Tres", "Uno", "Dos"])
  })

  it("rechaza un orden que no coincide con la cola actual", async () => {
    const streamer = await createUser("streamer")
    const one = await enqueue(streamer.id, { title: "Uno" })
    await enqueue(streamer.id, { title: "Dos" })

    // Falta una canción: alguien añadió o quitó algo mientras se arrastraba
    const res = await sort({ streamerId: streamer.id, items: [{ id: one.id, position: 1 }] })

    expect(res.status).toBe(409)
    expect(await queueTitles(streamer.id)).toEqual(["Uno", "Dos"])
  })

  it("no permite mover canciones de la cola de otro streamer", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "A1" })
    const foreign = await enqueue(b.id, { title: "B1" })

    const res = await sort({ streamerId: a.id, items: [{ id: foreign.id, position: 5 }] })

    expect(res.status).toBe(409)
    expect(await queuePositions(b.id)).toEqual([1])
  })

  it("valida el cuerpo y el streamer", async () => {
    const streamer = await createUser("streamer")
    const item = await enqueue(streamer.id)

    expect((await sort({ streamerId: streamer.id, items: [] })).status).toBe(400)
    expect((await sort({ streamerId: streamer.id })).status).toBe(400)
    expect((await sort({ items: [{ id: item.id, position: 1 }] })).status).toBe(400)
  })
})
