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

  if (loading || (session && role === null)) {
    return <div className="flex items-center justify-center w-full" style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ padding: '2rem', background: 'white', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', textAlign: 'center' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem auto' }}></div>
        <p style={{ color: '#475569', fontWeight: '500', margin: 0 }}>Memuat Sistem...</p>
      </div>
      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
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
