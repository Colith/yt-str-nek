import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  MAX_QUEUE,
  markAsPlayed,
  nextQueuePosition,
  renumberQueue,
  upsertSong,
} from "@/lib/songs"
import { MAX_QUEUE as CLIENT_MAX_QUEUE } from "@/types"
import {
  createUser,
  enqueue,
  historyTitles,
  queuePositions,
  queueTitles,
  resetDatabase,
} from "../../helpers/factories"
import { mockYoutubeApi } from "../../helpers/youtube"

beforeEach(resetDatabase)
afterEach(() => vi.unstubAllGlobals())

describe("upsertSong", () => {
  it("la primera vez consulta YouTube y guarda la canción", async () => {
    const fetchMock = mockYoutubeApi([{ id: "abc", title: "Nueva", duration: "PT2M" }])

    const song = await upsertSong("abc")

    expect(song).toMatchObject({ youtubeId: "abc", title: "Nueva", durationSec: 120 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await prisma.song.count()).toBe(1)
  })

  it("si ya está guardada la devuelve sin volver a llamar a YouTube", async () => {
    const fetchMock = mockYoutubeApi([{ id: "abc", title: "Nueva" }])
    const first = await upsertSong("abc")

    const second = await upsertSong("abc")

    expect(second?.id).toBe(first?.id)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await prisma.song.count()).toBe(1)
  })

  it("devuelve null y no guarda nada si el vídeo no existe", async () => {
    mockYoutubeApi([])

    expect(await upsertSong("no-existe")).toBeNull()
    expect(await prisma.song.count()).toBe(0)
  })
})

describe("posiciones de la cola", () => {
  it("el máximo por cola es el mismo en el servidor y en el cliente", () => {
    expect(MAX_QUEUE).toBe(20)
    expect(CLIENT_MAX_QUEUE).toBe(MAX_QUEUE)
  })

  it("la siguiente posición se calcula por streamer", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    await enqueue(a.id)
    await enqueue(a.id)

    expect(await nextQueuePosition(a.id)).toBe(3)
    expect(await nextQueuePosition(b.id)).toBe(1)
  })

  it("renumerar deja la cola contigua desde 1 sin tocar la de otros", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    const first = await enqueue(a.id, { title: "A1" })
    await enqueue(a.id, { title: "A2" })
    await enqueue(a.id, { title: "A3" })
    const other = await enqueue(b.id, { title: "B1" })
    await prisma.queueItem.update({ where: { id: other.id }, data: { position: 7 } })
    await prisma.queueItem.delete({ where: { id: first.id } })

    await renumberQueue(a.id)

    expect(await queueTitles(a.id)).toEqual(["A2", "A3"])
    expect(await queuePositions(a.id)).toEqual([1, 2])
    expect(await queuePositions(b.id)).toEqual([7])
  })
})

describe("markAsPlayed", () => {
  it("mueve la canción al historial de su streamer y renumera la cola", async () => {
    const mod = await createUser("mod", "moderadora")
    const streamer = await createUser("streamer")
    const playing = await enqueue(streamer.id, {
      title: "Sonando",
      addedById: mod.id,
      requesterName: "pepe",
    })
    await enqueue(streamer.id, { title: "Siguiente" })

    expect(await markAsPlayed(playing.id, streamer.id)).toBe(true)

    expect(await queueTitles(streamer.id)).toEqual(["Siguiente"])
    expect(await queuePositions(streamer.id)).toEqual([1])
    const history = await prisma.historyItem.findMany({ where: { streamerId: streamer.id } })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      songId: playing.songId,
      requesterName: "pepe",
      addedById: mod.id,
      addedByName: "moderadora",
    })
  })

  it("no hace nada si la canción ya no está en la cola", async () => {
    const streamer = await createUser("streamer")

    expect(await markAsPlayed("no-existe", streamer.id)).toBe(false)
    expect(await prisma.historyItem.count()).toBe(0)
  })

  it("no deja avanzar la canción de la cola de otro streamer", async () => {
    const a = await createUser("streamer")
    const b = await createUser("streamer")
    const item = await enqueue(a.id, { title: "De A" })

    expect(await markAsPlayed(item.id, b.id)).toBe(false)

    expect(await queueTitles(a.id)).toEqual(["De A"])
    expect(await prisma.historyItem.count()).toBe(0)
  })

  it("si dos reproductores terminan la misma canción a la vez, solo avanza una vez", async () => {
    const streamer = await createUser("streamer")
    const playing = await enqueue(streamer.id, { title: "Sonando" })
    await enqueue(streamer.id, { title: "Siguiente" })

    const results = await Promise.all([
      markAsPlayed(playing.id, streamer.id),
      markAsPlayed(playing.id, streamer.id),
    ])

    expect(results.sort()).toEqual([false, true])
    expect(await queueTitles(streamer.id)).toEqual(["Siguiente"])
    expect(await historyTitles(streamer.id)).toEqual(["Sonando"])
  })
})
