import { describe, expect, it } from "vitest"
import { addByUrlSchema, addToQueueSchema, reorderQueueSchema } from "@/lib/validators"

describe("addToQueueSchema", () => {
  it("acepta un vídeo con o sin solicitante y streamer", () => {
    expect(addToQueueSchema.safeParse({ youtubeId: "abc" }).success).toBe(true)
    expect(
      addToQueueSchema.safeParse({ youtubeId: "abc", requesterName: "", streamerId: "s1" })
        .success
    ).toBe(true)
  })

  it("rechaza un vídeo vacío o un solicitante de más de 50 caracteres", () => {
    expect(addToQueueSchema.safeParse({ youtubeId: "" }).success).toBe(false)
    expect(addToQueueSchema.safeParse({}).success).toBe(false)
    expect(
      addToQueueSchema.safeParse({ youtubeId: "abc", requesterName: "x".repeat(51) }).success
    ).toBe(false)
  })
})

describe("reorderQueueSchema", () => {
  it("exige al menos un elemento y posiciones enteras desde 1", () => {
    expect(reorderQueueSchema.safeParse({ items: [{ id: "a", position: 1 }] }).success).toBe(true)
    expect(reorderQueueSchema.safeParse({ items: [] }).success).toBe(false)
    expect(reorderQueueSchema.safeParse({ items: [{ id: "a", position: 0 }] }).success).toBe(false)
    expect(reorderQueueSchema.safeParse({ items: [{ id: "a", position: 1.5 }] }).success).toBe(
      false
    )
  })
})

describe("addByUrlSchema", () => {
  it("solo acepta URLs bien formadas", () => {
    expect(addByUrlSchema.safeParse({ url: "https://youtu.be/abc" }).success).toBe(true)
    expect(addByUrlSchema.safeParse({ url: "no es una url" }).success).toBe(false)
  })
})
