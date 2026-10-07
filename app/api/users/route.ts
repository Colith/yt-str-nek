import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { requireRoles, ADMIN_ROLES } from "@/lib/authorize"
import { parseRole, type Role } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const MIN_PASSWORD = 8

/**
 * Elige el rol de un usuario nuevo. Si no se indica uno, el primer usuario de
 * la aplicación es admin y los demás moderadores: así siempre queda alguien
 * que pueda entrar en /users.
 *
 * Un rol explícito pero desconocido es un error, no motivo para aplicarle un
 * rol por defecto en silencio.
 */
async function resolveNewRole(
  requested: unknown
): Promise<{ role: Role } | { error: string }> {
  if (requested !== undefined) {
    const explicit = parseRole(requested)
    if (!explicit) return { error: "Ese rol no existe" }
    return { role: explicit }
  }

  const total = await prisma.user.count()
  return { role: total === 0 ? "admin" : "mod" }
}

export async function GET() {
  const guard = await requireRoles(ADMIN_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      _count: { select: { addedBy: true } },
    },
  })

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      songsAdded: u._count.addedBy,
      isSelf: u.id === session.id,
    })),
  })
}

/** Crea un usuario nuevo. */
export async function POST(req: Request) {
  const guard = await requireRoles(ADMIN_ROLES)
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => ({}))
  const username = typeof body.username === "string" ? body.username.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!username) {
    return NextResponse.json({ error: "Falta el nombre de usuario" }, { status: 400 })
  }
  const resolved = await resolveNewRole(body.role)
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }
  const role = resolved.role
  if (username.length > 32) {
    return NextResponse.json(
      { error: "El nombre de usuario es demasiado largo" },
      { status: 400 }
    )
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres` },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un usuario con ese nombre" },
      { status: 409 }
    )
  }

  const user = await prisma.user.create({
    data: { username, password: await bcrypt.hash(password, 10), role },
    select: { id: true, username: true, role: true, createdAt: true },
  })

  return NextResponse.json({ user: { ...user, songsAdded: 0, isSelf: false } }, { status: 201 })
}