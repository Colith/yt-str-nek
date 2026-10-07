import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getSession, hasRole, ADMIN_ROLES } from "@/lib/auth"
import { buttonVariants } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { UsersManager } from "@/components/users/users-manager"

export const metadata = {
  title: "Usuarios · yt-str-nek",
}

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/users")
  if (!hasRole(session, ADMIN_ROLES)) redirect("/mod")

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/mod"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al panel
        </Link>
        <ThemeToggle />
      </div>

      <UsersManager />

      <div className="flex justify-center gap-3 pt-2">
        <Link href="/mod" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Panel de moderadores
        </Link>
        <Link href="/player" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Reproductor
        </Link>
      </div>
    </div>
  )
}