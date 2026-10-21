import { Flower2 } from "lucide-react"
import { cn } from "cn"
import { SITE } from "@/lib/site"

/**
 * Logotipo de la página: el propio nombre.
 *
 * En modo normal se ve en latín y en modo otaku en japonés, en el mismo
 * sitio y con el mismo aire. El cambio lo decide el CSS según el atributo
 * `data-art` del <html>, que el Menú de Apariencia cambia al vuelo: por eso
 * aquí se pintan las dos versiones y se deja que el CSS elija.
 *
 * El tamaño lo pone quien lo usa (la cabecera, el login...), y todo lo de
 * aquí va en `em` para que la marca escale con él.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.3em] leading-none whitespace-nowrap",
        className
      )}
    >
      <Flower2 className="h-[0.78em] w-[0.78em] shrink-0 text-primary" aria-hidden />

      {/* Kaushan Script: pincel rotunda, como el rótulo de una viñeta de
          manga. Sin negrita: la fuente solo tiene un peso. */}
      <span
        className="wordmark-latin font-display text-[1em] font-normal tracking-[0.01em]"
      >
        {SITE.name}
      </span>

      {/* Yomogi: letra japonesa a mano, de rotulador. Con lang="ja" los
          lectores de pantalla lo pronuncian en japonés. */}
      <span
        lang="ja"
        className="wordmark-jp font-jp-display text-[1.15em] font-normal tracking-[0.08em]"
      >
        {SITE.nameJa}
      </span>
    </span>
  )
}
