import { beforeEach, describe, expect, it } from "vitest"
import { GET as current } from "@/app/api/player/current/route"
import { POST as next } from "@/app/api/player/next/route"
import { PUT as volume } from "@/app/api/player/volume/route"
import { prisma } from "@/lib/prisma"
import {
  createUser,
  enqueue,
  historyTitles,
  queueTitles,
  resetDatabase,
  signInAsNew,
  toSession,
} from "../../helpers/factories"
import { getRequest, jsonRequest, readJson } from "../../helpers/http"
import { signInAs, signOut } from "../../helpers/session"

beforeEach(resetDatabase)

const now = (streamerId?: string) =>
  current(getRequest(`/api/player/current${streamerId ? `?streamerId=${streamerId}` : ""}`))
const finish = (body: unknown) => next(jsonRequest("/api/player/next", "POST", body))
const setVolume = (body: unknown) => volume(jsonRequest("/api/player/volume", "PUT", body))

describe("GET /api/player/current", () => {
  it("sin sesión responde 401", async () => {
    signOut()
    expect((await now()).status).toBe(401)
  })

  it("un streamer recibe la primera canción de su propia cola", async () => {
    const me = await signInAsNew("streamer")
    await enqueue(me.id, { title: "Primera", requesterName: "pepe" })
    await enqueue(me.id, { title: "Segunda" })
    await enqueue(me.id, { title: "Tercera" })

    const body = await readJson(await now())

    expect(body.current).toMatchObject({
      title: "Primera",
      requesterName: "pepe",
      upNext: 2,
    })
    expect(body.upNext).toBe(2)
  })

  it("un streamer no puede ver la cola de otro aunque la pida", async () => {
    const me = await signInAsNew("streamer")
    const other = await createUser("streamer")
    await enqueue(me.id, { title: "La mía" })
    await enqueue(other.id, { title: "La de otra" })

    const body = await readJson(await now(other.id))

    expect(body.current.title).toBe("La mía")
  })

  it("con la cola propia vacía no se cuela la de otro streamer", async () => {
    await signInAsNew("streamer")
    const other = await createUser("streamer")
    await enqueue(other.id, { title: "La de otra" })

    const body = await readJson(await now(other.id))

    expect(body).toMatchObject({ current: null, upNext: 0 })
  })

  it("admin y mod eligen qué cola reproducir", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id, { title: "De A" })
    await enqueue(b.id, { title: "De B" })

    for (const role of ["admin", "mod"] as const) {
      await signInAsNew(role)
      expect((await readJson(await now(a.id))).current.title).toBe("De A")
      expect((await readJson(await now(b.id))).current.title).toBe("De B")
      expect((await now()).status).toBe(400)
      expect((await now("no-existe")).status).toBe(404)
    }
  })

  it("devuelve el volumen guardado de quien escucha, no el del streamer", async () => {
    const streamer = await createUser("streamer")
    await prisma.user.update({ where: { id: streamer.id }, data: { volume: 10 } })
    const mod = await signInAsNew("mod")

    expect((await readJson(await now(streamer.id))).savedVolume).toBeNull()

    await prisma.user.update({ where: { id: mod.id }, data: { volume: 35 } })
    expect((await readJson(await now(streamer.id))).savedVolume).toBe(35)
  })

  it("no expone más datos de la cola que la canción actual", async () => {
    const me = await signInAsNew("streamer")
    await enqueue(me.id, { title: "Actual" })
    await enqueue(me.id, { title: "Secreta" })

    const text = JSON.stringify(await readJson(await now()))

    expect(text).toContain("Actual")
    expect(text).not.toContain("Secreta")
  })
})

