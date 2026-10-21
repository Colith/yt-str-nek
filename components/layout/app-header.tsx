import Link from "next/link"
import { ListMusic, Radio, Users } from "lucide-react"
import { AppearanceMenu } from "@/components/theme/appearance-menu"
import { LogoutButton } from "@/components/layout/logout-button"
import { UserAvatar } from "@/components/layout/user-avatar"
import { Wordmark } from "@/components/layout/wordmark"
import { defaultPathForRole, getHeaderItems, roleLabel, type HeaderSection } from "@/lib/navigation"
import { SITE } from "@/lib/site"
import type { SessionUser } from "@/lib/session"

/** Iconos de la cabecera, elegidos por nombre desde lib/navigation.ts. */
const ICONS = {
  queue: ListMusic,
  player: Radio,
  users: Users,
} as const

interface AppHeaderProps {
  session: SessionUser
  /** Sección en la que está el usuario, para marcarla como activa. */
  active?: HeaderSection
  /**
   * Enlace del reproductor. En el panel apunta a la cola que se está
   * gestionando, para no tener que elegirla otra vez en otra pestaña.
   */
  playerHref?: string
  /** Foto del usuario, si tiene alguna. */
  avatarUrl?: string | null
}

/**
 * Cabecera de la aplicación.
 *
 * Cada rol ve solo lo que puede usar: un admin tiene además el panel de
 * usuarios, un mod no lo tiene y un streamer ve su cola y su reproductor.
 * Lo que no se puede hacer no aparece, en lugar de aparecer bloqueado.
 *
 * La marca va en el centro y el usuario en la derecha, como en cualquier
 * aplicación en la que se pasa la mayor parte del tiempo. El bloque del
 * usuario lleva a sus ajustes, donde se cambia la foto de perfil.
 */
export function AppHeader({ session, active, playerHref, avatarUrl }: AppHeaderProps) {
  const items = getHeaderItems(session.role)

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4">
        {/* Izquierda: las secciones a las que puede ir. */}
        <nav aria-label="Secciones" className="flex min-w-0 items-center gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.icon]
            const href = item.key === "player" ? (playerHref ?? item.href) : item.href

            // La sección en la que se está no es un enlace: pulsarla no
            // lleva a ninguna parte, y en el reproductor abriría otra vez
            // la misma cola.
            if (item.key === active) {
              return (
                <span
                  key={item.key}
                  aria-current="page"
                  title={item.description}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-muted px-2.5 text-sm font-medium text-foreground"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="sr-only sm:not-sr-only">{item.label}</span>
                </span>
              )
            }

            return (
              <Link
                key={item.key}
                href={href}
                title={item.description}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="sr-only sm:not-sr-only">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Centro: la marca de la página. */}
        <Link
          href={defaultPathForRole(session.role)}
          title={SITE.name}
          className="flex items-center rounded-lg px-1 py-1 transition-opacity hover:opacity-80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-lg" />
        </Link>

        {/* Derecha: apariencia y datos de la cuenta. */}
        <div className="flex min-w-0 items-center justify-end gap-1">
          <AppearanceMenu />

          <div className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
            {/* El bloque del usuario es la puerta a sus ajustes. */}
            <Link
              href="/settings"
              title="Ajustes"
              className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <UserAvatar username={session.username} imageUrl={avatarUrl} />
              <span className="max-w-32 truncate font-medium sm:max-w-none">
                {session.username}
              </span>
              <span className="hidden shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-xs font-normal text-muted-foreground lg:inline">
                {roleLabel(session.role)}
              </span>
            </Link>
          </div>

          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
