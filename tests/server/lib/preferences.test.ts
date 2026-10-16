import { beforeEach, describe, expect, it } from "vitest"
import { getArtStyle, parseArtStyle } from "@/lib/preferences"
import { prisma } from "@/lib/prisma"
import { resetDatabase, signInAsNew } from "../../helpers/factories"

beforeEach(resetDatabase)

describe("parseArtStyle", () => {
  it("acepta los fondos conocidos", () => {
    expect(parseArtStyle("normal")).toBe("normal")
    expect(parseArtStyle("otaku")).toBe("otaku")
  })

  it("rechaza cualquier otro valor", () => {
    expect(parseArtStyle("otro")).toBeNull()
    expect(parseArtStyle(1)).toBeNull()
    expect(parseArtStyle(null)).toBeNull()
    expect(parseArtStyle(undefined)).toBeNull()
  })
})

describe("getArtStyle", () => {
  it("devuelve el fondo guardado del usuario", async () => {
    const me = await signInAsNew("mod")
    await prisma.user.update({ where: { id: me.id }, data: { artStyle: "otaku" } })

    expect(await getArtStyle(me.id)).toBe("otaku")
  })

  it("si el usuario no existe, cae al modo normal", async () => {
    expect(await getArtStyle("no-existe")).toBe("normal")
  })
})
