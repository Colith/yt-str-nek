import { ADMIN_ROLES, type Role } from "@/lib/session"

/**
 * Navegación de la aplicación.
 *
 * Aquí vive qué ve cada rol en la cabecera y a dónde se le lleva al entrar.
 * Es lógica pura, sin React, para poder probarla sin montar componentes.
 */

/** Secciones de la aplicación, que son las pestañas de la cabecera. */
export type HeaderSection = "panel" | "player" | "users"

export interface HeaderItem {
  /** Sección a la que lleva, para poder marcar la activa. */
  key: HeaderSection
  /** Texto del botón. */
  label: string
  /** Descripción larga, para el tooltip y para lectores de pantalla. */
  description: string
  href: string
  /** Icono, por nombre: el componente lo elige al pintarlo. */
  icon: "queue" | "player" | "users"
}

/** Secciones a las que puede ir cada rol. */
const VISITABLE: Record<Role, readonly string[]> = {
  admin: ["/mod", "/player", "/users", "/settings"],
  mod: ["/mod", "/player", "/settings"],
  streamer: ["/mod", "/player", "/settings"],
}

/** Etiqueta corta del rol, para la insignia del usuario. */
const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  mod: "Mod",
  streamer: "Streamer",
}

/** Un rol desconocido se trata como el más restrictivo. */
function asRole(role: string): Role {
  return role === "admin" || role === "mod" || role === "streamer" ? role : "streamer"
}

export function roleLabel(role: string): string {
  return ROLE_LABEL[asRole(role)]
}

export function isAdmin(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role)
}

/**
 * Los botones de la cabecera de cada rol.
 *
 * Solo aparecen las secciones que ese rol puede abrir: un mod no ve el
 * panel de usuarios y un streamer no ve nada del panel de administración.
 */
export function getHeaderItems(role: string): HeaderItem[] {
  const streamer = asRole(role) === "streamer"

  return [
    {
      key: "panel",
      label: streamer ? "Mi cola" : "Panel",
      description: streamer ? "Tu cola de música" : "Panel de moderación",
      href: "/mod",
      icon: "queue",
    },
    {
      key: "player",
      label: "Reproductor",
      description: "Reproductor de la cola",
      href: "/player",
      icon: "player",
    },
    ...(isAdmin(role)
      ? [
          {
            key: "users" as const,
            label: "Usuarios",
            description: "Gestión de usuarios",
            href: "/users",
            icon: "users" as const,
          },
        ]
      : []),
  ]
}

/**
 * Página a la que se entra por defecto.
 *
 * Un streamer solo tiene su reproductor; los demás trabajan en el panel.
 */
export function defaultPathForRole(role: string): string {
  return asRole(role) === "streamer" ? "/player" : "/mod"
}

/** Si un rol puede abrir esa ruta. */
export function canVisit(role: string, path: string): boolean {
  const target = path.split("?")[0].split("#")[0]
  return VISITABLE[asRole(role)].some(
    (allowed) => target === allowed || target.startsWith(`${allowed}/`)
  )
}

/**
 * A dónde va el usuario después de entrar.
 *
 * Si venía de una página concreta se vuelve a ella, siempre que su rol
 * pueda abrirla. Si no, se va a la página natural del rol.
 */
export function resolveLoginTarget(role: string, callbackUrl?: string | null): string {
  // Solo rutas internas: "//sitio.evil" es una URL absoluta, no un camino.
  if (callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    if (canVisit(role, callbackUrl)) return callbackUrl
  }

  return defaultPathForRole(role)
}
