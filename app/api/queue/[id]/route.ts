import { NextResponse } from "next/server"
import { requireRoles, PANEL_ROLES } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { renumberQueue } from "@/lib/songs"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireRoles(PANEL_ROLES)
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const item = await prisma.queueItem.delete({ where: { id } }).catch(() => null)
  if (!item) {
    return NextResponse.json({ error: "La canción no está en la cola" }, { status: 404 })
  }

  await renumberQueue()
  return NextResponse.json({ ok: true })
}