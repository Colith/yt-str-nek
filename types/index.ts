export interface Song {
  id: string
  youtubeId: string
  title: string
  channel: string
  thumbnail: string
  durationSec: number | null
}

export interface QueueItem {
  id: string
  position: number
  requesterName: string | null
  addedById: string | null
  songId: string
  song: Song
  addedBy: { id: string; username: string } | null
}

export interface HistoryItem {
  id: string
  requesterName: string | null
  addedByName: string | null
  song: Song
  playedAt: string
}

export interface YoutubeResult {
  youtubeId: string
  title: string
  channel: string
  thumbnail: string
  durationSec: number | null
}

export const MAX_QUEUE = 20