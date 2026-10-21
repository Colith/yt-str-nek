import { describe, expect, it } from "vitest"
import {
  canVisit,
  defaultPathForRole,
  getHeaderItems,
  resolveLoginTarget,
  roleLabel,
} from "@/lib/navigation"

describe("botones de la cabecera", () => {
  it("un admin tiene panel, reproductor y usuarios", () => {
    expect(getHeaderItems("admin").map((i) => i.key)).toEqual([
      "panel",
      "player",
      "users",
    ])
  })

  it("un mod no tiene el panel de usuarios", () => {
    expect(getHeaderItems("mod").map((i) => i.key)).toEqual(["panel", "player"])
  })

  it("un streamer ve su cola, con otro nombre", () => {
    const items = getHeaderItems("streamer")

    expect(items.map((i) => i.key)).toEqual(["panel", "player"])
    expect(items[0].label).toBe("Mi cola")
    expect(items[0].href).toBe("/mod")
  })

  it("el reproductor se abre siempre en otra pestaña", () => {
    for (const role of ["admin", "mod", "streamer"]) {
      const player = getHeaderItems(role).find((i) => i.key === "player")
      expect(player?.newTab).toBe(true)
      expect(player?.href).toBe("/player")
    }
  })

  it("un rol desconocido ve lo menos", () => {
    expect(getHeaderItems("inventado").map((i) => i.key)).toEqual(["panel", "player"])
  })
})

describe("página de cada rol", () => {
  it("un streamer va a su reproductor y los demás al panel", () => {
    expect(defaultPathForRole("streamer")).toBe("/player")
    expect(defaultPathForRole("admin")).toBe("/mod")
    expect(defaultPathForRole("mod")).toBe("/mod")
  })

  it("cada rol solo puede abrir lo que le corresponde", () => {
    expect(canVisit("admin", "/users")).toBe(true)
    expect(canVisit("mod", "/users")).toBe(false)
    expect(canVisit("streamer", "/users")).toBe(false)
    expect(canVisit("streamer", "/mod")).toBe(true)
    expect(canVisit("streamer", "/player")).toBe(true)
  })

  it("la etiqueta del rol es legible", () => {
    expect(roleLabel("admin")).toBe("Admin")
    expect(roleLabel("mod")).toBe("Mod")
    expect(roleLabel("streamer")).toBe("Streamer")
  })
})

describe("destino al entrar", () => {
  it("vuelve a la página de la que venía si el rol puede abrirla", () => {
    expect(resolveLoginTarget("mod", "/mod?streamer=s1")).toBe("/mod?streamer=s1")
    expect(resolveLoginTarget("admin", "/users")).toBe("/users")
  })

  it("si no puede abrirla, va a su página", () => {
    expect(resolveLoginTarget("mod", "/users")).toBe("/mod")
    expect(resolveLoginTarget("streamer", "/users")).toBe("/player")
  })

  it("sin destino previo, va a su página", () => {
    expect(resolveLoginTarget("admin", undefined)).toBe("/mod")
    expect(resolveLoginTarget("streamer", null)).toBe("/player")
  })

  it("ignora los destinos que no son rutas internas", () => {
    expect(resolveLoginTarget("admin", "//sitio.evil")).toBe("/mod")
    expect(resolveLoginTarget("admin", "https://sitio.evil")).toBe("/mod")
  })
})
