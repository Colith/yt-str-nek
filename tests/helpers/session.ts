import { SESSION_COOKIE, signSessionToken, type SessionUser } from "@/lib/session"

/** Cookies de la "petición" en curso, compartidas con el mock de next/headers. */
export const cookieJar = new Map<
  string,
  { value: string; options?: Record<string, unknown> }
>()

/** Deja la petición autenticada como ese usuario. */
export async function signInAs(user: SessionUser): Promise<void> {
  cookieJar.set(SESSION_COOKIE, { value: await signSessionToken(user) })
}

/** Deja la petición sin sesión. */
export function signOut(): void {
  cookieJar.delete(SESSION_COOKIE)
}
