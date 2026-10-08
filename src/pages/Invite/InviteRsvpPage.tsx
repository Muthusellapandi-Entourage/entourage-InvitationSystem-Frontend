import { Navigate, useParams, useSearchParams } from 'react-router-dom'

export function InviteRsvpPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const status = params.get('status')
  if (status !== 'accept' && status !== 'decline') {
    return <Navigate to={`/invite/${slug}`} replace />
  }

  return <Navigate to={`/invite/${slug}/confirm?response=${status}`} replace />
}
