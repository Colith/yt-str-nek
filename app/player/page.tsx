import Link from "next/link"
import { redirect } from "next/navigation"
import { Home, Radio } from "lucide-react"
import { getSession, hasRole, PANEL_ROLES } from "@/lib/auth"
import { listStreamers } from "@/lib/streamers"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Player } from "@/components/player/player"

export const metadata = {
  title: "Reproductor · yt-str-nek",
}

export default async function PlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getSession()
  if (!session) redirect("/login?callbackUrl=/player")

  // Un streamer solo recibe su propia cola; admin y mod, la de todos.
  const streamers = await listStreamers(session)
  const canSwitch = hasRole(session, PANEL_ROLES)

  const requested = (await searchParams).streamer
  const requestedId = typeof requested === "string" ? requested : null

  // Con un único streamer posible no hay nada que elegir: se abre el suyo.
  const streamer =
    streamers.find((s) => s.id === requestedId) ??
    (streamers.length === 1 ? streamers[0] : null)

  if (streamer) {
    // La key reinicia el reproductor al pasar de un streamer a otro.
    return (
      <Player
        key={streamer.id}
        streamer={streamer}
        streamers={canSwitch ? streamers : []}
      />
    )
  }

  // Admin o mod sin streamer elegido: se les pide que escojan una cola.
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Home className="h-4 w-4" />
        Cambiar de modo
      </Link>
      <Card className="border-2 border-border/60">
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1">
            <CardTitle className="font-heading text-lg">
              {streamers.length === 0
                ? "Todavía no hay ningún streamer"
                : "¿Qué cola quieres reproducir?"}
            </CardTitle>
            <CardDescription>
              {streamers.length === 0
                ? "Cada cola pertenece a un usuario con rol streamer. Un administrador puede crearlo en la página de usuarios."
                : "Cada streamer tiene su propia cola."}
            </CardDescription>
          </div>
          {streamers.length > 0 && (
            <ul className="flex flex-col gap-2">
              {streamers.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/player?streamer=${encodeURIComponent(s.id)}`}
                    className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm font-medium transition-colors hover:border-primary/70"
                  >
                    <Radio className="h-4 w-4 text-primary" />
                    {s.username}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
