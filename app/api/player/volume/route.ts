import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Guarda el volumen elegido por el usuario, para no tener que ajustarlo en
 * cada visita.
 */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const raw = body.volume

  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return NextResponse.json({ error: "Volumen no válido" }, { status: 400 })
  }

  const volume = Math.max(0, Math.min(100, Math.round(raw)))

  await prisma.user.update({
    where: { id: session.id },
    data: { volume },
  })

  return NextResponse.json({ ok: true, volume })
}