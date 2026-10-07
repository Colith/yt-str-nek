"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CirclePlay,
  Headphones,
  Home,
  MonitorPlay,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { formatDuration } from "@/lib/format"
import type { PlayerSong } from "@/app/api/player/current/route"
import type { YTNamespace, YTPlayer, YTEventTarget } from "@/types/youtube-iframe"

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

const API_SRC = "https://www.youtube.com/iframe_api"
const DEFAULT_VOLUME = 80

let apiPromise: Promise<YTNamespace> | null = null

/** Carga la API IFrame de YouTube una sola vez. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }

    window.onYouTubeIframeAPIReady = () => {
      if (window.YT?.Player) resolve(window.YT)
    }

    if (document.querySelector(`script[src="${API_SRC}"]`)) return

    const script = document.createElement("script")
    script.src = API_SRC
    script.async = true
    script.onerror = () => reject(new Error("No se pudo cargar la API de YouTube"))
    document.head.appendChild(script)
  })

  return apiPromise
}

/**
 * Relleno de una barra, al estilo de YouTube: lo ya escuchado va en color
 * fuerte y el resto en un tono apagado. Se pinta en un div detrás del input,
 * porque la pista del range se deja transparente.
 */
interface VolumeBarFillProps {
  percent: number
}

function VolumeBarFill({ percent }: VolumeBarFillProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted/70 transition-all group-hover:h-1.5 group-focus-within:h-1.5">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-100"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function Player() {
  const router = useRouter()
  const [current, setCurrent] = useState<PlayerSong | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [position, setPosition] = useState({ current: 0, total: 0, buffered: 0 })
  // Fracción bajo el ratón en la barra de tiempo, para la vista previa
  const [preview, setPreview] = useState<{ at: number; visible: boolean }>({
    at: 0,
    visible: false,
  })

  const holderRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  // Identidad por item de cola: dos entradas con el mismo vídeo son distintas
  const loadedIdRef = useRef<string | null>(null)
  const volumeRef = useRef(DEFAULT_VOLUME)
  const advanceRef = useRef<(() => Promise<void>) | null>(null)
  const ytRef = useRef<YTNamespace | null>(null)
  const watchdogRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const loadedVolumeRef = useRef(false)
  // Evita repetir el mismo toast cada 5 segundos si el servidor sigue caído
  const loadErrorShownRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/player/current")

      if (res.status === 401) {
        router.replace("/login?callbackUrl=/player")
        return
      }

      // En un error 500 Next puede devolver HTML en vez de JSON. Si se llama a
      // res.json() a ciegas, eso lanza dentro del catch y el usuario solo ve
      // "no se pudo consultar la cola", que no dice nada de qué ha fallado.
      const raw = await res.text()
      let data: {
        current?: PlayerSong | null
        upNext?: number
        savedVolume?: number | null
        error?: string
      }
      try {
        data = raw ? JSON.parse(raw) : {}
      } catch {
        if (!loadErrorShownRef.current) {
          loadErrorShownRef.current = true
          toast.error(
            `El servidor falló con un error ${res.status}. Revisa los registros de Vercel.`
          )
        }
        setLoading(false)
        return
      }

      if (!res.ok) {
        if (!loadErrorShownRef.current) {
          loadErrorShownRef.current = true
          toast.error(data.error ?? `El servidor respondió con un error ${res.status}`)
        }
        setLoading(false)
        return
      }

      loadErrorShownRef.current = false
      setCurrent(data.current ?? null)

      // El volumen guardado solo se aplica la primera vez: si no, cada
      // sondeo de 5 s volvería a imponer el valor viejo mientras el usuario
      // está moviendo el deslizador.
      if (!loadedVolumeRef.current && typeof data.savedVolume === "number") {
        loadedVolumeRef.current = true
        setVolume(data.savedVolume)
        volumeRef.current = data.savedVolume
      }
    } catch {
      if (!loadErrorShownRef.current) {
        loadErrorShownRef.current = true
        toast.error("No se pudo conectar con el servidor")
      }
    } finally {
      setLoading(false)
    }
  }, [router])

  const advance = useCallback(async () => {
    const finishedId = loadedIdRef.current
    if (!finishedId) return

    try {
      const res = await fetch("/api/player/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueItemId: finishedId }),
      })

      // Si el servidor no confirmó el avance no se toca el reproductor: si no,
      // se recargaría la misma canción y el bucle no terminaría nunca.
      if (!res.ok) return

      await loadCurrent()
    } catch {
      toast.error("No se pudo avanzar la cola")
    }
  }, [loadCurrent])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  /**
   * La IFrame API no lanza error cuando el navegador bloquea el autoplay: se
   * limita a no cambiar de estado. Por eso no basta con llamar a playVideo(),
   * hay que comprobar que la canción se está reproduciendo de verdad.
   */
  const startWatchdog = useCallback(
    (songId: string) => {
      clearWatchdog()
      let tries = 0

      watchdogRef.current = window.setInterval(() => {
        tries += 1
        const player = playerRef.current
        const YT = ytRef.current
        // Si ya se está montando otra canción, este vigilante se descarta
        if (!player || !YT || loadedIdRef.current !== songId) {
          clearWatchdog()
          return
        }

        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
          clearWatchdog()
          return
        }

        if (tries >= 10) {
          clearWatchdog()
          setIsPlaying(false)
          setNeedsGesture(true)
        }
      }, 200)
    },
    [clearWatchdog]
  )

  /** Crea el reproductor para una canción. */
  const buildPlayer = useCallback(
    async (song: PlayerSong) => {
      const YT = await loadYouTubeApi()
      if (!holderRef.current) return

      ytRef.current = YT
      clearWatchdog()
      playerRef.current?.destroy()
      if (holderRef.current) holderRef.current.innerHTML = ""

      const node = document.createElement("div")
      holderRef.current.appendChild(node)

      setIsPlaying(false)
      setNeedsGesture(false)
      setPosition({ current: 0, total: song.durationSec ?? 0, buffered: 0 })

      playerRef.current = new YT.Player(node, {
        videoId: song.youtubeId,
        // El tamaño lo manda el contenedor, así el vídeo se adapta al ancho
        // sin recalcular nada al cambiar de modo.
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          controls: 0,
          rel: 0,
          start: 0,
        },
        events: {
          onReady: (event: { target: YTEventTarget }) => {
            // Los navegadores bloquean el autoplay con sonido si el visitante
            // no ha interactuado antes. Se arranca silenciado, que sí está
            // permitido, y el sonido se activa al confirmar que suena.
            event.target.mute()
            event.target.setVolume(volumeRef.current)
            event.target.playVideo()
            startWatchdog(song.queueItemId)
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.PLAYING) {
              clearWatchdog()
              setIsPlaying(true)
              setNeedsGesture(false)
              // Solo si el volumen no está a 0: si el usuario lo silenció a
              // propósito, no se le quita el silencio.
              if (volumeRef.current > 0) {
                playerRef.current?.unMute()
                // Refuerzo por posibles carreras con políticas de autoplay
                window.setTimeout(() => {
                  if (
                    playerRef.current?.getPlayerState() === YT.PlayerState.PLAYING &&
                    volumeRef.current > 0
                  ) {
                    playerRef.current.unMute()
                  }
                }, 150)
              }
            }
            if (event.data === YT.PlayerState.PAUSED) setIsPlaying(false)
            if (event.data === YT.PlayerState.ENDED) void advanceRef.current?.()
          },
          onError: () => {
            clearWatchdog()
            setIsPlaying(false)
            setNeedsGesture(true)
          },
        },
      })
    },
    [clearWatchdog, startWatchdog]
  )

  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // Limpia el vigilante y el reproductor al salir de la página
  useEffect(() => {
    return () => {
      if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
      // El temporizador de guardar el volumen no se cancela a propósito: si el
      // usuario cambia el volumen y cierra la página enseguida, así el
      // último ajuste llega a guardarse igual.
      playerRef.current?.destroy()
    }
  }, [])

  // Primera carga
  useEffect(() => {
    // El setState ocurre tras el await, no de forma síncrona en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCurrent()
  }, [loadCurrent])

  // Monta el reproductor solo cuando cambia el item de la cola
  useEffect(() => {
    if (!current) return
    if (loadedIdRef.current === current.queueItemId) return
    loadedIdRef.current = current.queueItemId
    void buildPlayer(current)
  }, [current, buildPlayer])

  // Mantiene la cola al día. Sondea siempre, también con la pestaña oculta: si
  // no, una pestaña minimizada dejaría de reproducir y la cola no avanzaría.
  useEffect(() => {
    const id = setInterval(() => void loadCurrent(), 5000)

    // Al volver al frente, se consulta de inmediato en lugar de esperar al
    // siguiente intervalo.
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadCurrent()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [loadCurrent])

  // Sigue la posición para mover la barra de avance. Mientras el usuario la
  // está arrastrando no se toca, para que no salte bajo su dedo.
  useEffect(() => {
    const id = setInterval(() => {
      const player = playerRef.current
      if (!player || scrubbingRef.current) return
      const total = player.getDuration()
      if (!Number.isFinite(total) || total <= 0) return
      setPosition({
        current: player.getCurrentTime(),
        total,
        buffered: player.getVideoLoadedFraction(),
      })
    }, 500)

    return () => clearInterval(id)
  }, [])

  function togglePlay() {
    const player = playerRef.current
    if (!player) return
    if (isPlaying) {
      player.pauseVideo()
      setIsPlaying(false)
    } else {
      player.playVideo()
      if (volumeRef.current > 0) {
        player.unMute()
      }
      setIsPlaying(true)
    }
  }

  /** Guarda el volumen en la base, esperando a que el usuario pare. */
  function saveVolume(value: number) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void fetch("/api/player/volume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: value }),
      }).catch(() => {
        // Si no se guarda, no merece la pena molestar al usuario: el
        // volumen de esta sesión sigue siendo el que ha elegido.
      })
    }, 800)
  }

  function changeVolume(next: number) {
    const value = Math.max(0, Math.min(100, next))
    setVolume(value)
    volumeRef.current = value
    saveVolume(value)

    const player = playerRef.current
    if (!player) return

    if (value === 0) {
      player.mute()
    } else {
      player.unMute()
      player.setVolume(value)
    }
  }

  function seekTo(seconds: number) {
    const player = playerRef.current
    if (!player) return
    const total = player.getDuration()
    if (!Number.isFinite(total)) return
    const clamped = Math.max(0, Math.min(total, seconds))
    player.seekTo(clamped, true)
    setPosition((p) => ({ ...p, current: clamped }))
  }

  function onScrubEnd(seconds: number) {
    scrubbingRef.current = false
    seekTo(seconds)
  }

  /** Convierte la posición del ratón sobre la barra en una fracción 0-1. */
  function fractionFromEvent(e: React.MouseEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando cola…
      </div>
    )
  }

  if (!current) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md border-2 border-border/60 text-center">
          <CardContent className="space-y-2 py-10">
            <p className="font-heading text-lg">No hay música en la cola</p>
            <p className="text-sm text-muted-foreground">
              Cuando un moderador añada una canción aparecerá aquí.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasDuration = position.total > 0
  const playedPercent = hasDuration ? (position.current / position.total) * 100 : 0
  const bufferedPercent = hasDuration
    ? Math.max(0, Math.min(100, position.buffered * 100))
    : 0
  const previewPercent = preview.visible ? preview.at * 100 : 0
  const isMuted = volume === 0

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-3 p-4">
      <div className="flex items-center justify-between px-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          Cambiar de modo
        </Link>
        <ThemeToggle />
      </div>

      <Card className="gap-0 overflow-hidden border-2 border-border/60 py-0">
        {/* Qué está sonando */}
        <div className="flex items-center gap-4 p-4">
          {current.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.thumbnail}
              alt=""
              className="h-14 w-14 shrink-0 rounded-md object-cover shadow-sm"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-md bg-muted" />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{current.title}</p>
            <p className="truncate text-sm text-muted-foreground">{current.channel}</p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setShowVideo((v) => !v)}
            aria-pressed={showVideo}
          >
            {showVideo ? <Headphones /> : <MonitorPlay />}
            <span className="hidden sm:inline">
              {showVideo ? "Solo audio" : "Ver vídeo"}
            </span>
          </Button>
        </div>

        {/* Vídeo. En modo audio no se oculta con display:none, que puede cortar
            la reproducción: se deja de 1x1 y transparente. */}
        <div
          ref={holderRef}
          aria-hidden={!showVideo}
          className={
            showVideo
              ? "aspect-video w-full bg-black"
              : "pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0"
          }
        />

        {needsGesture && (
          <div className="px-4">
            <Button className="w-full" size="lg" onClick={togglePlay}>
              <CirclePlay />
              Activar reproducción
            </Button>
          </div>
        )}

        {/* Barra de tiempo */}
        <div className="px-4 pt-3">
          <div
            className="group relative"
            onMouseMove={(e) =>
              setPreview({ at: fractionFromEvent(e), visible: true })
            }
            onMouseLeave={() => setPreview((p) => ({ ...p, visible: false }))}
          >
            {/* Relleno detrás de la pista: búfer y parte escuchada */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted/70 transition-all group-hover:h-1.5 group-focus-within:h-1.5">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-foreground/30 transition-[width] duration-150 ease-out"
                style={{ width: `${bufferedPercent}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${playedPercent}%` }}
              />
            </div>
            <input
              type="range"
              className="player-range relative"
              min={0}
              max={Math.max(1, Math.round(position.total))}
              step={1}
              value={Math.round(position.current)}
              disabled={!hasDuration}
              onChange={(e) =>
                setPosition((p) => ({ ...p, current: Number(e.target.value) }))
              }
              onPointerDown={() => {
                scrubbingRef.current = true
              }}
              onPointerUp={(e) => onScrubEnd(Number(e.currentTarget.value))}
              // El teclado no dispara pointerup: hay que cerrar el arrastre a
              // mano o la barra se queda congelada.
              onKeyUp={(e) => onScrubEnd(Number(e.currentTarget.value))}
              onBlur={(e) => onScrubEnd(Number(e.currentTarget.value))}
              aria-label="Progreso de la canción"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(position.total))}
              aria-valuenow={Math.round(position.current)}
              aria-valuetext={`${formatDuration(Math.round(position.current))} / ${formatDuration(
                hasDuration ? Math.round(position.total) : null
              )}`}
            />
            {preview.visible && hasDuration && (
              <span
                className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-background/95 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground shadow-lg ring-1 ring-border backdrop-blur-sm"
                style={{ left: `${previewPercent}%` }}
              >
                {formatDuration(Math.round(preview.at * position.total))}
              </span>
            )}
          </div>

          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{formatDuration(Math.round(position.current))}</span>
            <span>
              {formatDuration(hasDuration ? Math.round(position.total) : null)}
            </span>
          </div>
        </div>

        {/* Controles, a la izquierda como en YouTube, volumen a la derecha */}
        <div className="flex items-center gap-1 p-4">
          <Button
            size="icon-lg"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            className="rounded-full transition-transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? (
              <Pause className="fill-current" />
            ) : (
              <Play className="translate-x-px fill-current" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => void advance()}
            aria-label="Saltar a la siguiente"
          >
            <SkipForward className="fill-current" />
          </Button>



          <div className="flex-1" />

          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => changeVolume(isMuted ? DEFAULT_VOLUME : 0)}
            aria-label={isMuted ? "Activar sonido" : "Silenciar"}
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </Button>

          <div
            className="group relative w-24"
            onWheel={(e) => {
              e.preventDefault()
              const delta = e.deltaY > 0 ? -5 : 5
              changeVolume(volume + delta)
            }}
          >
            <VolumeBarFill percent={volume} />
            <input
              type="range"
              className="player-range"
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volumen"
              aria-orientation="horizontal"
              aria-valuetext={`${volume}%`}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {volume}%
          </span>
        </div>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          {current.requesterName
            ? `Pedido por ${current.requesterName} · ${
                current.upNext > 0
                  ? `${current.upNext} más en la cola`
                  : "última de la cola"
              }`
            : current.upNext > 0
              ? `${current.upNext} canción${current.upNext > 1 ? "es" : ""} más en la cola`
              : "No hay más canciones en la cola"}
        </p>
      </Card>
    </div>
  )
}