describe("POST /api/player/next", () => {
  it("sin sesión responde 401", async () => {
    signOut()
    expect((await finish({ queueItemId: "x" })).status).toBe(401)
  })

  it("el streamer avanza su cola: la canción pasa al historial", async () => {
    const me = await signInAsNew("streamer")
    const playing = await enqueue(me.id, { title: "Sonando" })
    await enqueue(me.id, { title: "Siguiente" })

    const res = await finish({ queueItemId: playing.id })

    expect(await readJson(res)).toEqual({ ok: true })
    expect(await queueTitles(me.id)).toEqual(["Siguiente"])
    expect(await historyTitles(me.id)).toEqual(["Sonando"])
    expect((await readJson(await now())).current.title).toBe("Siguiente")
  })

  it("avisar dos veces del fin de la misma canción no salta la siguiente", async () => {
    const me = await signInAsNew("streamer")
    const playing = await enqueue(me.id, { title: "Sonando" })
    await enqueue(me.id, { title: "Siguiente" })

    expect((await finish({ queueItemId: playing.id })).status).toBe(200)
    const repeated = await finish({ queueItemId: playing.id })

    expect(repeated.status).toBe(409)
    expect(await queueTitles(me.id)).toEqual(["Siguiente"])
    expect(await historyTitles(me.id)).toEqual(["Sonando"])
  })

  it("un streamer no puede avanzar la cola de otro", async () => {
    const me = await signInAsNew("streamer")
    const other = await createUser("streamer")
    const theirs = await enqueue(other.id, { title: "De otra" })

    const res = await finish({ queueItemId: theirs.id, streamerId: other.id })

    expect(res.status).toBe(409)
    expect(await queueTitles(other.id)).toEqual(["De otra"])
    expect(await historyTitles(other.id)).toEqual([])
    expect(await historyTitles(me.id)).toEqual([])
  })

  it("un mod con el reproductor de un streamer abierto avanza esa cola", async () => {
    const streamer = await createUser("streamer")
    const playing = await enqueue(streamer.id, { title: "Sonando" })
    await signInAsNew("mod")

    expect((await finish({ queueItemId: playing.id, streamerId: streamer.id })).status).toBe(200)
    expect(await historyTitles(streamer.id)).toEqual(["Sonando"])
  })

  it("un mod no avanza una canción indicando el streamer equivocado", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    const playing = await enqueue(a.id, { title: "De A" })
    await signInAsNew("mod")

    expect((await finish({ queueItemId: playing.id, streamerId: b.id })).status).toBe(409)
    expect(await queueTitles(a.id)).toEqual(["De A"])
  })

  it("valida que se indique la canción y, para admin y mod, el streamer", async () => {
    await signInAsNew("mod")

    expect((await finish({})).status).toBe(400)
    expect((await finish({ queueItemId: 7 })).status).toBe(400)
    expect((await finish({ queueItemId: "x" })).status).toBe(400)
  })
})

describe("PUT /api/player/volume", () => {
  it("sin sesión responde 401", async () => {
    signOut()
    expect((await setVolume({ volume: 50 })).status).toBe(401)
  })

  it("guarda el volumen en la cuenta de quien lo cambia", async () => {
    const me = await signInAsNew("streamer")
    const other = await createUser("streamer")

    const res = await setVolume({ volume: 42 })

    expect(await readJson(res)).toEqual({ ok: true, volume: 42 })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).volume).toBe(42)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).volume).toBeNull()
  })

  it("redondea y limita el valor entre 0 y 100", async () => {
    await signInAsNew("mod")

    expect((await readJson(await setVolume({ volume: 150 }))).volume).toBe(100)
    expect((await readJson(await setVolume({ volume: -5 }))).volume).toBe(0)
    expect((await readJson(await setVolume({ volume: 33.6 }))).volume).toBe(34)
  })

  it("rechaza valores que no son un número", async () => {
    await signInAsNew("mod")

    for (const value of ["50", null, undefined, Number.NaN]) {
      expect((await setVolume({ volume: value })).status).toBe(400)
    }
  })

  it("recupera el volumen guardado al volver a abrir el reproductor", async () => {
    const me = await createUser("streamer")
    await signInAs(toSession(me))

    await setVolume({ volume: 65 })

    expect((await readJson(await now())).savedVolume).toBe(65)
  })
})
