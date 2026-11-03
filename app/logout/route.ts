import { NextResponse, type NextRequest } from "next/server"
import { destroySession } from "@/lib/auth"

/**
 * Cierra la sesión y vuelve a la portada.
 *
 * Es una ruta aparte porque el API de cierre devuelve JSON y un formulario
 * normal no sabría a dónde ir después.
 *
 * Solo por POST: con GET, cualquier visita accidental (o un prefetch del
 * navegador) a /logout cerraba la sesión sin querer. Un GET ahora responde
 * 405 y no toca la cookie.
 */
export async function POST(request: NextRequest) {
  await destroySession()
  return NextResponse.redirect(new URL("/", request.url), { status: 303 })
}
