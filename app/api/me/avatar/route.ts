import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import {
  AVATAR_MAX_BYTES,
  avatarUrl,
  deleteAvatar,
  saveAvatar,
  sniffImageType,
} from "@/lib/avatars"

/**
 * Foto de perfil del usuario que está dentro.
 *
 * Se sube ya recortada desde el navegador (256x256, WebP), así que aquí solo
 * se comprueba que es una imagen de verdad y que no es enorme. El tipo se
 * deduce de los bytes del fichero, no del `content-type` que declara el
 * cliente.
 */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: "No se ha enviado ninguna imagen" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se ha enviado ninguna imagen" }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "La imagen está vacía" }, { status: 400 })
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "La imagen es demasiado grande" },
      { status: 413 }
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImageType(bytes)
  if (!type) {
    return NextResponse.json(
      { error: "Ese fichero no es una imagen" },
      { status: 400 }
    )
  }

  const avatar = await saveAvatar(session.id, bytes, type)

  return NextResponse.json({ ok: true, url: avatarUrl(session.id, avatar.updatedAt) })
}

/** Quita la foto de perfil y vuelve a las iniciales. */
export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  await deleteAvatar(session.id)

  return NextResponse.json({ ok: true })
}
