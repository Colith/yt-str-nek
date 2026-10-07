"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Link2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { YoutubeResult } from "@/types"

export function AddByUrlForm({
  onResolved,
  disabled,
}: {
  onResolved: (video: YoutubeResult) => void
  disabled: boolean
}) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/youtube/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        onResolved(data.video)
        toast.success("Vídeo cargado")
      }
    } catch {
      toast.error("Error al procesar la URL")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-primary" />
          Añadir por enlace
        </CardTitle>
        <CardDescription>Pega el link de YouTube del vídeo</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            type="url"
            required
          />
          <Button type="submit" variant="secondary" className="w-full" disabled={loading || disabled}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cargar vídeo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}