import { NextResponse, type NextRequest } from "next/server"
import { destroySession } from "@/lib/auth"

/**
 * Cierra la sesión y vuelve a la portada.
 *
 * Es una ruta aparte porque el API de cierre devuelve JSON y un formulario
 * normal no sabría a dónde ir después.
 */
export async function POST(request: NextRequest) {
  await destroySession()
  return NextResponse.redirect(new URL("/", request.url), { status: 303 })
}

export async function GET(request: NextRequest) {
  await destroySession()
  return NextResponse.redirect(new URL("/", request.url))
}