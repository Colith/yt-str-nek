import { beforeEach, describe, expect, it } from "vitest"
import bcrypt from "bcryptjs"
import { GET, POST } from "@/app/api/users/route"
import { DELETE, PATCH } from "@/app/api/users/[id]/route"
import { verifyCredentials } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createUser,
  enqueue,
  resetDatabase,
  signInAsNew,
} from "../../helpers/factories"
import { jsonRequest, readJson, routeParams } from "../../helpers/http"
import { signOut } from "../../helpers/session"

beforeEach(resetDatabase)

const create = (body: unknown) => POST(jsonRequest("/api/users", "POST", body))
const patch = (id: string, body: unknown) =>
  PATCH(jsonRequest(`/api/users/${id}`, "PATCH", body), routeParams({ id }))
const remove = (id: string) =>
  DELETE(jsonRequest(`/api/users/${id}`, "DELETE"), routeParams({ id }))

describe("permisos de /api/users", () => {
  it("sin sesión responde 401 en todas las operaciones", async () => {
    signOut()

    expect((await GET()).status).toBe(401)
    expect((await create({ username: "x", password: "12345678" })).status).toBe(401)
    expect((await patch("u1", { username: "x" })).status).toBe(401)
    expect((await remove("u1")).status).toBe(401)
  })

  it.each(["mod", "streamer"] as const)("un %s recibe 403 en todas", async (role) => {
    const me = await signInAsNew(role)
    const other = await createUser("mod")

    expect((await GET()).status).toBe(403)
    expect((await create({ username: "x", password: "12345678" })).status).toBe(403)
    expect((await patch(other.id, { role: "admin" })).status).toBe(403)
    // Tampoco puede hacerse admin a sí mismo
    expect((await patch(me.id, { role: "admin" })).status).toBe(403)
    expect((await remove(other.id)).status).toBe(403)
    expect(await prisma.user.count()).toBe(2)
  })
})

describe("GET /api/users", () => {
  it("lista los usuarios sin exponer nunca la contraseña", async () => {
    const admin = await signInAsNew("admin", "jefa")
    const streamer = await createUser("streamer", "directo")
    await enqueue(streamer.id, { addedById: admin.id })

    const body = await readJson(await GET())

    expect(body.users.map((u: { username: string }) => u.username)).toEqual(["jefa", "directo"])
    expect(body.users[0]).toMatchObject({ role: "admin", songsAdded: 1, isSelf: true })
    expect(body.users[1]).toMatchObject({ role: "streamer", songsAdded: 0, isSelf: false })
    expect(JSON.stringify(body)).not.toContain("password")
    expect(JSON.stringify(body)).not.toContain("sin-hash")
  })
})

describe("POST /api/users", () => {
  beforeEach(() => signInAsNew("admin"))

  it("crea el usuario con la contraseña cifrada y sin devolverla", async () => {
    const res = await create({ username: " nueva ", password: "clave-larga", role: "streamer" })

    expect(res.status).toBe(201)
    const body = await readJson(res)
    expect(body.user).toMatchObject({ username: "nueva", role: "streamer" })
    expect(JSON.stringify(body)).not.toContain("clave-larga")
    expect(JSON.stringify(body)).not.toContain("password")

    const stored = await prisma.user.findUniqueOrThrow({ where: { username: "nueva" } })
    expect(stored.password).not.toBe("clave-larga")
    expect(await bcrypt.compare("clave-larga", stored.password)).toBe(true)
    expect(await verifyCredentials("nueva", "clave-larga")).toMatchObject({ role: "streamer" })
  })

  it("si no se indica rol, el nuevo usuario es moderador", async () => {
    const body = await readJson(await create({ username: "nueva", password: "clave-larga" }))
    expect(body.user.role).toBe("mod")
  })

  it("valida nombre, contraseña y rol", async () => {
    const cases: Array<[unknown, number, string]> = [
      [{ password: "clave-larga" }, 400, "Falta el nombre de usuario"],
      [{ username: "   ", password: "clave-larga" }, 400, "Falta el nombre de usuario"],
      [{ username: "x".repeat(33), password: "clave-larga" }, 400, "demasiado largo"],
      [{ username: "nueva", password: "corta" }, 400, "al menos 8 caracteres"],
      [{ username: "nueva", password: "clave-larga", role: "root" }, 400, "Ese rol no existe"],
    ]

    for (const [body, status, message] of cases) {
      const res = await create(body)
      expect(res.status).toBe(status)
      expect((await readJson(res)).error).toContain(message)
    }
    expect(await prisma.user.count()).toBe(1)
  })

  it("no permite dos usuarios con el mismo nombre", async () => {
    await create({ username: "nueva", password: "clave-larga" })

    const res = await create({ username: "nueva", password: "otra-clave-larga" })

    expect(res.status).toBe(409)
  })
})

