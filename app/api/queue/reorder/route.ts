import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { reorderQueueSchema } from "@/lib/validators"

export async function POST(req: Request) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const parsed = reorderQueueSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const { items } = parsed.data

  const current = await prisma.queueItem.findMany({
    orderBy: { position: "asc" },
    select: { id: true },
  })
  const currentIds = new Set(current.map((i) => i.id))

  // El cliente debe enviar exactamente la cola completa y sin ids ajenos.
  if (items.length !== current.length || items.some((i) => !currentIds.has(i.id))) {
    return NextResponse.json(
      { error: "El orden recibido no coincide con la cola actual" },
      { status: 409 }
    )
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.queueItem.update({
        where: { id: item.id },
        data: { position: item.position },
      })
    )
  )

  return NextResponse.json({ ok: true })
}