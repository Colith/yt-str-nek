import { vi } from "vitest"
import type { YTPlayerOptions } from "@/types/youtube-iframe"

export const STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const

/**
 * Doble del reproductor de la IFrame API de YouTube.
 *
 * No reproduce nada: registra lo que la página le pide y deja que la prueba
 * dispare los mismos eventos que emitiría YouTube (listo, sonando, fin, error).
 */
export class FakePlayer {
  static instances: FakePlayer[] = []

  state: number = STATE.UNSTARTED
  muted = false
  volume = 100
  duration = 200
  currentTime = 0
  /** Vídeo que tiene cargado ahora mismo. */
  videoId: string

  playVideo = vi.fn()
  pauseVideo = vi.fn(() => {
    this.state = STATE.PAUSED
  })
  stopVideo = vi.fn(() => {
    this.state = STATE.CUED
  })
  loadVideoById = vi.fn((videoId: string) => {
    this.videoId = videoId
    this.state = STATE.UNSTARTED
    this.currentTime = 0
  })
  mute = vi.fn(() => {
    this.muted = true
  })
  unMute = vi.fn(() => {
    this.muted = false
  })
  setVolume = vi.fn((value: number) => {
    this.volume = value
  })
  seekTo = vi.fn((seconds: number) => {
    this.currentTime = seconds
  })
  destroy = vi.fn()

  constructor(
    public node: HTMLElement,
    public options: YTPlayerOptions
  ) {
    this.videoId = options.videoId
    FakePlayer.instances.push(this)
  }

  isMuted = () => this.muted
  getPlayerState = () => this.state
  getDuration = () => this.duration
  getCurrentTime = () => this.currentTime
  getVideoLoadedFraction = () => 0.5

  /** YouTube avisa de que el reproductor está listo. */
  ready(): void {
    this.options.events?.onReady?.({ target: this as never })
  }

  /** YouTube avisa de un cambio de estado. */
  emit(state: number): void {
    this.state = state
    this.options.events?.onStateChange?.({ data: state })
  }

  /** YouTube avisa de que el vídeo no se puede reproducir. */
  fail(code = 150): void {
    this.options.events?.onError?.({ data: code })
  }
}

/** Instala la API de mentira en window, como si el script ya hubiera cargado. */
export function installFakeYouTube(): void {
  FakePlayer.instances = []
  window.YT = { Player: FakePlayer as never, PlayerState: STATE }
}

/** El único reproductor que debería existir: se reutiliza entre canciones. */
export function thePlayer(): FakePlayer {
  if (FakePlayer.instances.length !== 1) {
    throw new Error(`Se esperaba 1 reproductor y hay ${FakePlayer.instances.length}`)
  }
  return FakePlayer.instances[0]
}
