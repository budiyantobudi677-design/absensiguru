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
import DashboardKepsek from './pages/kepsek/DashboardKepsek'
import DashboardOperator from './pages/operator/DashboardOperator'
import DashboardTendik from './pages/tendik/DashboardTendik'
import DashboardPengembang from './pages/developer/DashboardPengembang'
import { getDeveloperSession } from './lib/developerManager'
import { syncCloudTeacherAssignments } from './lib/assignmentManager'
import { saveActiveSession, getActiveSession, clearActiveSession } from './lib/offlineManager'
import { fetchDeletedAccountsRegistry, isAccountDeleted } from './lib/deletedAccountsManager'

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
      const cachedRole = localStorage.getItem(`panrita_role_${userSession.user.id}`) || localStorage.getItem('panrita_last_active_role')
      if (cachedRole && isMounted) {
        setRole(cachedRole)
        setLoading(false)
      }

      try {
        const [profRes, cloudAssignments, deletedReg] = await Promise.all([
          supabase.from('profiles').select('role, jabatan, full_name').eq('id', userSession.user.id).maybeSingle(),
          syncCloudTeacherAssignments(supabase),
          fetchDeletedAccountsRegistry(supabase)
        ])

        if (isAccountDeleted(userSession.user, deletedReg)) {
          console.warn('Sesi terdeteksi akun yang telah dihapus. Mengeluarkan pengguna...')
          await supabase.auth.signOut().catch(() => {})
          await clearActiveSession().catch(() => {})
          if (isMounted) {
            setSession(null)
            setRole(null)
            setLoading(false)
          }
          return
        }

        const data = profRes?.data
        const myAssignment = cloudAssignments?.[userSession.user.id]

        let userRole = data?.role || cachedRole || 'guru'
        const effectiveJabatan = myAssignment?.jabatan || data?.jabatan || localStorage.getItem(`tendik_penugasan_${userSession.user.id}`) || ''
        const effectiveTipe = myAssignment?.tipe || localStorage.getItem(`guru_tipe_${userSession.user.id}`) || ''

        // Cek apakah akun ini dikonfigurasi sebagai Tendik (baik via role, penugasan cloud, atau jabatan)
        const isTendikUser = userRole === 'tendik' || effectiveTipe === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(effectiveJabatan) || effectiveJabatan?.includes('Operator')

        if (isTendikUser) {
          const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(effectiveJabatan) || localStorage.getItem(`tendik_kategori_${userSession.user.id}`) === 'non_operator'
          userRole = isNonOp ? 'nonoperator' : 'operator'
        }
        
        // Bersihkan intended role jika ada
        localStorage.removeItem('intended_login_role')

        localStorage.setItem(`panrita_role_${userSession.user.id}`, userRole)
        saveActiveSession(userSession, userSession.user, userRole)

        if (isMounted) {
          setRole(userRole)
          setLoading(false)
        }
      } catch (err) {
        console.error('Error fetching role (mungkin luring):', err)
        if (isMounted) {
          const fallbackRole = cachedRole || 'guru'
          setRole(fallbackRole)
          saveActiveSession(userSession, userSession.user, fallbackRole)
          setLoading(false)
        }
      }
    }

    // Ambil sesi awal secara definitif
    const devSession = getDeveloperSession()
    if (devSession) {
      setSession(devSession)
      setRole(devSession.role || 'pengembang')
      setLoading(false)
    } else {
      // 1. Jika sedang luring (tanpa internet), pulihkan sesi lokal instan tanpa menunggu Supabase
      getActiveSession().then(({ session: cachedSess, user: cachedUser, role: cachedRole }) => {
        if (!isMounted) return
        if (cachedUser && (!navigator.onLine || !session)) {
          setSession(cachedSess || { user: cachedUser })
          setRole(cachedRole || 'guru')
          setLoading(false)
        }
      }).catch(() => {})

      // 2. Cek getSession resmi dari Supabase Auth
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!isMounted) return
        if (session) {
          setSession(session)
          await syncUserRole(session)
        } else {
          // Fallback offline jika getSession menghasilkan null saat tanpa jaringan
          const { session: offlineSess, user: offlineUser, role: offlineRole } = await getActiveSession()
          if (offlineUser) {
            setSession(offlineSess || { user: offlineUser })
            setRole(offlineRole || 'guru')
          }
          setLoading(false)
        }
      }).catch(async (err) => {
        console.error('Session get error (offline):', err)
        if (!isMounted) return
        const { session: offlineSess, user: offlineUser, role: offlineRole } = await getActiveSession()
        if (offlineUser) {
          setSession(offlineSess || { user: offlineUser })
          setRole(offlineRole || 'guru')
        }
        setLoading(false)
      })
    }

    const handleDevSessionUpdate = () => {
      const activeDev = getDeveloperSession()
      if (activeDev) {
        setSession(activeDev)
        setRole(activeDev.role || 'pengembang')
        setLoading(false)
      } else {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!isMounted) return
          setSession(session)
          if (session) syncUserRole(session)
          else {
            setRole(null)
            setLoading(false)
          }
        })
      }
    }

    window.addEventListener('developer_session_updated', handleDevSessionUpdate)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      // Abaikan INITIAL_SESSION agar tidak menimpa getSession yang sedang memulihkan token
      if (event === 'INITIAL_SESSION') return

      if (event === 'SIGNED_OUT') {
        const activeDev = getDeveloperSession()
        if (activeDev) {
          setSession(activeDev)
          setRole('pengembang')
          setLoading(false)
          return
        }

        // Jika offline dan bukan logout eksplisit (masih ada cache user), pertahankan sesi luring
        if (!navigator.onLine) {
          const { user: cachedUser } = await getActiveSession()
          if (cachedUser) {
            return
          }
        }

        setSession(null)
        setRole(null)
        setLoading(false)
      } else if (session) {
        if (event === 'SIGNED_IN') {
          localStorage.removeItem('panrita_developer_session')
        }
        setSession(session)
        syncUserRole(session)
      }
    })

    return () => {
      isMounted = false
      window.removeEventListener('developer_session_updated', handleDevSessionUpdate)
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

  // Listener tombol fisik / gesture Back di Android Native (APK)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let backHandle = null

    const initBackButton = async () => {
      backHandle = await CapApp.addListener('backButton', ({ canGoBack }) => {
        const path = window.location.pathname
        // Jika sedang di dashboard utama atau halaman root, keluar aplikasi tanpa logout
        if (
          path === '/' || 
          path === '/guru' || path === '/guru/' || 
          path === '/operator' || path === '/operator/' || 
          path === '/nonoperator' || path === '/nonoperator/' || 
          path === '/admin' || path === '/admin/' || 
          path === '/kepsek' || path === '/kepsek/' || 
          path === '/pengembang' || path === '/pengembang/'
        ) {
          CapApp.exitApp()
        } else if (canGoBack) {
          window.history.back()
        } else {
          CapApp.exitApp()
        }
      })
    }

    initBackButton()

    return () => {
      if (backHandle) {
        backHandle.remove()
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

  const isDevRole = role === 'pengembang' || role === 'developer'
  const isKepsekRole = role === 'kepsek'
  const isAdminRole = role === 'admin'
  const isOperatorRole = role === 'operator'
  const isNonOperatorRole = role === 'nonoperator'

  return (
    <PullToRefresh>
      <Router>
        <Routes>
          <Route 
            path="/" 
            element={
              !session 
                ? <Login /> 
                : (isDevRole 
                    ? <Navigate to="/pengembang" /> 
                    : (isKepsekRole 
                        ? <Navigate to="/kepsek" /> 
                        : (isAdminRole 
                            ? <Navigate to="/admin" /> 
                            : (isOperatorRole 
                                ? <Navigate to="/operator" /> 
                                : (isNonOperatorRole ? <Navigate to="/nonoperator" /> : <Navigate to="/guru" />)))))
            } 
          />
          <Route 
            path="/guru/*" 
            element={
              session 
                ? (isAdminRole 
                    ? <Navigate to="/admin" replace /> 
                    : (isKepsekRole 
                        ? <Navigate to="/kepsek" replace /> 
                        : (isOperatorRole 
                            ? <Navigate to="/operator" replace /> 
                            : (isNonOperatorRole ? <Navigate to="/nonoperator" replace /> : <DashboardGuru />)))) 
                : <Navigate to="/" replace />
            } 
          />
          <Route 
            path="/operator/*" 
            element={
              session 
                ? (isOperatorRole || isDevRole ? <DashboardOperator /> : <Navigate to="/" replace />) 
                : <Navigate to="/" replace />
            } 
          />
          <Route 
            path="/nonoperator/*" 
            element={
              session 
                ? (isNonOperatorRole || isDevRole ? <DashboardTendik /> : <Navigate to="/" replace />) 
                : <Navigate to="/" replace />
            } 
          />
          <Route 
            path="/admin/*" 
            element={
              session 
                ? (isAdminRole || isDevRole 
                    ? <DashboardAdmin /> 
                    : (isKepsekRole ? <Navigate to="/kepsek" replace /> : <Navigate to="/guru" replace />)) 
                : <Navigate to="/" replace />
            } 
          />
          <Route 
            path="/kepsek/*" 
            element={
              session 
                ? (isKepsekRole || isDevRole 
                    ? <DashboardKepsek /> 
                    : (isAdminRole ? <Navigate to="/admin" replace /> : <Navigate to="/guru" replace />)) 
                : <Navigate to="/" replace />
            } 
          />
          {/* Alias /kepalasekolah diarahkan langsung ke /kepsek */}
          <Route path="/kepalasekolah/*" element={<Navigate to="/kepsek" replace />} />
          <Route path="/pengembang/*" element={session && isDevRole ? <DashboardPengembang /> : <Navigate to="/" replace />} />
        </Routes>
      </Router>
    </PullToRefresh>
  )
}

export default App
