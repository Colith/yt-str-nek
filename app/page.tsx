import Link from "next/link"
import Image from "next/image"
import { Headphones, LogOut, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { getSession, hasRole, PANEL_ROLES, PLAYER_ROLES } from "@/lib/auth"
import { ThemeToggle } from "@/components/theme/theme-toggle"

export const metadata = {
  title: "yt-str-nek",
  description: "Gestor de cola de música para moderadores",
}

const MODES = [
  {
    href: "/mod",
    title: "Modo moderador",
    description:
      "Gestiona la cola: busca canciones, añade enlaces, elimina, reordena y marca lo que ya sonó.",
    icon: ShieldCheck,
    allowed: PANEL_ROLES,
  },
  {
    href: "/player",
    title: "Modo streamer",
    description:
      "Reproductor con la canción actual, control de volumen y avance al terminar.",
    icon: Headphones,
    allowed: PLAYER_ROLES,
  },
]

export default async function Home() {
  const session = await getSession()

  // Solo se muestran los modos a los que el usuario tiene acceso: si es
  // streamer, no tiene sentido ofrecerle el panel de moderadores.
  const available = session ? MODES.filter((m) => hasRole(session, m.allowed)) : MODES

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="text-center">
        <div className="mx-auto mb-3 flex justify-center">
          <Image
            src="/logo-koi.png"
            alt="yt-str-nek"
            width={320}
            height={120}
            className="h-16 w-auto"
            priority
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {session
            ? `Hola, ${session.username}. Elige cómo quieres entrar`
            : "Elige cómo quieres entrar"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {available.map((mode) => (
          <Link key={mode.href} href={mode.href} className="group">
            <Card className="h-full border-2 border-border/60 transition-colors group-hover:border-primary/70">
              <CardContent className="space-y-2 py-6">
                <mode.icon className="h-7 w-7 text-primary" />
                <CardTitle className="font-heading text-lg">{mode.title}</CardTitle>
                <CardDescription>{mode.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {session ? (
        <div className="flex justify-center">
          <form action="/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Ambas vistas requieren iniciar sesión.
        </p>
      )}
    </div>
  )
}