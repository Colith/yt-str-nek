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
import { StreamerSelect } from "@/components/streamers/streamer-select"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { formatDuration } from "@/lib/format"
import type { PlayerSong } from "@/app/api/player/current/route"
import type { Streamer } from "@/types"
import type { YTNamespace, YTPlayer } from "@/types/youtube-iframe"

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
    script.onerror = () => {
      // Se olvida el intento para que el siguiente pueda volver a probar
      apiPromise = null
      script.remove()
      reject(new Error("No se pudo cargar la API de YouTube"))
    }
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

/** Margen para que el vídeo arranque antes de dar el autoplay por bloqueado. */
const START_TIMEOUT_MS = 4000
/** Si está descargando se espera más: una red lenta no es un bloqueo. */
const BUFFERING_TIMEOUT_MS = 20000
/** Cada cuánto se consulta la cola mientras suena algo, y mientras está vacía. */
const POLL_PLAYING_MS = 5000
const POLL_EMPTY_MS = 2500

export function Player({
  streamer,
  streamers,
}: {
  /** Dueño de la cola que suena. */
  streamer: Streamer
  /** Otras colas a las que se puede saltar. Vacío si solo puede ver la suya. */
  streamers: Streamer[]
}) {
  const router = useRouter()
  const streamerId = streamer.id

  const [current, setCurrent] = useState<PlayerSong | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [needsGesture, setNeedsGesture] = useState(false)
  // Si el visitante ya ha interactuado con la página. Hasta entonces el
  // navegador puede negarse a reproducir con sonido.
  const [activated, setActivated] = useState(true)
  const [showVideo, setShowVideo] = useState(false)
  const [position, setPosition] = useState({ current: 0, total: 0, buffered: 0 })
  // Fracción bajo el ratón en la barra de tiempo, para la vista previa
  const [preview, setPreview] = useState<{ at: number; visible: boolean }>({
    at: 0,
    visible: false,
  })

  const holderRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const ytRef = useRef<YTNamespace | null>(null)
  // El reproductor se crea una sola vez y se reutiliza para todas las
  // canciones: estos dos indican en qué punto de esa creación está.
  const creatingRef = useRef(false)
  const readyRef = useRef(false)
  // Canción que debería estar sonando según la cola
  const wantedRef = useRef<PlayerSong | null>(null)
  // Identidad por item de cola: dos entradas con el mismo vídeo son distintas
  const loadedIdRef = useRef<string | null>(null)
  const loadedAtRef = useRef(0)
  const volumeRef = useRef(DEFAULT_VOLUME)
  const advancingRef = useRef(false)
  // Pausa pedida por el usuario: no se confunde con un autoplay bloqueado
  const userPausedRef = useRef(false)
  const watchdogRef = useRef<number | null>(null)
  const scrubbingRef = useRef(false)
  const loadedVolumeRef = useRef(false)
  // Evita repetir el mismo toast cada pocos segundos si el servidor sigue caído
  const loadErrorShownRef = useRef(false)
  const apiErrorShownRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  const loadCurrent = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/player/current?streamerId=${encodeURIComponent(streamerId)}`
      )

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
      // sondeo volvería a imponer el valor viejo mientras el usuario está
      // moviendo el deslizador.
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
  }, [router, streamerId])

  /** Da por terminada una canción y carga la que quede primera en la cola. */
  const advance = useCallback(
    async (finishedId: string | null = loadedIdRef.current) => {
      if (!finishedId || advancingRef.current) return
      advancingRef.current = true

      try {
        const res = await fetch("/api/player/next", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueItemId: finishedId, streamerId }),
        })

        // Un 409 significa que la canción ya no está en la cola: la avanzó
        // otro reproductor abierto o la quitó un mod. En los dos casos toca
        // cargar lo que haya ahora. Con cualquier otro error no se toca nada:
        // el sondeo lo vuelve a intentar mientras el vídeo siga terminado.
        if (res.ok || res.status === 409) await loadCurrent()
      } catch {
        toast.error("No se pudo avanzar la cola")
      } finally {
        advancingRef.current = false
      }
    },
    [loadCurrent, streamerId]
  )

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  /**
   * La IFrame API no lanza error cuando el navegador bloquea el autoplay: se
   * limita a no cambiar de estado. Por eso no basta con pedir la reproducción,
   * hay que comprobar que la canción arranca de verdad. Si no lo hace, se
   * enseña el botón para activarla con un clic.
   */
  const startWatchdog = useCallback(
    (queueItemId: string) => {
      clearWatchdog()
      // Se mide con el reloj y no contando ticks: en una pestaña en segundo
      // plano el navegador espacia los temporizadores.
      const startedAt = Date.now()

      watchdogRef.current = window.setInterval(() => {
        const player = playerRef.current
        const YT = ytRef.current
        // Si ya se ha cargado otra canción, este vigilante se descarta
        if (!player || !YT || loadedIdRef.current !== queueItemId) {
          clearWatchdog()
          return
        }

        const state = player.getPlayerState()
        if (state === YT.PlayerState.PLAYING) {
          clearWatchdog()
          return
        }

        const limit =
          state === YT.PlayerState.BUFFERING ? BUFFERING_TIMEOUT_MS : START_TIMEOUT_MS
        if (Date.now() - startedAt < limit) return

        clearWatchdog()
        if (userPausedRef.current) return
        setIsPlaying(false)
        setNeedsGesture(true)
      }, 250)
    },
    [clearWatchdog]
  )

  /** Aplica al reproductor el volumen elegido, con sonido salvo que esté a 0. */
  const applyVolume = useCallback((player: YTPlayer) => {
    if (volumeRef.current === 0) {
      player.mute()
    } else {
      player.unMute()
      player.setVolume(volumeRef.current)
    }
  }, [])

  /** Pone a sonar una canción en el reproductor ya creado. */
  const loadIntoPlayer = useCallback(
    (player: YTPlayer, song: PlayerSong, alreadyCued: boolean) => {
      loadedIdRef.current = song.queueItemId
      loadedAtRef.current = Date.now()
      userPausedRef.current = false

      // Se arranca con sonido, no silenciado: quitar el silencio después sin
      // un clic hace que Chrome pause el vídeo, y la cola se quedaba parada.
      applyVolume(player)
      if (alreadyCued) {
        player.playVideo()
      } else {
        player.loadVideoById(song.youtubeId, 0)
      }
      startWatchdog(song.queueItemId)
    },
    [applyVolume, startWatchdog]
  )

  // Los eventos del reproductor viven tanto como él, así que llaman siempre a
  // la última versión de estas funciones a través de una ref.
  const handlersRef = useRef({ advance, loadIntoPlayer, clearWatchdog })
  useEffect(() => {
    handlersRef.current = { advance, loadIntoPlayer, clearWatchdog }
  }, [advance, loadIntoPlayer, clearWatchdog])

  /** Crea el reproductor. Solo ocurre una vez: luego se le cambian los vídeos. */
  const createPlayer = useCallback(async (first: PlayerSong) => {
    if (creatingRef.current) return
    creatingRef.current = true

    let YT: YTNamespace
    try {
      YT = await loadYouTubeApi()
    } catch {
      creatingRef.current = false
      // Se reintenta en cada sondeo: el aviso solo se enseña una vez
      if (!apiErrorShownRef.current) {
        apiErrorShownRef.current = true
        toast.error("No se pudo cargar el reproductor de YouTube")
      }
      return
    }
    apiErrorShownRef.current = false

    // Si la página se cerró mientras cargaba la API, ya no hay dónde montarlo
    const holder = holderRef.current
    if (!holder) {
      creatingRef.current = false
      return
    }

    ytRef.current = YT
    holder.innerHTML = ""
    const node = document.createElement("div")
    holder.appendChild(node)

    playerRef.current = new YT.Player(node, {
      videoId: first.youtubeId,
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
        onReady: () => {
          readyRef.current = true
          const player = playerRef.current
          if (!player) return

          // Mientras se creaba, la cola ha podido cambiar o vaciarse
          const wanted = wantedRef.current
          if (!wanted) {
            player.stopVideo()
            return
          }
          handlersRef.current.loadIntoPlayer(
            player,
            wanted,
            wanted.youtubeId === first.youtubeId
          )
        },
        onStateChange: (event: { data: number }) => {
          if (event.data === YT.PlayerState.PLAYING) {
            handlersRef.current.clearWatchdog()
            setIsPlaying(true)
            setNeedsGesture(false)
            setActivated(true)
          }

          if (event.data === YT.PlayerState.PAUSED) {
            setIsPlaying(false)
            // Una pausa que nadie ha pedido justo al arrancar es el navegador
            // bloqueando el autoplay.
            if (!userPausedRef.current && watchdogRef.current !== null) {
              handlersRef.current.clearWatchdog()
              setNeedsGesture(true)
            }
          }

          if (event.data === YT.PlayerState.ENDED) {
            // YouTube a veces repite el aviso de fin: si llega pegado a la
            // carga de la canción nueva, es el de la anterior y se ignora.
            if (Date.now() - loadedAtRef.current < 1500) return
            setIsPlaying(false)
            void handlersRef.current.advance()
          }
        },
        onError: () => {
          // Vídeo borrado, privado o que no permite verse fuera de YouTube.
          // Se salta: si no, la cola se quedaría parada hasta que alguien
          // viniera a pulsar el botón.
          handlersRef.current.clearWatchdog()
          setIsPlaying(false)
          const failed = wantedRef.current
          if (failed && failed.queueItemId === loadedIdRef.current) {
            toast.error(`"${failed.title}" no se puede reproducir. Se pasa a la siguiente.`)
          }
          void handlersRef.current.advance()
        },
      },
    })
  }, [])

  // Limpia el vigilante y el reproductor al salir de la página
  useEffect(() => {
    return () => {
      if (watchdogRef.current !== null) window.clearInterval(watchdogRef.current)
      watchdogRef.current = null
      // El temporizador de guardar el volumen no se cancela a propósito: si el
      // usuario cambia el volumen y cierra la página enseguida, así el
      // último ajuste llega a guardarse igual.
      playerRef.current?.destroy()
      playerRef.current = null
      creatingRef.current = false
      readyRef.current = false
      loadedIdRef.current = null
    }
  }, [])

  // Primera carga
  useEffect(() => {
    // El setState ocurre tras el await, no de forma síncrona en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCurrent()
  }, [loadCurrent])

  // Lleva al reproductor lo que diga la cola: suena siempre la primera. Al
  // cambiar de canción no se recrea el iframe, solo se le cambia el vídeo: el
  // permiso de autoplay que ya tiene se conserva y la siguiente arranca sola.
  useEffect(() => {
    wantedRef.current = current

    if (!current) {
      // Cola vacía: se para lo que sonara y se sigue sondeando.
      if (loadedIdRef.current !== null) {
        loadedIdRef.current = null
        clearWatchdog()
        if (readyRef.current) playerRef.current?.stopVideo()
        setIsPlaying(false)
        setNeedsGesture(false)
        setPosition({ current: 0, total: 0, buffered: 0 })
      }
      return
    }

    if (loadedIdRef.current === current.queueItemId) return

    setIsPlaying(false)
    setNeedsGesture(false)
    setPosition({ current: 0, total: current.durationSec ?? 0, buffered: 0 })

    const player = playerRef.current
    if (player && readyRef.current) {
      loadIntoPlayer(player, current, false)
    } else {
      // Todavía no hay reproductor (o se está creando): al estar listo carga
      // lo que haya en wantedRef.
      void createPlayer(current)
    }
  }, [current, clearWatchdog, createPlayer, loadIntoPlayer])

  // Mantiene la cola al día. Sondea siempre, también con la pestaña oculta: si
  // no, una pestaña minimizada dejaría de reproducir y la cola no avanzaría.
  // Con la cola vacía se pregunta más a menudo, para que la música empiece
  // cuanto antes cuando un mod añada algo.
  const isEmpty = current === null
  useEffect(() => {
    const id = setInterval(
      () => {
        // Si el vídeo terminó pero el avance falló (un corte de red, por
        // ejemplo), se reintenta aquí en vez de dejar la cola parada.
        const player = playerRef.current
        const YT = ytRef.current
        if (
          player &&
          YT &&
          readyRef.current &&
          loadedIdRef.current !== null &&
          Date.now() - loadedAtRef.current >= 1500 &&
          player.getPlayerState() === YT.PlayerState.ENDED
        ) {
          void advance()
          return
        }
        void loadCurrent()
      },
      isEmpty ? POLL_EMPTY_MS : POLL_PLAYING_MS
    )

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
  }, [loadCurrent, advance, isEmpty])

  // Sabe si el visitante ya ha tocado la página. Sirve para avisarle, con la
  // cola vacía, de que hace falta un clic para que la música pueda empezar
  // sola cuando llegue la primera canción.
  useEffect(() => {
    const userActivation = (
      navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    ).userActivation
    // Navegadores sin esta API: no se puede saber, así que no se molesta.
    if (!userActivation || userActivation.hasBeenActive) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivated(false)
    const onGesture = () => setActivated(true)
    window.addEventListener("pointerdown", onGesture, { once: true })
    window.addEventListener("keydown", onGesture, { once: true })

    return () => {
      window.removeEventListener("pointerdown", onGesture)
      window.removeEventListener("keydown", onGesture)
    }
  }, [])

  // Sigue la posición para mover la barra de avance. Mientras el usuario la
  // está arrastrando no se toca, para que no salte bajo su dedo.
  useEffect(() => {
    const id = setInterval(() => {
      const player = playerRef.current
      if (!player || !readyRef.current || scrubbingRef.current) return
      if (loadedIdRef.current === null) return
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

  /** Arranca la reproducción desde un clic, que es lo que el navegador exige. */
  function play() {
    const player = playerRef.current
    if (!player || !readyRef.current) return
    userPausedRef.current = false
    applyVolume(player)
    player.playVideo()
    setIsPlaying(true)
    setNeedsGesture(false)
    if (loadedIdRef.current) startWatchdog(loadedIdRef.current)
  }

  function togglePlay() {
    const player = playerRef.current
    if (!player || !readyRef.current) return
    if (isPlaying) {
      userPausedRef.current = true
      clearWatchdog()
      player.pauseVideo()
      setIsPlaying(false)
    } else {
      play()
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
    if (!player || !readyRef.current) return
    applyVolume(player)
  }

  function seekTo(seconds: number) {
    const player = playerRef.current
    if (!player || !readyRef.current) return
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

  const hasDuration = position.total > 0
  const playedPercent = hasDuration ? (position.current / position.total) * 100 : 0
  const bufferedPercent = hasDuration
    ? Math.max(0, Math.min(100, position.buffered * 100))
    : 0
  const previewPercent = preview.visible ? preview.at * 100 : 0
  const isMuted = volume === 0
  const videoVisible = showVideo && current !== null

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-3 p-4">
      <div className="flex items-center justify-between gap-3 px-2">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Cambiar de modo</span>
        </Link>
        {streamers.length > 1 ? (
          <StreamerSelect
            streamers={streamers}
            value={streamer.id}
            onChange={(id) => router.push(`/player?streamer=${encodeURIComponent(id)}`)}
          />
        ) : (
          <span className="truncate text-sm text-muted-foreground">
            Cola de <span className="font-medium text-foreground">{streamer.username}</span>
          </span>
        )}
        <ThemeToggle />
      </div>

      <Card className="gap-0 overflow-hidden border-2 border-border/60 py-0">
        {loading ? (
          <CardContent className="py-10 text-center text-muted-foreground">
            Cargando cola…
          </CardContent>
        ) : !current ? (
          <CardContent className="space-y-2 py-10 text-center">
            <p className="font-heading text-lg">No hay música en la cola</p>
            <p className="text-sm text-muted-foreground">
              Deja esta página abierta: en cuanto un moderador añada una canción
              empezará a sonar sola.
            </p>
            {!activated && (
              <div className="pt-3">
                <Button variant="secondary" onClick={() => setActivated(true)}>
                  <CirclePlay />
                  Activar reproducción automática
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  El navegador no deja reproducir con sonido hasta que haces un
                  clic en la página. Con uno basta.
                </p>
              </div>
            )}
          </CardContent>
        ) : (
          /* Qué está sonando */
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
        )}

        {/* Vídeo. Está siempre montado, también con la cola vacía, porque el
            reproductor se reutiliza de una canción a otra. En modo audio no se
            oculta con display:none, que puede cortar la reproducción: se deja
            de 1x1 y transparente. */}
        <div
          ref={holderRef}
          aria-hidden={!videoVisible}
          className={
            videoVisible
              ? "aspect-video w-full bg-black"
              : "pointer-events-none fixed bottom-0 left-0 h-px w-px overflow-hidden opacity-0"
          }
        />

        {current && (
          <>
            {needsGesture && (
              <div className="space-y-2 px-4">
                <Button className="w-full" size="lg" onClick={play}>
                  <CirclePlay />
                  Activar audio
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  El navegador ha bloqueado el inicio automático. Pulsa una vez y
                  el resto de la cola sonará sola.
                </p>
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
                  ? `${current.upNext} ${current.upNext > 1 ? "canciones" : "canción"} más en la cola`
                  : "No hay más canciones en la cola"}
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
