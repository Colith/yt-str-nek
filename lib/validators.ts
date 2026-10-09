import { z } from "zod"

export const addToQueueSchema = z.object({
  streamerId: z.string().optional(),
  youtubeId: z.string().min(1),
  requesterName: z.string().max(50).optional().or(z.literal("")),
})

export const reorderQueueSchema = z.object({
  streamerId: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        position: z.number().int().min(1),
      })
    )
    .min(1),
})

export const addByUrlSchema = z.object({
  url: z.string().url(),
  requesterName: z.string().max(50).optional().or(z.literal("")),
})

export const nextSongSchema = z.object({}).optional()
