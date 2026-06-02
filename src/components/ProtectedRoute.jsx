import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, ownerOnly = false }) {
  const { user, profile, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

if (ownerOnly && profile?.role !== 'owner') {
  return <Navigate to="/gold-intake" replace />
}

  return children
}