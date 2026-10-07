/**
 * Tipos mínimos de la IFrame Player API de YouTube.
 * Se declaran a mano para no depender de un paquete externo.
 */

export interface YTPlayerVars {
  autoplay?: 0 | 1
  controls?: 0 | 1
  playsinline?: 0 | 1
  rel?: 0 | 1
  modestbranding?: 0 | 1
  start?: number
  origin?: string
  [key: string]: string | number | undefined
}

export interface YTEventTarget {
  mute(): void
  unMute(): void
  isMuted(): boolean
  setVolume(volume: number): void
  playVideo(): void
  pauseVideo(): void
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  /** Parte del vídeo ya descargada, de 0 a 1. Para la barra de búfer. */
  getVideoLoadedFraction(): number
  // Necesario para saber si la reproducción arranca de verdad o si el
  // navegador la ha bloqueado: la API no lanza error en ese caso.
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

export interface YTPlayerOptions {
  videoId: string
  host?: string
  width?: number | string
  height?: number | string
  playerVars?: YTPlayerVars
  events?: {
    onReady?: (event: { target: YTEventTarget }) => void
    onStateChange?: (event: { data: number }) => void
    onError?: (event: { data: number }) => void
  }
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}