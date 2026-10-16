"use client"

import { Fragment, type ComponentProps, type ReactNode } from "react"
import { ViewTransition as ReactViewTransition } from "react"

/**
 * Envoltorio de `ViewTransition` con red de seguridad.
 *
 * Next compila contra su copia de React (`next/dist/compiled/react`), que sí
 * exporta `ViewTransition`. Fuera del build (por ejemplo, en las pruebas con
 * jsdom) se carga el `react` instalado, que no lo exporta: entonces el
 * componente se comporta como un fragmento y la página se pinta igual, sin
 * animación y sin romper nada.
 */
type ViewTransitionProps = ComponentProps<typeof ReactViewTransition>

export function ViewTransition({ children, ...props }: ViewTransitionProps) {
  if (!ReactViewTransition) return <>{children}</>
  return <ReactViewTransition {...props}>{children}</ReactViewTransition>
}

/**
 * Animación direccional para las navegaciones entre pantallas.
 *
 * `nav-forward` desliza hacia un lado y `nav-back` hacia el otro. Sin tipo
 * (botón atrás del navegador, `router.refresh()`) no se anima nada.
 */
export const NAV_TRANSITION: Pick<ViewTransitionProps, "enter" | "exit" | "default"> = {
  enter: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  exit: { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" },
  default: "none",
}

/** Envoltorio de página ya configurado con la animación direccional. */
export function PageTransition({ children }: { children: ReactNode }) {
  return <ViewTransition {...NAV_TRANSITION}>{children}</ViewTransition>
}
