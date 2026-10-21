import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getAvatar } from "@/lib/avatars"

type Params = { params: Promise<{ id: string }> }

/**
 * La foto de perfil de un usuario.
 *
 * Solo la ven los que están dentro de la aplicación: las fotos no se sirven
 * en abierto. La URL lleva la versión de la imagen (`?v=`), así que el
 * navegador puede cachearla un año sin miedo a que se quede la vieja.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const avatar = await getAvatar(id)

  if (!avatar) {
    return NextResponse.json({ error: "Ese usuario no tiene foto" }, { status: 404 })
  }

  return new NextResponse(
    new Blob([new Uint8Array(avatar.data)], { type: avatar.type }),
    {
      headers: {
        "Content-Type": avatar.type,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    }
  )
}
