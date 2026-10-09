import { beforeEach, describe, expect, it } from "vitest"
import { NextResponse } from "next/server"
import { listStreamers, resolveStreamerId } from "@/lib/streamers"
import { createUser, resetDatabase, toSession } from "../../helpers/factories"

beforeEach(resetDatabase)

describe("listStreamers", () => {
  it("admin y mod ven a todos los streamers, por antigüedad, y a nadie más", async () => {
    const admin = await createUser("admin")
    const mod = await createUser("mod")
    const first = await createUser("streamer", "primera")
    const second = await createUser("streamer", "segunda")

    const expected = [
      { id: first.id, username: "primera" },
      { id: second.id, username: "segunda" },
    ]
    expect(await listStreamers(toSession(admin))).toEqual(expected)
    expect(await listStreamers(toSession(mod))).toEqual(expected)
  })

  it("un streamer solo se ve a sí mismo", async () => {
    const me = await createUser("streamer", "yo")
    await createUser("streamer", "otra")

    expect(await listStreamers(toSession(me))).toEqual([{ id: me.id, username: "yo" }])
  })
})

describe("resolveStreamerId", () => {
  it("un streamer actúa siempre sobre su cola, pida la que pida", async () => {
    const me = await createUser("streamer")
    const other = await createUser("streamer")

    expect(await resolveStreamerId(toSession(me), other.id)).toEqual({ streamerId: me.id })
    expect(await resolveStreamerId(toSession(me), null)).toEqual({ streamerId: me.id })
  })

  it("admin y mod pueden elegir la cola de cualquier streamer", async () => {
    const admin = await createUser("admin")
    const mod = await createUser("mod")
    const streamer = await createUser("streamer")

    expect(await resolveStreamerId(toSession(admin), streamer.id)).toEqual({
      streamerId: streamer.id,
    })
    expect(await resolveStreamerId(toSession(mod), streamer.id)).toEqual({
      streamerId: streamer.id,
    })
  })

  it("admin y mod reciben un 400 si no indican streamer", async () => {
    const mod = await createUser("mod")

    for (const requested of [null, undefined, "", 42]) {
      const result = await resolveStreamerId(toSession(mod), requested)
      expect(result).toBeInstanceOf(NextResponse)
      expect((result as NextResponse).status).toBe(400)
    }
  })

  it("responde 404 si el id no existe o es de alguien que no es streamer", async () => {
    const mod = await createUser("mod")
    const admin = await createUser("admin")

    const missing = await resolveStreamerId(toSession(mod), "no-existe")
    expect((missing as NextResponse).status).toBe(404)

    // Ni el propio moderador ni un admin tienen cola
    const self = await resolveStreamerId(toSession(mod), mod.id)
    expect((self as NextResponse).status).toBe(404)
    const notStreamer = await resolveStreamerId(toSession(mod), admin.id)
    expect((notStreamer as NextResponse).status).toBe(404)
  })
})
