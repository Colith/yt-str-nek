import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { Headphones, LogOut, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { PageTransition } from "@/components/ui/view-transition"
import { getSession, hasRole, PANEL_ROLES } from "@/lib/auth"
import { ThemeToggle } from "@/components/theme/theme-toggle"

export const metadata = {
  title: "yt-str-nek",
  description: "Gestor de cola de música para streamers y moderadores",
}

const MODES = [
  {
    href: "/mod",
    title: "Modo moderador",
    description:
      "Gestiona la cola de cada streamer: busca canciones, añade enlaces, elimina, reordena y marca lo que ya sonó.",
    icon: ShieldCheck,
  },
  {
    href: "/player",
    title: "Modo streamer",
    description:
      "Reproductor de tu cola: la música empieza y avanza sola mientras los moderadores añaden canciones.",
    icon: Headphones,
  },
]

export default async function Home() {
  const session = await getSession()

  // La portada es la elección de modo, así que sin sesión no hay nada que
  // elegir: se manda al login.
  if (!session) redirect("/login")

  // Un streamer no tiene elección: su único modo es el reproductor. Se le lleva
  // directo, sin hacerle pasar por la pantalla intermedia.
  if (!hasRole(session, PANEL_ROLES)) redirect("/player")

  return (
    <PageTransition>
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
            Hola, {session.username}. Elige cómo quieres entrar
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {MODES.map((mode) => (
            <Link
              key={mode.href}
              href={mode.href}
              transitionTypes={["nav-forward"]}
              className="group"
            >
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
      </div>
    </PageTransition>
  )
}
