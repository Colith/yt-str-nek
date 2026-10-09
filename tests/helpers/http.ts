const ORIGIN = "http://localhost:3000"

/** Petición con cuerpo JSON, como las que envía el front. */
export function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function getRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`)
}

/** Parámetros de ruta dinámica, con la forma que les da Next (una promesa). */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de respuesta variados
export async function readJson<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T
}
