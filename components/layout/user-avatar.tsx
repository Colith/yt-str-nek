import Image from "next/image"
import { cn } from "cn"

/** Iniciales de un nombre, para el avatar mientras no haya foto. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

interface UserAvatarProps {
  username: string
  /** Foto del usuario. Cuando se implemente, sustituye a las iniciales. */
  imageUrl?: string | null
  className?: string
}

/**
 * Avatar del usuario.
 *
 * Ahora se dibuja con las iniciales; cuando cada usuario pueda subir una
 * imagen, se pasará su URL y bastará con cambiar esta pieza.
 */
export function UserAvatar({ username, imageUrl, className }: UserAvatarProps) {
  const base = cn(
    "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
    "bg-primary/15 text-xs font-semibold text-primary",
    className
  )

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={32}
        height={32}
        className={cn(base, "bg-muted object-cover")}
      />
    )
  }

  return (
    <span aria-hidden className={base}>
      {getInitials(username)}
    </span>
  )
}
