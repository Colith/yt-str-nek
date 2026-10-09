import { vi } from "vitest"

/** Router de mentira que reciben los componentes en las pruebas de interfaz. */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}

/** Parámetros de la URL que ve useSearchParams. */
export const searchParams = { current: new URLSearchParams() }

export function setSearchParams(query: string): void {
  searchParams.current = new URLSearchParams(query)
}

export function resetRouter(): void {
  searchParams.current = new URLSearchParams()
}
