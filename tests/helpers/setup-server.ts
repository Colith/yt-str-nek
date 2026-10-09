import { beforeEach, vi } from "vitest"
import { cookieJar } from "./session"

process.env.AUTH_SECRET = "secreto-solo-para-pruebas-0123456789abcdef"
process.env.YOUTUBE_API_KEY = "clave-de-prueba"

// La aplicación importa `prisma` de lib/prisma. En las pruebas ese módulo se
// sustituye por un cliente idéntico conectado a un Postgres en memoria, uno
// nuevo por archivo de pruebas. Solo se crea si el archivo llega a usarlo.
vi.mock("@/lib/prisma", async () => {
  const { createTestDatabase, createTestPrisma } = await import("./db")
  return { prisma: createTestPrisma(await createTestDatabase()) }
})

// Fuera de Next no existe el almacén de cookies de la petición: se sustituye
// por uno en memoria que las pruebas pueden leer y rellenar.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = cookieJar.get(name)
      return entry ? { name, value: entry.value } : undefined
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieJar.set(name, { value, options })
    },
    delete: (name: string) => {
      cookieJar.delete(name)
    },
  }),
}))

beforeEach(() => {
  cookieJar.clear()
})
