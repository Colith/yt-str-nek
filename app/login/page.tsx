import { LoginForm } from "@/components/auth/login-form"
import { PageTransition } from "@/components/ui/view-transition"

export default function LoginPage() {
  return (
    <PageTransition>
      <div className="flex min-h-screen items-center justify-center p-4">
        <LoginForm />
      </div>
    </PageTransition>
  )
}
