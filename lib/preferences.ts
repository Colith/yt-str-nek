import { prisma } from "@/lib/prisma"

/**
 * Fondos disponibles en el "Menú de Apariencia".
 *
 * - "normal": el diseño sin la ilustración de fondo.
 * - "otaku": el diseño con la ilustración de manga detrás del contenido.
 */
export const ART_STYLES = ["normal", "otaku"] as const

export type ArtStyle = (typeof ART_STYLES)[number]

export const DEFAULT_ART_STYLE: ArtStyle = "normal"

/** Convierte un valor cualquiera en un estilo válido, o null si no lo es. */
export function parseArtStyle(value: unknown): ArtStyle | null {
  return typeof value === "string" && (ART_STYLES as readonly string[]).includes(value)
    ? (value as ArtStyle)
    : null
}

/**
 * Estilo de fondo guardado del usuario.
 *
 * Si la base de datos falla, se pinta el diseño base en vez de romper la
 * página: el fondo es decorativo y no debería impedir usar la aplicación.
 */
export async function getArtStyle(userId: string): Promise<ArtStyle> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { artStyle: true },
    })
    return parseArtStyle(user?.artStyle) ?? DEFAULT_ART_STYLE
  } catch (error) {
    console.error("No se pudo leer el estilo de fondo:", error)
    return DEFAULT_ART_STYLE
  }
}
