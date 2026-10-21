import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { defaultPathForRole } from "@/lib/navigation"

/**
 * La portada ya no elige modo: cada rol va a su página.
 *
 * La cabecera es la navegación, así que preguntar "¿panel o reproductor?"
 * era un paso de más. Un streamer aterriza en su reproductor y los demás
 * en el panel, que es donde trabajan.
 */
export default async function Home() {
  const session = await getSession()
  if (!session) redirect("/login")

  redirect(defaultPathForRole(session.role))
}
