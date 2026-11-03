import { LoginForm } from "@/components/auth/login-form"
import { PageTransition } from "@/components/ui/view-transition"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // El proxy guarda de dónde venía el visitante. Se lo pasa al formulario
  // para que, al entrar, vuelva a esa página si su rol puede abrirla.
  const params = await searchParams
  const raw = params.callbackUrl
  const callbackUrl = typeof raw === "string" ? raw : undefined

  // El proxy añade `motivo` cuando rechaza el token. Se lo decimos al usuario
  // en claro, para que no parezca que la sesión se ha cerrado sola.
  const motivo = typeof params.motivo === "string" ? params.motivo : undefined
  const notice =
    motivo === "caducada"
      ? "Tu sesión ha caducado. Vuelve a entrar."
      : motivo === "invalida"
        ? "Tu sesión ya no es válida. Vuelve a entrar."
        : undefined

  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LoginForm callbackUrl={callbackUrl} notice={notice} />
      </div>
    </PageTransition>
  )
}
