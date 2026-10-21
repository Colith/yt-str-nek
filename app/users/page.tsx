import { redirect } from "next/navigation"
import { getSession, hasRole, ADMIN_ROLES } from "@/lib/auth"
import { getAvatarUrl } from "@/lib/avatars"
import { SITE } from "@/lib/site"
import { UsersManager } from "@/components/users/users-manager"
import { PageTransition } from "@/components/ui/view-transition"
import { AppHeader } from "@/components/layout/app-header"

export const metadata = {
  title: `Usuarios · ${SITE.name}`,
}

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/users")
  if (!hasRole(session, ADMIN_ROLES)) redirect("/mod")

  const avatarUrl = await getAvatarUrl(session.id)

  return (
    <>
      <AppHeader session={session} active="users" avatarUrl={avatarUrl} />

      <PageTransition>
        <div className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-3xl space-y-6 p-6">
          <UsersManager />
        </div>
      </PageTransition>
    </>
  )
}
