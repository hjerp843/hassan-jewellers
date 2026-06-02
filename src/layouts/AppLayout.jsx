import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Navbar />
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}