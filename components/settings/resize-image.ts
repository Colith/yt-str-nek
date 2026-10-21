/**
 * Recorte de la foto de perfil en el navegador.
 *
 * La imagen se recorta a un cuadrado y se reduce antes de subirla: así lo que
 * llega al servidor son unos pocos KiB en lugar de la foto original, que puede
 * pesar varios megas. El recorte es el del centro, que es lo que se espera
 * de una foto de perfil.
 */

/** Lado del cuadrado, en píxeles. */
export const AVATAR_SIZE = 256

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Convierte un fichero de imagen en el avatar cuadrado y comprimido.
 *
 * Se prefiere WebP y, si el navegador no lo sabe hacer, se cae a JPEG. Si
 * tampoco, se deja el PNG: es más grande, pero el servidor lo acepta igual.
 */
export async function resizeToAvatar(file: File): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("No se ha podido leer esa imagen")
  }

  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2

    const canvas = document.createElement("canvas")
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("No se ha podido preparar la imagen")

    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    const webp = await toBlob(canvas, "image/webp", 0.85)
    if (webp && webp.type === "image/webp") return webp

    const jpeg = await toBlob(canvas, "image/jpeg", 0.85)
    if (jpeg && jpeg.type === "image/jpeg") return jpeg

    const png = await toBlob(canvas, "image/png")
    if (png) return png

    throw new Error("No se ha podido convertir la imagen")
  } finally {
    bitmap.close()
  }
}
