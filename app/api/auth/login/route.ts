import { NextResponse } from "next/server"
import { z } from "zod"
import { createSession, verifyCredentials } from "@/lib/auth"

const loginSchema = z.object({
  username: z.string().trim().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
})

export async function POST(req: Request) {
  try {
    const parsed = loginSchema.safeParse(await req.json())

    if (!parsed.success) {
      const first = parsed.error.issues[0]
      const field = first?.path[0]
      const message =
        field === "username"
          ? "Usuario requerido"
          : field === "password"
            ? "Contraseña requerida"
            : "Datos inválidos"
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const user = await verifyCredentials(parsed.data.username, parsed.data.password)
    if (!user) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 })
    }

    await createSession(user)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[login] error:", err)
    const message =
      err instanceof Error ? err.message : "Error al iniciar sesión"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}