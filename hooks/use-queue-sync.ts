"use client"

import { useEffect, useRef } from "react"

/**
 * Sincroniza la cola entre varios moderadores abiertos.
 * Sondea el servidor cada N segundos y refresca al volver a la pestaña.
 */
export function useQueueSync(onRefresh: () => void, intervalMs = 5000) {
  const cbRef = useRef(onRefresh)

  useEffect(() => {
    cbRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") cbRef.current()
    }

    const id = setInterval(tick, intervalMs)

    const onVisible = () => {
      if (document.visibilityState === "visible") cbRef.current()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [intervalMs])
}