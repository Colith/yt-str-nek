"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { Menu } from "@base-ui/react/menu"
import { Check, Monitor, Moon, Palette, Sparkles, Square, Sun } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "cn"
import type { ArtStyle } from "@/lib/preferences"

const THEMES = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const

const BACKGROUNDS = [
  {
    value: "normal",
    label: "Modo normal",
    description: "Diseño limpio, sin ilustración",
    icon: Square,
  },
  {
    value: "otaku",
    label: "Modo otaku",
    description: "Con la ilustración de manga de fondo",
    icon: Sparkles,
  },
] as const

const itemClass =
  "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-muted"

/** Fondo elegido en el <html>, que es quien lo pinta de verdad. */
function currentArtStyle(): ArtStyle {
  return document.documentElement.dataset.art === "otaku" ? "otaku" : "normal"
}

/**
 * Menú de Apariencia: reúne el tema (claro/oscuro/sistema) y el fondo
 * (modo normal u otaku) en un solo desplegable.
 *
 * El fondo se guarda en la cuenta, así que se conserva entre dispositivos.
 * El atributo `data-art` del <html> lo pinta el layout; aquí se cambia al
 * vuelo para que se vea al instante, sin recargar.
 */
export function AppearanceMenu() {
  const { theme, setTheme } = useTheme()
  // El fondo se lee del <html> al abrir el menú, y no al montar: así el
  // menú marca siempre lo que se está viendo, aunque el servidor lo pintara
  // de otra manera o se hubiera cambiado en otra pestaña.
  const [artStyle, setArtStyle] = useState<ArtStyle>("normal")

  async function chooseArtStyle(next: ArtStyle) {
    const previous = artStyle
    if (next === previous) return

    setArtStyle(next)
    document.documentElement.dataset.art = next

    try {
      const res = await fetch("/api/me/style", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artStyle: next }),
      })
      if (!res.ok) throw new Error("no se pudo guardar")
    } catch {
      // Si falla, se deja el fondo como estaba y se avisa.
      setArtStyle(previous)
      document.documentElement.dataset.art = previous
      toast.error("No se pudo guardar el fondo")
    }
  }

  return (
    <Menu.Root
      onOpenChange={(open) => {
        if (open) setArtStyle(currentArtStyle())
      }}
    >
      <Menu.Trigger
        render={
          <Button variant="ghost" size="icon" aria-label="Apariencia">
            <Palette className="h-5 w-5" />
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end" className="z-50">
          <Menu.Popup className="min-w-60 rounded-lg border border-border/60 bg-popover p-1.5 text-popover-foreground shadow-md outline-none">
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Tema
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={theme ?? "system"}
                onValueChange={(value) => setTheme(String(value))}
              >
                {THEMES.map((item) => (
                  <Menu.RadioItem key={item.value} value={item.value} className={itemClass}>
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    <Menu.RadioItemIndicator>
                      <Check className="h-4 w-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>

            <Menu.Separator className="my-1.5 h-px bg-border" />

            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Fondo
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={artStyle}
                onValueChange={(value) => chooseArtStyle(value as ArtStyle)}
              >
                {BACKGROUNDS.map((item) => (
                  <Menu.RadioItem key={item.value} value={item.value} className={cn(itemClass, "items-start")}>
                    <item.icon className="mt-0.5 h-4 w-4" />
                    <span className="flex flex-1 flex-col">
                      <span>{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.description}</span>
                    </span>
                    <Menu.RadioItemIndicator>
                      <Check className="h-4 w-4 text-primary" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
