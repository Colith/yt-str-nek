import { beforeEach, describe, expect, it } from "vitest"
import { PUT as setStyle } from "@/app/api/me/style/route"
import { prisma } from "@/lib/prisma"
import { resetDatabase, signInAsNew } from "../../helpers/factories"
import { jsonRequest, readJson } from "../../helpers/http"
import { signOut } from "../../helpers/session"

beforeEach(resetDatabase)

const style = (body: unknown) => setStyle(jsonRequest("/api/me/style", "PUT", body))

describe("PUT /api/me/style", () => {
  it("sin sesión responde 401", async () => {
    signOut()
    expect((await style({ artStyle: "otaku" })).status).toBe(401)
  })

  it("guarda el fondo elegido en la cuenta", async () => {
    const me = await signInAsNew("mod")
    const res = await style({ artStyle: "otaku" })

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ ok: true, artStyle: "otaku" })
    const user = await prisma.user.findUnique({ where: { id: me.id } })
    expect(user?.artStyle).toBe("otaku")
  })

  it("rechaza estilos que no existen", async () => {
    await signInAsNew("mod")
    const res = await style({ artStyle: "cualquiera" })

    expect(res.status).toBe(400)
  })

  it("una cuenta nueva empieza en el modo normal", async () => {
    const me = await signInAsNew("streamer")

    expect(me.artStyle).toBe("normal")
  })
})
