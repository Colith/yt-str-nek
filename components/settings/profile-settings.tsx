"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ImageUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/layout/user-avatar"
import { resizeToAvatar } from "@/components/settings/resize-image"

interface ProfileSettingsProps {
  username: string
  /** Foto actual, si la hay. */
  avatarUrl: string | null
}

/**
 * Ajustes del perfil: la foto de perfil.
 *
 * La imagen se recorta en el navegador antes de subirla y se manda a
 * /api/me/avatar. Al guardar se refresca la página para que la cabecera
 * muestre la foto nueva sin volver a cargarla a mano.
 */
export function ProfileSettings({ username, avatarUrl }: ProfileSettingsProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // La foto que se ve. Puede ser la que hay en la cuenta o la recién
  // subida, que se ve al instante aunque la página aún no se haya refrescado.
  const [preview, setPreview] = useState<string | null>(avatarUrl)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      const blob = await resizeToAvatar(file)
      const body = new FormData()
      body.append("file", new File([blob], "avatar", { type: blob.type }))

      const res = await fetch("/api/me/avatar", { method: "PUT", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la foto")

      setPreview(data.url)
      toast.success("Foto guardada")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la foto"
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo quitar la foto")

      setPreview(null)
      toast.success("Foto quitada")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo quitar la foto"
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`flex flex-col items-start gap-4 rounded-lg transition-colors sm:flex-row sm:items-center ${
        dragging ? "bg-primary/5 outline-2 outline-dashed outline-primary/50" : ""
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        // Al pasar por encima de un hijo también salta `dragleave`; solo se
        // quita el resaltado cuando el puntero sale de la zona de verdad.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void upload(file)
      }}
    >
      <label
        htmlFor="avatar-file"
        className="group relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed transition-colors hover:border-primary/60"
        title="Cambiar la foto de perfil"
      >
        <UserAvatar
          username={username}
          imageUrl={preview}
          className="size-24 text-2xl"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ImageUp className="h-6 w-6" />
        </span>
        <input
          ref={inputRef}
          id="avatar-file"
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Se vacía el campo para poder volver a elegir el mismo fichero.
            event.target.value = ""
            if (file) void upload(file)
          }}
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {preview
            ? "Tu foto se ve en la cabecera y en el panel de usuarios."
            : "Sin foto, se muestran tus iniciales. Puedes arrastrar una imagen aquí."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ImageUp />}
            {preview ? "Cambiar la foto" : "Subir una foto"}
          </Button>

          {preview && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 />
              Quitar la foto
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
