import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import PullToRefresh from './components/PullToRefresh'

import Login from './pages/Login'
import DashboardGuru from './pages/guru/DashboardGuru'
import DashboardAdmin from './pages/admin/DashboardAdmin'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const syncUserRole = async (userSession) => {
      if (!userSession?.user?.id) {
        if (isMounted) {
          setRole(null)
          setLoading(false)
        }
        return
      }

      // Check cached role first for immediate UI response without waiting
      const cachedRole = localStorage.getItem(`panrita_role_${userSession.user.id}`)
      if (cachedRole && isMounted) {
        setRole(cachedRole)
        setLoading(false)
      }

      try {
        const { data } = await supabase.from('profiles').select('role').eq('id', userSession.user.id).maybeSingle()
        const userRole = data?.role || cachedRole || 'guru'
        
        const intended = localStorage.getItem('intended_login_role')
        if (intended) {
          localStorage.removeItem('intended_login_role')
          const isAdminType = userRole === 'admin' || userRole === 'kepsek' || userRole === 'pengembang' || userRole === 'developer'
          if (intended === 'guru' && isAdminType) {
            await supabase.auth.signOut()
            alert('Akses ditolak: Akun Anda terdaftar sebagai Admin/Kepsek, bukan Guru. Silakan pilih tipe login "Admin".')
            if (isMounted) {
              setSession(null)
              setRole(null)
              setLoading(false)
            }
            return
          }
          if (intended === 'admin' && !isAdminType) {
            await supabase.auth.signOut()
            alert('Akses ditolak: Akun Anda terdaftar sebagai Guru, bukan Admin. Silakan pilih tipe login "Guru".')
            if (isMounted) {
              setSession(null)
              setRole(null)
              setLoading(false)
            }
            return
          }
        }

        localStorage.setItem(`panrita_role_${userSession.user.id}`, userRole)
        if (isMounted) {
          setRole(userRole)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error fetching role:', err)
        if (isMounted && !cachedRole) {
          setRole('guru')
          setLoading(false)
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      setSession(session)
      if (session) {
        syncUserRole(session)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      setSession(session)
      if (session) {
        syncUserRole(session)
      } else {
        setRole(null)
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Listener Deep Link saat kembali dari Google OAuth di aplikasi native (APK)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let listenerHandle = null

    const initDeepLink = async () => {
      listenerHandle = await CapApp.addListener('appUrlOpen', async (event) => {
        try {
          await Browser.close().catch(() => {})
        } catch {
          // ignore
        }

        const url = event?.url || ''
        if (url.includes('panritaedu://') || url.includes('com.sekolah.absensi://')) {
          // Tangkap fragment token (#access_token=...&refresh_token=...)
          const hashIdx = url.indexOf('#')
          if (hashIdx !== -1) {
            const hash = url.substring(hashIdx + 1)
            const params = new URLSearchParams(hash)
            const access_token = params.get('access_token')
            const refresh_token = params.get('refresh_token')
            if (access_token && refresh_token) {
              await supabase.auth.setSession({ access_token, refresh_token })
              return
            }
          }

          // Tangkap query params (?code=...) jika menggunakan alur PKCE
          const queryIdx = url.indexOf('?')
          if (queryIdx !== -1) {
            const query = url.substring(queryIdx + 1)
            const params = new URLSearchParams(query)
            const code = params.get('code')
            if (code) {
              await supabase.auth.exchangeCodeForSession(code)
              return
            }
          }
        }
      })
    }

    initDeepLink()

    return () => {
      if (listenerHandle) {
        listenerHandle.remove()
      }
    }
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

  const isAdminRole = role === 'admin' || role === 'kepsek' || role === 'pengembang' || role === 'developer'

  return (
    <PullToRefresh>
      <Router>
        <Routes>
          <Route path="/" element={!session ? <Login /> : (isAdminRole ? <Navigate to="/admin" /> : <Navigate to="/guru" />)} />
          <Route path="/guru/*" element={session ? <DashboardGuru /> : <Navigate to="/" />} />
          <Route path="/admin/*" element={session ? <DashboardAdmin /> : <Navigate to="/" />} />
        </Routes>
      </Router>
    </PullToRefresh>
  )
}

export default App
