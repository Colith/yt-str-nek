/**
 * Fondo con la ilustración de manga (monocroma).
 *
 * La imagen (`/art/manga-art.png`) solo tiene el dibujo, sin fondos. Se usa como
 * máscara CSS a pantalla completa, así la capa hereda el color del tema
 * (`--foreground`): trazo oscuro en tema claro y claro en oscuro, sin invertir
 * ninguna imagen.
 *
 * La imagen se genera desde las fotos con `scripts/build-art.py`.
 */
export function MangaArtwork() {
  return (
    <div
      aria-hidden="true"
      className="manga-artwork pointer-events-none fixed inset-0 z-0"
    />
  )
}
