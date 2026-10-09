"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Se pintan los dos iconos y el CSS enseña el que toca. Elegirlo en el render
  // rompía la hidratación: el servidor no sabe el tema guardado y pintaba la
  // luna, el navegador con tema oscuro pintaba el sol, y React tiraba el árbol
  // entero para rehacerlo en el cliente.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar entre tema claro y oscuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden h-5 w-5 dark:block" />
      <Moon className="h-5 w-5 dark:hidden" />
    </Button>
  )
}
