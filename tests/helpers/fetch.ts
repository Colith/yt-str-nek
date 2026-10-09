import { vi } from "vitest"

export interface ApiCall {
  method: string
  path: string
  query: URLSearchParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de petición variados
  body: any
}

type Reply = { status?: number; body?: unknown; text?: string } | Response

/**
 * Servidor de mentira para las pruebas de interfaz.
 *
 * Recibe una función que responde a cada llamada y devuelve la lista de
 * llamadas hechas, para comprobar qué pidió el componente y con qué datos.
 */
export function mockApi(handler: (call: ApiCall) => Reply | Promise<Reply>) {
  const calls: ApiCall[] = []

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost:3000")
    const call: ApiCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)

    const reply = await handler(call)
    if (reply instanceof Response) return reply
    if (reply.text !== undefined) return new Response(reply.text, { status: reply.status ?? 200 })
    return Response.json(reply.body ?? {}, { status: reply.status ?? 200 })
  })

  vi.stubGlobal("fetch", fetchMock)

  return {
    calls,
    /** Llamadas hechas a una ruta con un método dado. */
    to: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  }
}
