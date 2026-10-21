import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { getAvatarUrl } from "@/lib/avatars"
import { SITE } from "@/lib/site"
import { AppHeader } from "@/components/layout/app-header"
import { ProfileSettings } from "@/components/settings/profile-settings"
import { PageTransition } from "@/components/ui/view-transition"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = {
  title: `Ajustes · ${SITE.name}`,
}

/**
 * Ajustes de la cuenta.
 *
 * Ahora mismo solo tiene la foto de perfil, que es lo que cada usuario
 * puede cambiar por su cuenta. La página queda hecha para que mañana tenga
 * su propio apartado sin tocar la cabecera.
 */
export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/settings")

  const avatarUrl = await getAvatarUrl(session.id)

  return (
    <>
      <AppHeader session={session} avatarUrl={avatarUrl} />

      <PageTransition>
        <div className="mx-auto min-h-[calc(100dvh-3.5rem)] max-w-3xl space-y-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Foto de perfil</CardTitle>
              <CardDescription>
                La imagen se recorta a un cuadrado y se guarda en tu cuenta.
                Solo se ven las fotos de los usuarios de la aplicación.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileSettings username={session.username} avatarUrl={avatarUrl} />
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    </>
  )
}
