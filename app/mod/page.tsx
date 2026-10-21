import { redirect } from "next/navigation"
import { getSession, hasRole, PANEL_ACCESS_ROLES } from "@/lib/auth"
import { getAvatarUrl } from "@/lib/avatars"
import { SITE } from "@/lib/site"
import { listStreamers } from "@/lib/streamers"
import { ModDashboard } from "@/components/queue/mod-dashboard"
import { AppHeader } from "@/components/layout/app-header"

export const metadata = {
  title: `Panel · ${SITE.name}`,
}

export default async function ModPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/mod")

  // El proxy ya lo bloquea, pero repetirlo aquí evita que un cambio futuro en
  // el matcher deje el panel abierto por error. Un streamer también entra: ve
  // solo su propia cola, porque listStreamers se la limita.
  if (!hasRole(session, PANEL_ACCESS_ROLES)) redirect("/")

  const streamers = await listStreamers(session)
  const avatarUrl = await getAvatarUrl(session.id)

  // La cola abierta va en la URL. Si no viene, o apunta a alguien que ya no es
  // streamer, se abre la del primero.
  const requested = (await searchParams).streamer
  const requestedId = typeof requested === "string" ? requested : null
  const fromUrl = streamers.some((s) => s.id === requestedId)
  const initialStreamerId = fromUrl ? requestedId : (streamers[0]?.id ?? null)

  return (
    <>
      <AppHeader
        session={session}
        active="panel"
        avatarUrl={avatarUrl}
        // El reproductor de la cabecera abre la cola que se está gestionando.
        // Solo cuando viene en la URL: si no, se abre el reproductor en general
        // y así nunca apunta a una cola distinta de la que se está viendo.
        playerHref={
          fromUrl && requestedId
            ? `/player?streamer=${encodeURIComponent(requestedId)}`
            : undefined
        }
      />

      <ModDashboard
        canManageUsers={session.role === "admin"}
        streamers={streamers}
        initialStreamerId={initialStreamerId}
        fromUrl={fromUrl}
      />
    </>
  )
}
