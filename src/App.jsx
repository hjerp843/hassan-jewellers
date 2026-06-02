import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import GoldIntake from './pages/GoldIntake'
import PurityTest from './pages/PurityTest'
import MeltingBatch from './pages/MeltingBatch'
import Outcomes from './pages/Outcomes'
import Inventory from './pages/Inventory'
import Repair from './pages/Repair'
import GoldRates from './pages/GoldRates'
function RoleRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (profile?.role === 'owner') return <Navigate to="/dashboard" replace />
  return <Navigate to="/gold-intake" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<RoleRedirect />} />
            <Route path="dashboard" element={
              <ProtectedRoute ownerOnly={true}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="customers" element={<Customers />} />
            <Route path="gold-intake" element={<GoldIntake />} />
<Route path="repair" element={<Repair />} />
<Route path="purity-test" element={<PurityTest />} />
            <Route path="melting-batch" element={
              <ProtectedRoute ownerOnly={true}>
                <MeltingBatch />
              </ProtectedRoute>
            } />
            <Route path="outcomes" element={
              <ProtectedRoute ownerOnly={true}>
                <Outcomes />
              </ProtectedRoute>
            } />
            <Route path="inventory" element={
              <ProtectedRoute ownerOnly={true}>
                <Inventory />
              </ProtectedRoute>
            } />
            <Route path="gold-rates" element={
              <ProtectedRoute ownerOnly={true}>
                <GoldRates />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}