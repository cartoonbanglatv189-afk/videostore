import { useEffect } from 'react'
import UserApp from './pages/UserApp'
import AdminPanel from './admin/AdminPanel'

export default function App() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) {
      document.title = 'Super Admin Panel'
    }
  }, [])

  if (window.location.pathname.startsWith('/admin')) {
    return <AdminPanel />
  }
  return <UserApp />
}
