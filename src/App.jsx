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
import { checkAppUpdateStatus, CURRENT_APP_VERSION, CURRENT_APP_VERSION_CODE } from './lib/appUpdateManager'

function App() {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [appUpdateInfo, setAppUpdateInfo] = useState({ isOutdated: false, isForced: false, config: null })
  const [dismissUpdateBanner, setDismissUpdateBanner] = useState(false)

  // Periksa pembaruan aplikasi & kunci versi kedaluwarsa
  useEffect(() => {
    let active = true
    const checkUpdate = async () => {
      try {
        const info = await checkAppUpdateStatus(supabase)
        if (active && info) {
          setAppUpdateInfo(info)
        }
      } catch (err) {
        console.warn('Update check warning:', err)
      }
    }
    checkUpdate()
    return () => { active = false }
  }, [])

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

  // Auto-bounce ke aplikasi APK jika dibuka di browser mobile dari callback OAuth Google
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const isMobileAndroid = /android/i.test(navigator.userAgent || '')
    const hasAuthTokens = window.location.hash.includes('access_token=') || window.location.search.includes('code=')
    if (isMobileAndroid && hasAuthTokens) {
      try {
        const appCallbackUrl = `gammaraapp://auth-callback${window.location.search}${window.location.hash}`
        // Alihkan otomatis ke aplikasi native
        window.location.href = appCallbackUrl
      } catch (e) {}
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
        if (url.includes('gammaraapp://') || url.includes('panritaedu://') || url.includes('com.sekolah.absensi://') || url.includes('gammara.vercel.app')) {
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

  // Kunci Total Layar Jika Aplikasi Kedaluwarsa (Force Update)
  if (appUpdateInfo.isOutdated && appUpdateInfo.isForced) {
    const downloadUrl = appUpdateInfo.config?.download_url || "https://github.com/budiyantobudi677-design/absensiguru/raw/main/GammaraApp.apk"
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          maxWidth: '400px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{
            width: '76px',
            height: '76px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
            boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.5)'
          }}>
            <span style={{ fontSize: '2.4rem' }}>🔒</span>
          </div>

          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '20px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid #EF4444',
            color: '#FCA5A5',
            fontSize: '0.74rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '0.75rem'
          }}>
            Versi Dinonaktifkan
          </span>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'white' }}>
            Aplikasi Perlu Diperbarui
          </h2>

          <p style={{ fontSize: '0.86rem', color: '#94A3B8', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
            Versi aplikasi Anda (<strong style={{ color: '#F8FAFC' }}>v{CURRENT_APP_VERSION}</strong>) sudah kedaluwarsa. Demi keamanan, akurasi data jam presensi, dan fitur terbaru, versi ini telah dinonaktifkan.
          </p>

          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            textAlign: 'left',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.72rem', color: '#818CF8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Catatan Pembaruan:
            </div>
            <div style={{ fontSize: '0.8rem', color: '#E2E8F0', marginTop: '4px', lineHeight: 1.4 }}>
              {appUpdateInfo.config?.release_notes || 'Pembaruan stabilitas presensi, perbaikan jam kepulangan, dan alarm pengingat otomatis.'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '6px' }}>
              Versi Tersedia: <strong style={{ color: '#38BDF8' }}>v{appUpdateInfo.config?.latest_version || CURRENT_APP_VERSION}</strong>
            </div>
          </div>

          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={async (e) => {
              if (Capacitor.isNativePlatform()) {
                e.preventDefault()
                try {
                  await Browser.open({ url: downloadUrl })
                } catch {
                  window.open(downloadUrl, '_system')
                }
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
              color: 'white',
              padding: '0.85rem 1.25rem',
              borderRadius: '14px',
              fontWeight: 800,
              fontSize: '0.92rem',
              textDecoration: 'none',
              boxShadow: '0 8px 20px rgba(79, 70, 229, 0.4)',
              cursor: 'pointer'
            }}
          >
            <span>🚀 Unduh Pembaruan Sekarang</span>
          </a>
        </div>
      </div>
    )
  }

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
      {/* Banner Pemberitahuan Pembaruan Minor (Opsional) */}
      {appUpdateInfo.isOutdated && !appUpdateInfo.isForced && !dismissUpdateBanner && (
        <div style={{
          background: 'linear-gradient(90deg, #4F46E5 0%, #6366F1 100%)',
          color: 'white',
          padding: '0.65rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.8rem',
          position: 'sticky',
          top: 0,
          zIndex: 99999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🚀</span>
            <span><strong>Pembaruan Tersedia (v{appUpdateInfo.config?.latest_version})</strong>: Silakan perbarui aplikasi untuk fitur terbaru.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a
              href={appUpdateInfo.config?.download_url || "https://github.com/budiyantobudi677-design/absensiguru/raw/main/GammaraApp.apk"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async (e) => {
                if (Capacitor.isNativePlatform()) {
                  e.preventDefault()
                  try {
                    await Browser.open({ url: appUpdateInfo.config?.download_url || "https://github.com/budiyantobudi677-design/absensiguru/raw/main/GammaraApp.apk" })
                  } catch {
                    window.open(appUpdateInfo.config?.download_url || "https://github.com/budiyantobudi677-design/absensiguru/raw/main/GammaraApp.apk", '_system')
                  }
                }
              }}
              style={{
                background: 'white',
                color: '#4338CA',
                padding: '4px 10px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.74rem',
                textDecoration: 'none'
              }}
            >
              Unduh
            </a>
            <button
              type="button"
              onClick={() => setDismissUpdateBanner(true)}
              style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
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
          {/* Halaman Khusus Manajemen Shift Guru (/shift) */}
          <Route 
            path="/shift/*" 
            element={
              session 
                ? (isAdminRole || isDevRole || isKepsekRole 
                    ? <DashboardAdmin /> 
                    : <Navigate to="/guru" replace />) 
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
