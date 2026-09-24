import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

import Login from './pages/Login'
import DashboardGuru from './pages/guru/DashboardGuru'
import DashboardAdmin from './pages/admin/DashboardAdmin'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({data}) => {
          setRole(data?.role || 'guru')
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        supabase.from('profiles').select('role').eq('id', session.user.id).single().then(({data}) => {
          setRole(data?.role || 'guru')
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center w-full" style={{ minHeight: '100vh' }}>Loading...</div>
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={!session ? <Login /> : (role === 'admin' ? <Navigate to="/admin" /> : <Navigate to="/guru" />)} />
        <Route path="/guru/*" element={session ? <DashboardGuru /> : <Navigate to="/" />} />
        <Route path="/admin/*" element={session ? <DashboardAdmin /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  )
}

export default App
