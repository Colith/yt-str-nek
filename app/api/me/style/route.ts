import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseArtStyle } from "@/lib/preferences"

/**
 * Guarda el fondo elegido por el usuario ("normal" u "otaku") en su cuenta.
 *
 * El layout vuelve a leerlo en la siguiente carga y lo refleja en
 * `data-art`; aquí también lo cambiamos en el cliente sin recargar.
 */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const artStyle = parseArtStyle(body.artStyle)

  if (!artStyle) {
    return NextResponse.json({ error: "Estilo de fondo no válido" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.id },
    data: { artStyle },
  })

  return NextResponse.json({ ok: true, artStyle })
}
