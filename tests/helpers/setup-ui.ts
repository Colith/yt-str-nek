import "@testing-library/jest-dom/vitest"
import { createElement, type ReactNode } from "react"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"
import { resetRouter, router, searchParams } from "./navigation"

// El router de Next no existe fuera de la aplicación: se sustituye por espías
// que las pruebas pueden consultar (tests/helpers/navigation.ts).
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams.current,
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    transitionTypes,
    ...rest
  }: {
    href: string
    children: ReactNode
    transitionTypes?: string[]
  }) => {
    // `transitionTypes` solo lo entiende el Link real de Next; no debe acabar
    // como atributo del <a> de las pruebas.
    void transitionTypes
    return createElement("a", { href, ...rest }, children)
  },
}))

vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) =>
    createElement("img", { src, alt, className }),
}))

// Los avisos se comprueban por lo que se le pide a sonner, sin pintarlos.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

afterEach(() => {
  cleanup()
  resetRouter()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  window.localStorage.clear()
})
