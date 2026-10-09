import { afterEach, describe, expect, it, vi } from "vitest"

// El resto de pruebas sustituye lib/prisma por un cliente en memoria. Aquí se
// carga el módulo de verdad para comprobar cómo construye el cliente; no llega
// a conectarse, porque Prisma no abre conexión hasta la primera consulta.
const loadRealModule = () =>
  vi.importActual<typeof import("@/lib/prisma")>("@/lib/prisma")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  delete (globalThis as { prisma?: unknown }).prisma
})

describe("lib/prisma", () => {
  it("crea un cliente con los modelos de la aplicación", async () => {
    vi.stubEnv("POSTGRES_PRISMA_URL", "postgresql://u:p@localhost:5432/db")

    const { prisma } = await loadRealModule()

    expect(prisma.user).toBeDefined()
    expect(prisma.song).toBeDefined()
    expect(prisma.queueItem).toBeDefined()
    expect(prisma.historyItem).toBeDefined()
  })

  it("fuera de producción reutiliza el mismo cliente entre recargas del módulo", async () => {
    vi.stubEnv("POSTGRES_PRISMA_URL", "postgresql://u:p@localhost:5432/db")

    const first = (await loadRealModule()).prisma
    vi.resetModules()
    const second = (await loadRealModule()).prisma

    expect(second).toBe(first)
  })

  it("en producción no guarda el cliente en el ámbito global", async () => {
    vi.stubEnv("POSTGRES_PRISMA_URL", "postgresql://u:p@localhost:5432/db")
    vi.stubEnv("NODE_ENV", "production")

    await loadRealModule()

    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined()
  })
})
