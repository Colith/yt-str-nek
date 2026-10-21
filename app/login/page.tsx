import { LoginForm } from "@/components/auth/login-form"
import { PageTransition } from "@/components/ui/view-transition"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // El proxy guarda de dónde venía el visitante. Se lo pasa al formulario
  // para que, al entrar, vuelva a esa página si su rol puede abrirla.
  const raw = (await searchParams).callbackUrl
  const callbackUrl = typeof raw === "string" ? raw : undefined

  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </PageTransition>
  )
}