describe("PATCH /api/users/[id]", () => {
  it("cambia nombre, contraseña y rol", async () => {
    await signInAsNew("admin")
    const user = await createUser("mod", "antes")

    const res = await patch(user.id, {
      username: "despues",
      password: "clave-nueva-1",
      role: "streamer",
    })

    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.user).toMatchObject({ username: "despues", role: "streamer", isSelf: false })
    expect(JSON.stringify(body)).not.toContain("password")
    expect(await verifyCredentials("despues", "clave-nueva-1")).toMatchObject({
      role: "streamer",
    })
  })

  it("una contraseña vacía no cambia la que había", async () => {
    await signInAsNew("admin")
    const user = await createUser("mod", "ana", await bcrypt.hash("clave-vieja", 4))

    const res = await patch(user.id, { username: "ana", password: "", role: "mod" })

    expect(res.status).toBe(200)
    expect(await verifyCredentials("ana", "clave-vieja")).not.toBeNull()
  })

  it("valida los datos y que el usuario exista", async () => {
    await signInAsNew("admin")
    const user = await createUser("mod", "ana")
    await createUser("mod", "ocupado")

    expect((await patch(user.id, {})).status).toBe(400)
    expect((await patch(user.id, { role: "root" })).status).toBe(400)
    expect((await patch(user.id, { username: "  " })).status).toBe(400)
    expect((await patch(user.id, { username: "x".repeat(33) })).status).toBe(400)
    expect((await patch(user.id, { password: "corta" })).status).toBe(400)
    expect((await patch(user.id, { username: "ocupado" })).status).toBe(409)
    expect((await patch("no-existe", { username: "x" })).status).toBe(404)

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(unchanged).toMatchObject({ username: "ana", role: "mod" })
  })

  it("mantener el propio nombre no cuenta como nombre repetido", async () => {
    await signInAsNew("admin")
    const user = await createUser("mod", "ana")

    expect((await patch(user.id, { username: "ana", role: "streamer" })).status).toBe(200)
  })

  it("no deja a la aplicación sin administradores", async () => {
    const admin = await signInAsNew("admin")

    const res = await patch(admin.id, { role: "mod" })

    expect(res.status).toBe(400)
    expect((await readJson(res)).error).toBe("No se puede quitar el único administrador")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("admin")
  })

  it("con otro admin sí se puede degradar a uno", async () => {
    await signInAsNew("admin")
    const second = await createUser("admin")

    expect((await patch(second.id, { role: "mod" })).status).toBe(200)
  })
})

describe("DELETE /api/users/[id]", () => {
  it("elimina al usuario y deja sin autor las canciones que añadió a otros", async () => {
    await signInAsNew("admin")
    const mod = await createUser("mod", "ana")
    const streamer = await createUser("streamer")
    const item = await enqueue(streamer.id, { addedById: mod.id, title: "De ana" })

    const res = await remove(mod.id)

    expect(await readJson(res)).toEqual({ ok: true })
    expect(await prisma.user.findUnique({ where: { id: mod.id } })).toBeNull()
    const kept = await prisma.queueItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(kept.addedById).toBeNull()
  })

  it("al eliminar a un streamer se borran su cola y su historial, no los de otros", async () => {
    await signInAsNew("admin")
    const gone = await createUser("streamer")
    const stays = await createUser("streamer")
    const song = (await enqueue(gone.id)).song
    await enqueue(stays.id)
    await prisma.historyItem.create({ data: { songId: song.id, streamerId: gone.id } })
    await prisma.historyItem.create({ data: { songId: song.id, streamerId: stays.id } })

    expect((await remove(gone.id)).status).toBe(200)

    expect(await prisma.queueItem.count({ where: { streamerId: gone.id } })).toBe(0)
    expect(await prisma.historyItem.count({ where: { streamerId: gone.id } })).toBe(0)
    expect(await prisma.queueItem.count({ where: { streamerId: stays.id } })).toBe(1)
    expect(await prisma.historyItem.count({ where: { streamerId: stays.id } })).toBe(1)
  })

  it("nadie puede eliminarse a sí mismo", async () => {
    const admin = await signInAsNew("admin")
    await createUser("admin")

    const res = await remove(admin.id)

    expect(res.status).toBe(400)
    expect(await prisma.user.count()).toBe(2)
  })

  it("responde 404 si el usuario no existe", async () => {
    await signInAsNew("admin")
    expect((await remove("no-existe")).status).toBe(404)
  })

  it("no elimina al único administrador aunque lo pida otra sesión de admin", async () => {
    // Sesión de un admin que ya fue degradado: el JWT conserva el rol antiguo.
    const stale = await signInAsNew("admin")
    await prisma.user.update({ where: { id: stale.id }, data: { role: "mod" } })
    const lastAdmin = await createUser("admin")

    const res = await remove(lastAdmin.id)

    expect(res.status).toBe(400)
    expect((await readJson(res)).error).toBe("No se puede eliminar el único administrador")
  })
})
