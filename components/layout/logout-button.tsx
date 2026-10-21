"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Botón de cerrar sesión.
 *
 * La sesión se borra en el servidor y se vuelve al login. Se usa el replace
 * para no dejar atrás la página protegida en el historial del navegador.
 */
export function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await fetch("/api/auth/logout", { method: "POST" })
        } catch {
          // Si la petición falla, se vuelve al login igualmente: el proxy
          // volverá a pedir la sesión si la cookie sigue viva.
        } finally {
          router.replace("/login")
          router.refresh()
        }
      }}
    >
      <LogOut className="h-5 w-5" />
    </Button>
  )
}
