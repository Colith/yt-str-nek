import { prisma } from "@/lib/prisma"

/**
 * Fotos de perfil.
 *
 * La imagen se guarda en la base de datos, en su propia tabla, y no en un
 * fichero: la aplicación se despliega en Vercel, donde el disco es temporal y
 * una foto subida a public/ se perdería en el siguiente despliegue.
 *
 * El recorte lo hace el navegador antes de subirla (256x256, WebP), así que
 * lo que llega aquí ya es una imagen pequeña.
 */

/** Tipos de imagen que se aceptan. */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const

export type AvatarType = (typeof AVATAR_TYPES)[number]

/** Tamaño máximo de la foto subida, ya recortada. */
export const AVATAR_MAX_BYTES = 512 * 1024

/** Bytes de una imagen, en la forma que espera Prisma. */
export type AvatarBytes = Uint8Array<ArrayBuffer>

/**
 * Deduce el tipo real de una imagen mirando sus primeros bytes.
 *
 * No se fía del `content-type` que declara el cliente: se comprueba la
 * cabecera real del fichero, que es la que va a servirse después.
 */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  if (bytes.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }

  // WebP: "RIFF" ???? "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }

  return null
}

/**
 * URL de la foto de un usuario.
 *
 * La versión (`?v=`) cambia cuando se sube una foto nueva: así el navegador
 * no se queda con la imagen de antes.
 */
export function avatarUrl(userId: string, version: Date | number | string): string {
  const v = version instanceof Date ? version.getTime() : version
  return `/api/avatars/${userId}?v=${v}`
}

export interface AvatarRecord {
  data: AvatarBytes
  type: string
  updatedAt: Date
}

/** La foto de un usuario, o null si no tiene ninguna. */
export async function getAvatar(userId: string): Promise<AvatarRecord | null> {
  return prisma.avatar.findUnique({ where: { userId } })
}

/**
 * URL de la foto de un usuario, o null si no tiene.
 *
 * Se usa en la cabecera y en el panel de usuarios.
 */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  try {
    const avatar = await prisma.avatar.findUnique({
      where: { userId },
      select: { updatedAt: true },
    })
    return avatar ? avatarUrl(userId, avatar.updatedAt) : null
  } catch (error) {
    // La foto es decorativa: si la base falla, se pintan las iniciales en
    // vez de romper la página.
    console.error("No se pudo leer la foto del usuario:", error)
    return null
  }
}

/** Guarda la foto de un usuario, sustituyendo la anterior si la había. */
export async function saveAvatar(
  userId: string,
  data: AvatarBytes,
  type: AvatarType
): Promise<AvatarRecord> {
  return prisma.avatar.upsert({
    where: { userId },
    create: { userId, data, type },
    update: { data, type },
  })
}

/** Quita la foto de un usuario. Devuelve si había alguna. */
export async function deleteAvatar(userId: string): Promise<boolean> {
  const removed = await prisma.avatar.deleteMany({ where: { userId } })
  return removed.count > 0
}
