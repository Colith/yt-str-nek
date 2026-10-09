"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ListMusic, Loader2, LogOut, Play, SkipForward, Radio, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { YoutubeSearch } from "@/components/search/youtube-search"
import { AddByUrlForm } from "@/components/search/add-by-url-form"
import { QueueList } from "@/components/queue/queue-list"
import { HistoryList } from "@/components/history/history-list"
import { StreamerSelect } from "@/components/streamers/streamer-select"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { useQueue } from "@/hooks/use-queue"
import { useQueueSync } from "@/hooks/use-queue-sync"
import { MAX_QUEUE, type Streamer, type YoutubeResult } from "@/types"

/** Recuerda el último streamer que gestionó este navegador. */
const LAST_STREAMER_KEY = "ytstrnek.lastStreamer"

export function ModDashboard({
  username,
  canManageUsers,
  streamers,
  initialStreamerId,
  fromUrl,
}: {
  username: string
  canManageUsers: boolean
  streamers: Streamer[]
  /** Streamer con el que abrir el panel, o null si todavía no hay ninguno. */
  initialStreamerId: string | null
  /** Si el streamer venía pedido en la URL: entonces manda sobre lo recordado. */
  fromUrl: boolean
}) {
  const router = useRouter()
  const [streamerId, setStreamerId] = useState(initialStreamerId)

  const {
    queue,
    history,
    loading,
    queueFull,
    addSong,
    removeItem,
    playNext,
    reorder,
    reAddFromHistory,
    clearHistory,
    refresh,
  } = useQueue(streamerId)

  const [preloaded, setPreloaded] = useState<YoutubeResult | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  // Sin streamer en la URL se abre con el último que se gestionó aquí, para no
  // tener que volver a elegirlo en cada visita.
  useEffect(() => {
    if (fromUrl) return
    try {
      const last = window.localStorage.getItem(LAST_STREAMER_KEY)
      if (last && last !== initialStreamerId && streamers.some((s) => s.id === last)) {
        // Se lee al montar porque localStorage no existe en el servidor.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStreamerId(last)
      }
    } catch {
      // Sin acceso a localStorage se queda el streamer por defecto.
    }
    // Solo al montar: después manda lo que elija el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectStreamer(id: string) {
    setStreamerId(id)
    setPreloaded(null)
    try {
      window.localStorage.setItem(LAST_STREAMER_KEY, id)
    } catch {
      // No poder recordarlo no impide cambiar de cola.
    }
    // La URL refleja la cola abierta: se puede recargar o compartir el enlace.
    router.replace(`/mod?streamer=${encodeURIComponent(id)}`, { scroll: false })
  }

  useQueueSync(refresh)

  const streamer = streamers.find((s) => s.id === streamerId) ?? null

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-1.5">
              <Image
                src="/logo-koi.png"
                alt="yt-str-nek"
                width={120}
                height={32}
                className="h-7 w-auto"
                priority
              />
            </Link>
            <span className="text-xs text-muted-foreground">· {username}</span>
          </div>
          <div className="flex items-center gap-1">
            {streamer && (
              <a
                href={`/player?streamer=${encodeURIComponent(streamer.id)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Radio />
                <span className="hidden sm:inline">Reproductor</span>
              </a>
            )}
            {canManageUsers && (
              <Link
                href="/users"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Users />
                <span className="hidden sm:inline">Usuarios</span>
              </Link>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Salir"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" })
                router.push("/login")
                router.refresh()
              }}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {streamer && (
          <div className="border-t border-border/60">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
              <StreamerSelect
                streamers={streamers}
                value={streamer.id}
                onChange={selectStreamer}
              />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Cada streamer tiene su propia cola e historial
              </span>
            </div>
          </div>
        )}
      </header>

      {!streamer ? (
        <main className="mx-auto max-w-xl px-4 py-16">
          <Card className="border-2 border-border/60 text-center">
            <CardContent className="space-y-3 py-10">
              <Radio className="mx-auto h-8 w-8 text-primary" />
              <p className="font-heading text-lg">Todavía no hay ningún streamer</p>
              <p className="text-sm text-muted-foreground">
                Cada cola pertenece a un usuario con rol streamer.{" "}
                {canManageUsers
                  ? "Crea uno para empezar a añadir canciones."
                  : "Pide a un administrador que cree uno."}
              </p>
              {canManageUsers && (
                <Link href="/users" className={buttonVariants({ size: "sm" })}>
                  <Users />
                  Ir a usuarios
                </Link>
              )}
            </CardContent>
          </Card>
        </main>
      ) : (
        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] border-x border-border/60 shadow-[0_1px_1px_rgba(0,0,0,0.01)]">
          <section className="flex flex-col gap-6">
            {/* La key reinicia la búsqueda al cambiar de streamer: lo buscado
                para uno no debe quedarse a un clic de la cola de otro. */}
            <YoutubeSearch
              key={streamer.id}
              onAdd={addSong}
              disabled={queueFull}
              preloaded={preloaded}
              clearPreloaded={() => setPreloaded(null)}
            />
            <AddByUrlForm
              key={`url-${streamer.id}`}
              onResolved={setPreloaded}
              disabled={queueFull}
            />
          </section>

          <section className="flex flex-col gap-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                  <ListMusic className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">Cola de {streamer.username}</span>
                  <span className="shrink-0 text-sm font-normal text-muted-foreground">
                    {queue.length}/{MAX_QUEUE}
                  </span>
                </CardTitle>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={queue.length === 0 || advancing}
                  onClick={async () => {
                    setAdvancing(true)
                    await playNext()
                    setAdvancing(false)
                  }}
                >
                  {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span>Reproducir siguiente</span>
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <QueueList queue={queue} onRemove={removeItem} onReorder={reorder} />
                )}
                {queue.length > 0 && (
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <SkipForward className="h-3 w-3" />
                    Arrastra las canciones para cambiar el orden. La primera es la
                    que suena en el reproductor.
                  </p>
                )}
              </CardContent>
            </Card>

            <HistoryList
              history={history}
              onReAdd={reAddFromHistory}
              onClear={async () => {
                setClearingHistory(true)
                await clearHistory()
                setClearingHistory(false)
              }}
              clearing={clearingHistory}
              disabled={queueFull}
            />
          </section>
        </main>
      )}
    </div>
  )
}
