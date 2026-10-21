import { describe, expect, it } from "vitest"
import { avatarUrl, sniffImageType } from "@/lib/avatars"

function bytes(...values: number[]) {
  return new Uint8Array(values)
}

describe("sniffImageType", () => {
  it("reconoce un PNG por su cabecera", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe(
      "image/png"
    )
  })

  it("reconoce un JPEG por su cabecera", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(
      "image/jpeg"
    )
  })

  it("reconoce un WebP por su cabecera", () => {
    expect(
      sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))
    ).toBe("image/webp")
  })

  it("no se fía del nombre ni del tipo que diga el fichero", () => {
    // Un PDF empieza igual que un JPEG, pero no lo es.
    expect(sniffImageType(bytes(0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull()
    expect(sniffImageType(bytes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull()
  })

  it("un fichero demasiado corto no es una imagen", () => {
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull()
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
  })
})

describe("avatarUrl", () => {
  it("apunta a la foto del usuario", () => {
    expect(avatarUrl("u1", 0)).toBe("/api/avatars/u1?v=0")
  })

  it("lleva la versión, para que una foto nueva no se quede la vieja en caché", () => {
    const antes = avatarUrl("u1", new Date("2026-01-01T00:00:00Z"))
    const despues = avatarUrl("u1", new Date("2026-02-01T00:00:00Z"))

    expect(antes).not.toBe(despues)
    expect(antes).toMatch(/^\/api\/avatars\/u1\?v=\d+$/)
  })
})
