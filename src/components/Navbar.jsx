import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'

  const staffLinks = [
  { to: '/customers', label: 'Customers' },
  { to: '/gold-intake', label: 'Gold Intake' },
  { to: '/repair', label: 'Repair' },
  { to: '/purity-test', label: 'Purity Test' },
]

  const ownerLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/gold-rates', label: 'Gold Rates' },
  ]

  const ownerOperationalLinks = [
    { to: '/melting-batch', label: 'Melting' },
    { to: '/inventory', label: 'Inventory' },
    { to: '/outcomes', label: 'Outcomes' },
  ]

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const navClass = ({ isActive }) =>
    `block px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive ? 'bg-yellow-50 text-yellow-700' : 'text-gray-600 hover:bg-gray-50'
    }`

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      <div className="px-5 py-4 border-b border-gray-100">
        <h1 className="text-base font-bold text-yellow-600">Hassan Jewellers</h1>
        <p className="text-xs text-gray-400 mt-0.5">{profile?.full_name}</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {isOwner && ownerLinks.map(link => (
          <NavLink key={link.to} to={link.to} className={navClass}>{link.label}</NavLink>
        ))}

        {isOwner && <div className="border-t border-gray-100 my-2" />}

        {staffLinks.map(link => (
          <NavLink key={link.to} to={link.to} className={navClass}>{link.label}</NavLink>
        ))}

        {isOwner && (
          <>
            <div className="border-t border-gray-100 my-2" />
            {ownerOperationalLinks.map(link => (
              <NavLink key={link.to} to={link.to} className={navClass}>{link.label}</NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-2 px-3 capitalize">{profile?.role}</p>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}