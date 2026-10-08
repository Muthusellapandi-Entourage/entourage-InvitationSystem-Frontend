import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function ForgotPasswordPage() {
  useDocumentTitle('Password recovery')

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-8 text-center text-lg font-semibold">Password recovery</h1>
        <p className="mt-3 text-center text-sm text-muted">
          Password recovery is not available yet. Ask another administrator to reset your access.
        </p>
        <p className="mt-6 text-center">
          <Link to="/login" className="text-sm text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
