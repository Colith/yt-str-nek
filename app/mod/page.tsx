import { redirect } from "next/navigation"
import { getSession, hasRole, PANEL_ROLES } from "@/lib/auth"
import { ModDashboard } from "@/components/queue/mod-dashboard"

export default async function ModPage() {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/mod")

  // El proxy ya lo bloquea, pero repetirlo aquí evita que un cambio futuro en
  // el matcher deje el panel abierto por error.
  if (!hasRole(session, PANEL_ROLES)) redirect("/")

  return (
    <ModDashboard
      username={session.username}
      canManageUsers={session.role === "admin"}
    />
  )
}