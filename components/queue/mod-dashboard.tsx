"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ListMusic, Loader2, LogOut, Play, SkipForward, Radio, Users } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { YoutubeSearch } from "@/components/search/youtube-search"
import { AddByUrlForm } from "@/components/search/add-by-url-form"
import { QueueList } from "@/components/queue/queue-list"
import { HistoryList } from "@/components/history/history-list"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { useQueue } from "@/hooks/use-queue"
import { useQueueSync } from "@/hooks/use-queue-sync"
import { MAX_QUEUE, type YoutubeResult } from "@/types"

export function ModDashboard({
  username,
  canManageUsers,
}: {
  username: string
  canManageUsers: boolean
}) {
  const router = useRouter()
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
    refresh,
  } = useQueue()

  const [preloaded, setPreloaded] = useState<YoutubeResult | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  async function clearHistory() {
    setClearingHistory(true)
    try {
      const res = await fetch("/api/history", { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Historial borrado")
      await refresh()
    } catch {
      toast.error("No se pudo borrar el historial")
    } finally {
      setClearingHistory(false)
    }
  }

  useQueueSync(refresh)

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
            <a
              href="/player"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Radio />
              <span className="hidden sm:inline">Reproductor</span>
            </a>
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
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] border-x border-border/60 shadow-[0_1px_1px_rgba(0,0,0,0.01)]">
        <section className="flex flex-col gap-6">
          <YoutubeSearch
            onAdd={addSong}
            disabled={queueFull}
            preloaded={preloaded}
            clearPreloaded={() => setPreloaded(null)}
          />
          <AddByUrlForm onResolved={setPreloaded} disabled={queueFull} />
        </section>

        <section className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListMusic className="h-4 w-4 text-primary" />
                Cola
                <span className="text-sm font-normal text-muted-foreground">
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
                  Arrastra las canciones para cambiar el orden.
                </p>
              )}
            </CardContent>
          </Card>

          <HistoryList
            history={history}
            onReAdd={reAddFromHistory}
            onClear={clearHistory}
            clearing={clearingHistory}
            disabled={queueFull}
          />
        </section>
      </main>
    </div>
  )
}