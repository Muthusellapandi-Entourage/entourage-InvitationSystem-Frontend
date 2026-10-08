import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/stores/authStore'

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  useDocumentTitle('Sign in')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 text-center text-sm text-muted">Event Management Platform</p>
        <form
          className="mt-10 grid gap-4"
          noValidate
          onSubmit={handleSubmit(async (values) => {
            setFormError(null)
            try {
              await login(values.email, values.password)
              navigate(from && from !== '/login' ? from : '/', { replace: true })
            } catch (error) {
              setFormError(error instanceof ApiError ? error.message : 'Sign-in failed. Try again.')
            }
          })}
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            error={errors.password?.message}
            trailing={
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
            {...register('password')}
          />
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
          <Button type="submit" className="mt-2 h-10 w-full" disabled={isSubmitting || status === 'unknown'}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-5 text-center">
          <Link to="/forgot-password" className="text-sm text-muted hover:text-foreground">
            Forgot password?
          </Link>
        </p>
      </div>
    </main>
  )
}
