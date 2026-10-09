import { afterEach, describe, expect, it, vi } from "vitest"
import { formatDuration, formatTimeAgo } from "@/lib/format"

describe("formatDuration", () => {
  it("muestra minutos y segundos con dos cifras", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(5)).toBe("0:05")
    expect(formatDuration(65)).toBe("1:05")
    expect(formatDuration(600)).toBe("10:00")
  })

  it("añade las horas cuando las hay", () => {
    expect(formatDuration(3600)).toBe("1:00:00")
    expect(formatDuration(3723)).toBe("1:02:03")
  })

  it("usa un marcador cuando no se conoce la duración", () => {
    expect(formatDuration(null)).toBe("--:--")
    expect(formatDuration(Number.NaN)).toBe("--:--")
  })
})

describe("formatTimeAgo", () => {
  afterEach(() => vi.useRealTimers())

  it("expresa el tiempo transcurrido en la unidad más grande que cabe", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"))

    expect(formatTimeAgo("2026-01-10T11:59:40Z")).toBe("ahora")
    expect(formatTimeAgo("2026-01-10T11:55:00Z")).toBe("hace 5 min")
    expect(formatTimeAgo("2026-01-10T09:00:00Z")).toBe("hace 3 h")
    expect(formatTimeAgo("2026-01-08T12:00:00Z")).toBe("hace 2 d")
  })
})
