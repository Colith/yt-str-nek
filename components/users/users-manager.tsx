"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Pencil, Trash2, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Role } from "@/lib/session"

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  mod: "Mod",
  streamer: "Streamer",
}

interface UserRow {
  id: string
  username: string
  role: Role
  createdAt: string
  songsAdded: number
  isSelf: boolean
}

const ROLES: Array<{ value: Role; label: string; hint: string }> = [
  { value: "admin", label: "Administrador", hint: "Panel, reproductor y usuarios" },
  { value: "mod", label: "Moderador", hint: "Panel y reproductor" },
  { value: "streamer", label: "Streamer", hint: "Solo el reproductor" },
]

const EMPTY = { username: "", password: "", role: "mod" as Role }

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [removing, setRemoving] = useState<UserRow | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users)
    } catch {
      toast.error("No se pudo cargar la lista de usuarios")
      setUsers([])
    }
  }, [])

  useEffect(() => {
    // El setState ocurre tras el await, no de forma síncrona en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo crear el usuario")
        return
      }
      toast.success(`Usuario "${data.user.username}" creado`)
      setForm(EMPTY)
      setCreating(false)
      await load()
    } catch {
      toast.error("No se pudo crear el usuario")
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setBusy(true)
    try {
      // Si la contraseña queda vacía no se envía, para no cambiarla por error
      const body: { username?: string; password?: string; role?: Role } = {
        username: form.username,
        role: form.role,
      }
      if (form.password) body.password = form.password

      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "No se pudo guardar")
        return
      }
      toast.success("Cambios guardados")
      setEditing(null)
      setForm(EMPTY)
      await load()
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setBusy(true)
    try {
      const res = await fetch(`/api/users/${removing.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "No se pudo eliminar")
        return
      }
      toast.success(`Usuario "${removing.username}" eliminado`)
      setRemoving(null)
      await load()
    } catch {
      toast.error("No se pudo eliminar")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-heading">
            <Users className="h-5 w-5" />
            Usuarios
          </CardTitle>
          <CardDescription>
            Cualquier usuario con acceso puede entrar al panel y gestionar la cola.
            Las contraseñas no se pueden leer, solo cambiar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios.</p>
          ) : (
            <ul className="divide-y">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center gap-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {user.username}
                      {user.isSelf && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (tú)
                        </span>
                      )}
                      <span className="ml-2 rounded border border-border/60 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.songsAdded} canción{user.songsAdded === 1 ? "" : "es"} añadida
                      {user.songsAdded === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(user)
                      setForm({ username: user.username, password: "", role: user.role })
                    }}
                  >
                    <Pencil />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={user.isSelf}
                    onClick={() => setRemoving(user)}
                  >
                    <Trash2 />
                    <span className="sr-only">Eliminar {user.username}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Dialog
            open={creating}
            onOpenChange={(open) => {
              setCreating(open)
              if (!open) setForm(EMPTY)
            }}
          >
            {/* Abre el diálogo. Con DialogClose esto no abría nada: solo cierra. */}
            <Button variant="outline" className="mt-4" onClick={() => setCreating(true)}>
              <UserPlus />
              Nuevo usuario
            </Button>
            <DialogContent>
              <form onSubmit={submitCreate}>
                <DialogHeader>
                  <DialogTitle>Nuevo usuario</DialogTitle>
                  <DialogDescription>
                    Podrá entrar al panel y gestionar la cola.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-username">Usuario</Label>
                    <Input
                      id="new-username"
                      value={form.username}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-role">Rol</Label>
                    <select
                      id="new-role"
                      value={form.role}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, role: e.target.value as Role }))
                      }
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label} — {r.hint}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Contraseña</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Mínimo 8 caracteres.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>
                    Cancelar
                  </DialogClose>
                  <Button type="submit" disabled={busy}>
                    {busy && <Loader2 className="animate-spin" />}
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
            setForm(EMPTY)
          }
        }}
      >
        <DialogContent>
          {editing && (
            <form onSubmit={submitEdit}>
              <DialogHeader>
                <DialogTitle>Editar {editing.username}</DialogTitle>
                <DialogDescription>
                  Deja la contraseña vacía para no cambiarla.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Usuario</Label>
                  <Input
                    id="edit-username"
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Rol</Label>
                  <select
                    id="edit-role"
                    value={form.role}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role: e.target.value as Role }))
                    }
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} — {r.hint}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-password">Contraseña nueva</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Sin cambios"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo 8 caracteres si la cambias.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>
                  Cancelar
                </DialogClose>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              Se va a eliminar &quot;{removing?.username}&quot;. Las canciones que
              añadió se quedan en la cola, pero sin autor.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" disabled={busy} />}>
              Cancelar
            </DialogClose>
            <Button variant="destructive" onClick={() => void confirmRemove()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}