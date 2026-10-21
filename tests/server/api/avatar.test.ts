import { beforeEach, describe, expect, it } from "vitest"
import { DELETE, PUT } from "@/app/api/me/avatar/route"
import { GET } from "@/app/api/avatars/[id]/route"
import { prisma } from "@/lib/prisma"
import { AVATAR_MAX_BYTES } from "@/lib/avatars"
import { createUser, resetDatabase, signInAsNew } from "../../helpers/factories"
import { readJson, routeParams } from "../../helpers/http"
import { signOut } from "../../helpers/session"

beforeEach(resetDatabase)

/** Cabecera de un PNG: lo que decide que el fichero sea una imagen. */
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0]
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

function imageBytes(head: number[], size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set(head, 0)
  return bytes
}

function uploadRequest(file: File | null): Request {
  const form = new FormData()
  if (file) form.append("file", file)
  return new Request("http://localhost:3000/api/me/avatar", {
    method: "PUT",
    body: form,
  })
}

function upload(file: File | null) {
  return PUT(uploadRequest(file))
}

function pngFile(size = 64) {
  return new File([imageBytes(PNG_HEAD, size)], "foto.png", { type: "image/png" })
}

function fetchAvatar(id: string) {
  return GET(new Request(`http://localhost:3000/api/avatars/${id}`), routeParams({ id }))
}

describe("permisos de la foto de perfil", () => {
  it("sin sesión responde 401 en todas las operaciones", async () => {
    signOut()

    expect((await upload(pngFile())).status).toBe(401)
    expect((await DELETE()).status).toBe(401)
    expect((await fetchAvatar("u1")).status).toBe(401)
  })

  it("cualquier rol dentro puede gestionar su propia foto", async () => {
    await signInAsNew("streamer")

    expect((await upload(pngFile())).status).toBe(200)
  })
})

describe("PUT /api/me/avatar", () => {
  it("guarda la foto y devuelve su URL", async () => {
    const user = await signInAsNew("mod")

    const res = await upload(pngFile())

    expect(res.status).toBe(200)
    const body = await readJson(res)
    expect(body.ok).toBe(true)
    expect(body.url).toContain(`/api/avatars/${user.id}`)

    const stored = await prisma.avatar.findUniqueOrThrow({ where: { userId: user.id } })
    expect(stored.type).toBe("image/png")
    expect(stored.data.length).toBe(64)
  })

  it("acepta JPEG y WebP", async () => {
    const user = await signInAsNew("mod")

    await upload(new File([imageBytes(JPEG_HEAD)], "foto.jpg", { type: "image/jpeg" }))
    expect((await prisma.avatar.findUniqueOrThrow({ where: { userId: user.id } })).type).toBe(
      "image/jpeg"
    )

    await upload(new File([imageBytes(WEBP_HEAD)], "foto.webp", { type: "image/webp" }))
    expect((await prisma.avatar.findUniqueOrThrow({ where: { userId: user.id } })).type).toBe(
      "image/webp"
    )
  })

  it("sustituye la foto anterior en vez de guardar otra", async () => {
    const user = await signInAsNew("mod")

    await upload(pngFile(64))
    await upload(new File([imageBytes(JPEG_HEAD)], "foto.jpg", { type: "image/jpeg" }))

    expect(await prisma.avatar.count()).toBe(1)
    const stored = await prisma.avatar.findUniqueOrThrow({ where: { userId: user.id } })
    expect(stored.type).toBe("image/jpeg")
  })

  it("no se fía del content-type que declara el cliente", async () => {
    const user = await signInAsNew("mod")

    // Dice que es un PNG, pero los bytes son de un JPEG.
    const res = await upload(
      new File([imageBytes(JPEG_HEAD)], "mentira.png", { type: "image/png" })
    )

    expect(res.status).toBe(200)
    const stored = await prisma.avatar.findUniqueOrThrow({ where: { userId: user.id } })
    expect(stored.type).toBe("image/jpeg")
  })

  it("rechaza lo que no es una imagen", async () => {
    await signInAsNew("mod")

    const res = await upload(
      new File([new TextEncoder().encode("esto no es una imagen")], "nota.txt", {
        type: "text/plain",
      })
    )

    expect(res.status).toBe(400)
    expect((await readJson(res)).error).toContain("no es una imagen")
    expect(await prisma.avatar.count()).toBe(0)
  })

  it("rechaza una imagen demasiado grande", async () => {
    await signInAsNew("mod")

    const res = await upload(pngFile(AVATAR_MAX_BYTES + 1))

    expect(res.status).toBe(413)
    expect(await prisma.avatar.count()).toBe(0)
  })

  it("rechaza una petición sin imagen o con una vacía", async () => {
    await signInAsNew("mod")

    expect((await upload(null)).status).toBe(400)
    expect((await upload(new File([], "vacia.png", { type: "image/png" }))).status).toBe(400)
    expect(await prisma.avatar.count()).toBe(0)
  })
})

describe("GET /api/avatars/[id]", () => {
  it("devuelve la imagen con su tipo", async () => {
    const user = await signInAsNew("mod")
    await upload(new File([imageBytes(JPEG_HEAD)], "foto.jpg", { type: "image/jpeg" }))

    const res = await fetchAvatar(user.id)

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/jpeg")
    expect(res.headers.get("cache-control")).toContain("private")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(imageBytes(JPEG_HEAD))
  })

  it("responde 404 si ese usuario no tiene foto", async () => {
    await signInAsNew("mod")
    const other = await createUser("streamer")

    expect((await fetchAvatar(other.id)).status).toBe(404)
  })

  it("al borrar a un usuario, su foto desaparece con él", async () => {
    const user = await signInAsNew("mod")
    await upload(pngFile())

    await prisma.user.delete({ where: { id: user.id } })

    expect((await fetchAvatar(user.id)).status).toBe(404)
  })
})

describe("DELETE /api/me/avatar", () => {
  it("quita la foto y deja al usuario sin ella", async () => {
    const user = await signInAsNew("mod")
    await upload(pngFile())

    const res = await DELETE()

    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ ok: true })
    expect(await prisma.avatar.count()).toBe(0)
    expect((await fetchAvatar(user.id)).status).toBe(404)
  })

  it("quitar la foto cuando no hay ninguna no es un error", async () => {
    await signInAsNew("mod")

    expect((await DELETE()).status).toBe(200)
  })

  it("solo quita la foto del que la pide", async () => {
    await signInAsNew("mod")
    const other = await createUser("streamer")
    await prisma.avatar.create({
      data: { userId: other.id, data: imageBytes(PNG_HEAD), type: "image/png" },
    })

    await DELETE()

    expect(await prisma.avatar.count()).toBe(1)
  })
})
