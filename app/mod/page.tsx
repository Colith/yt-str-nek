import { redirect } from "next/navigation"
import { getSession, hasRole, PANEL_ROLES } from "@/lib/auth"
import { listStreamers } from "@/lib/streamers"
import { ModDashboard } from "@/components/queue/mod-dashboard"

export default async function ModPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/mod")

  // El proxy ya lo bloquea, pero repetirlo aquí evita que un cambio futuro en
  // el matcher deje el panel abierto por error.
  if (!hasRole(session, PANEL_ROLES)) redirect("/")

  const streamers = await listStreamers(session)

  // La cola abierta va en la URL. Si no viene, o apunta a alguien que ya no es
  // streamer, se abre la del primero.
  const requested = (await searchParams).streamer
  const requestedId = typeof requested === "string" ? requested : null
  const fromUrl = streamers.some((s) => s.id === requestedId)
  const initialStreamerId = fromUrl ? requestedId : (streamers[0]?.id ?? null)

  return (
    <ModDashboard
      username={session.username}
      canManageUsers={session.role === "admin"}
      streamers={streamers}
      initialStreamerId={initialStreamerId}
      fromUrl={fromUrl}
    />
  )
}
