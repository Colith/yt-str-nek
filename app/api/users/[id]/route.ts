import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { requireRoles, ADMIN_ROLES } from "@/lib/authorize"
import { parseRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const MIN_PASSWORD = 8

type Params = { params: Promise<{ id: string }> }

/** Cambia el nombre de usuario, la contraseña o el rol. */
export async function PATCH(req: Request, { params }: Params) {
  const guard = await requireRoles(ADMIN_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const newUsername =
    typeof body.username === "string" ? body.username.trim() : undefined
  const newPassword =
    typeof body.password === "string" && body.password.length > 0
      ? body.password
      : undefined
  const newRole = parseRole(body.role)

  // Primero el rol: si viene uno explícito y no existe, el error es ese, no
// "no hay nada que cambiar".
if (body.role !== undefined && !newRole) {
  return NextResponse.json({ error: "Ese rol no existe" }, { status: 400 })
  }

  if (newUsername === undefined && newPassword === undefined && !newRole) {
    return NextResponse.json({ error: "No hay nada que cambiar" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Ese usuario no existe" }, { status: 404 })
  }

  // Sin esto, el último admin podría degradarse a sí mismo y nadie podría
  // volver a entrar en /users.
  if (existing.role === "admin" && newRole && newRole !== "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } })
    if (admins <= 1) {
      return NextResponse.json(
        { error: "No se puede quitar el único administrador" },
        { status: 400 }
      )
    }
  }

  if (newUsername !== undefined) {
    if (!newUsername) {
      return NextResponse.json(
        { error: "El nombre de usuario no puede quedar vacío" },
        { status: 400 }
      )
    }
    if (newUsername.length > 32) {
      return NextResponse.json(
        { error: "El nombre de usuario es demasiado largo" },
        { status: 400 }
      )
    }

    const clash = await prisma.user.findUnique({ where: { username: newUsername } })
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { error: "Ese nombre ya está en uso" },
        { status: 409 }
      )
    }
  }

  if (newPassword !== undefined && newPassword.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `La contraseña necesita al menos ${MIN_PASSWORD} caracteres` },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(newUsername !== undefined ? { username: newUsername } : {}),
      ...(newPassword !== undefined
        ? { password: await bcrypt.hash(newPassword, 10) }
        : {}),
      ...(newRole ? { role: newRole } : {}),
    },
    select: { id: true, username: true, role: true, createdAt: true },
  })

  return NextResponse.json({
    user: { ...user, songsAdded: 0, isSelf: user.id === session.id },
  })
}

/** Elimina un usuario. No se puede borrar a uno mismo ni quedarse sin ninguno. */
export async function DELETE(req: Request, { params }: Params) {
  const guard = await requireRoles(ADMIN_ROLES)
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const { id } = await params

  if (id === session.id) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propio usuario" },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "Ese usuario no existe" }, { status: 404 })
  }

  const total = await prisma.user.count()
  if (total <= 1) {
    return NextResponse.json(
      { error: "No se puede quedar la aplicación sin usuarios" },
      { status: 400 }
    )
  }

  if (existing.role === "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } })
    if (admins <= 1) {
      return NextResponse.json(
        { error: "No se puede eliminar el único administrador" },
        { status: 400 }
      )
    }
  }

  // addedById tiene onDelete implícito restrictivo: primero se sueltan las
  // referencias para poder borrar el usuario.
  await prisma.$transaction([
    prisma.queueItem.updateMany({ where: { addedById: id }, data: { addedById: null } }),
    prisma.historyItem.updateMany({ where: { addedById: id }, data: { addedById: null } }),
    prisma.user.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}