import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { 
  LogIn, Mail, Lock, UserPlus, KeyRound, ArrowLeft, 
  ShieldCheck, BookOpen, SlidersHorizontal, Code2, 
  X, Check, Eye, EyeOff, ShieldAlert, Key, Briefcase
} from 'lucide-react'
import { 
  verifyDeveloperKey, 
  checkBruteForceLockout,
  getDeveloperSession,
  verifyAdminOverrideLogin
} from '../lib/developerManager'

const ROLES = [
  { id: 'kepsek', label: 'Kepala Sekolah', icon: ShieldCheck, placeholder: 'kepsek@sekolah.edu' },
  { id: 'guru', label: 'Guru', icon: BookOpen, placeholder: 'guru@sekolah.edu / NIP' },
  { id: 'tendik', label: 'Tendik', icon: Briefcase, placeholder: 'tendik@sekolah.edu / NIP' },
  { id: 'admin', label: 'Admin', icon: SlidersHorizontal, placeholder: 'admin@sekolah.edu' },
  { id: 'pengembang', label: 'Pengembang', icon: Code2, placeholder: 'Masukkan Kode Unik Akses Pengembang' },
]

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [selectedRole, setSelectedRole] = useState('guru')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
  // State Khusus Registrasi Tendik
  const [tendikCategory, setTendikCategory] = useState('operator') // 'operator' | 'non_operator'
  const [tendikPenugasan, setTendikPenugasan] = useState('Operator Dapodik') // 'Operator Dapodik' | 'Pustakawan' | 'Bujang' | 'Satpam'
  const [fullNameInput, setFullNameInput] = useState('')
  
  // Developer Key States
  const [devKey, setDevKey] = useState('')
  const [showDevKey, setShowDevKey] = useState(false)
  const [lockoutTimer, setLockoutTimer] = useState(0)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  const [namaSekolah, setNamaSekolah] = useState('Sistem Kehadiran')
  const navigate = useNavigate()

  // Cek lockout status secara periodik jika role pengembang dipilih
  useEffect(() => {
    if (selectedRole === 'pengembang') {
      const { isLocked, remainingSeconds } = checkBruteForceLockout()
      if (isLocked) {
        setLockoutTimer(remainingSeconds)
      } else {
        setLockoutTimer(0)
      }
    }
  }, [selectedRole])

  // Timer countdown untuk lockout jika sedang terkunci
  useEffect(() => {
    let interval = null
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [lockoutTimer])

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      if (data && data.nama_sekolah) {
        setNamaSekolah(data.nama_sekolah)
      }
    }
    fetchSettings()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // Khusus Role Pengembang: Menggunakan Kode Unik Akses Pengembang (Master Key)
    if (selectedRole === 'pengembang') {
      try {
        if (!devKey.trim()) {
          throw new Error('Silakan masukkan Kode Akses Pengembang.')
        }

        const res = await verifyDeveloperKey(devKey, supabase)
        if (!res.success) {
          // Periksa apakah menyebabkan lockout
          const lockout = checkBruteForceLockout()
          if (lockout.isLocked) {
            setLockoutTimer(lockout.remainingSeconds)
          }
          throw new Error(res.error || 'Kode Akses Pengembang tidak valid.')
        }

        // Berhasil login pengembang -> Arahkan langsung ke Console Pengembang
        navigate('/pengembang')
        return
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      if (mode === 'login') {
        // Cek jika login menggunakan Kredensial Admin Kustom yang diatur oleh Pengembang
        if (selectedRole === 'admin') {
          const overrideCheck = await verifyAdminOverrideLogin(email, password, supabase)
          if (overrideCheck.isOverride) {
            if (!overrideCheck.success) {
              throw new Error(overrideCheck.error || 'Password Admin salah.')
            }
            // Buat sesi admin override
            const adminSessionData = {
              role: 'admin',
              user: {
                id: 'admin-master-uid',
                email: overrideCheck.email,
                role: 'admin',
                full_name: 'Administrator Sekolah'
              },
              expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 jam
            }
            localStorage.setItem('panrita_developer_session', JSON.stringify(adminSessionData))
            localStorage.setItem('panrita_role_admin-master-uid', 'admin')
            window.dispatchEvent(new Event('developer_session_updated'))
            navigate('/admin')
            return
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        
        const { data: profile } = await supabase.from('profiles').select('role, jabatan, penugasan_tipe').eq('id', data.user.id).single()
        const userRole = profile?.role || 'guru'
        localStorage.setItem(`panrita_role_${data.user.id}`, userRole)

        // Validasi ketat kecocokan role yang dipilih dengan role di database
        const isGuru = (userRole === 'guru' || userRole === 'guru_kelas' || userRole === 'guru_mapel') && !profile?.jabatan?.includes('Tendik') && profile?.penugasan_tipe !== 'tendik'
        const isAdmin = userRole === 'admin'
        const isKepsek = userRole === 'kepsek'
        const isTendik = userRole === 'tendik' || profile?.penugasan_tipe === 'tendik' || profile?.jabatan?.includes('Tendik') || ['Operator Dapodik', 'Pustakawan', 'Bujang', 'Satpam'].includes(profile?.jabatan)

        if (selectedRole === 'tendik' && !isTendik) {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda bukan akun Tenaga Kependidikan (Tendik). Silakan pilih tipe login yang sesuai.')
        }

        if (selectedRole === 'guru' && !isGuru) {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda bukan akun Guru. Silakan pilih tipe login yang sesuai.')
        }

        if (selectedRole === 'admin' && !isAdmin) {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda bukan Administrator. Silakan pilih tipe login yang sesuai.')
        }

        if (selectedRole === 'kepsek' && !isKepsek) {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda bukan Kepala Sekolah. Silakan pilih tipe login yang sesuai.')
        }

        if (isAdmin || isKepsek) {
          navigate('/admin')
        } else {
          navigate('/guru')
        }
        
      } else if (mode === 'register') {
        const signUpData = {
          email,
          password,
          options: {
            data: {
              role: selectedRole === 'tendik' ? 'tendik' : (selectedRole === 'admin' ? 'admin' : (selectedRole === 'kepsek' ? 'kepsek' : 'guru')),
              full_name: fullNameInput.trim() || email.split('@')[0],
              penugasan_tipe: selectedRole === 'tendik' ? 'tendik' : (selectedRole === 'guru' ? 'guru_kelas' : selectedRole),
              tendik_kategori: selectedRole === 'tendik' ? tendikCategory : null,
              jabatan: selectedRole === 'tendik' ? tendikPenugasan : (selectedRole === 'kepsek' ? 'Kepala Sekolah' : 'Guru Kelas')
            }
          }
        }
        const { data: authData, error } = await supabase.auth.signUp(signUpData)
        if (error) throw error

        if (authData?.user?.id) {
          // Sinkronisasi profil langsung
          const formattedJabatan = selectedRole === 'tendik' ? tendikPenugasan : (selectedRole === 'kepsek' ? 'Kepala Sekolah' : 'Guru Kelas')
          const assignedRole = selectedRole === 'tendik' ? 'guru' : (selectedRole === 'admin' ? 'admin' : (selectedRole === 'kepsek' ? 'kepsek' : 'guru'))
          
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            email,
            full_name: fullNameInput.trim() || email.split('@')[0],
            role: assignedRole,
            jabatan: formattedJabatan
          }).catch(() => {})

          if (selectedRole === 'tendik') {
            localStorage.setItem(`guru_tipe_${authData.user.id}`, 'tendik')
            localStorage.setItem(`tendik_kategori_${authData.user.id}`, tendikCategory)
            localStorage.setItem(`tendik_penugasan_${authData.user.id}`, tendikPenugasan)
          }
        }

        setSuccess('Pendaftaran berhasil! Akun Anda telah dibuat. Silakan masuk.')
        setMode('login')
        setPassword('')
        
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setSuccess('Tautan reset password telah dikirim ke email Anda!')
        setMode('login')
        setPassword('')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      localStorage.setItem('intended_login_role', selectedRole)
      const isNative = Capacitor.isNativePlatform()
      // Di aplikasi APK, gunakan custom scheme deep link agar otomatis kembali ke APK
      const redirectTo = isNative ? 'panritaedu://auth-callback' : window.location.origin

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: isNative,
        },
      })
      if (error) throw error

      if (isNative && data?.url) {
        await Browser.open({ url: data.url, windowName: '_self' })
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const currentRoleObj = ROLES.find(r => r.id === selectedRole) || ROLES[1]

  return (
    <div 
      style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(180deg, #071C35 0%, #0B2545 35%, #05162A 100%)', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        padding: '2rem 1.25rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Subtle Glow Background Elements */}
      <div 
        style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '550px',
          height: '550px',
          background: 'radial-gradient(circle, rgba(0, 180, 216, 0.18) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 1 }}>
        
        {/* Header Logo & Brand GammaraApp */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem', width: '100%' }}>
          <div className="gammara-logo on-dark" style={{ fontSize: '2.6rem', marginBottom: '0.25rem' }}>
            <span className="gammara">Gammara</span><span className="app">App</span>
          </div>
          <div className="logo-description on-dark" style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.4px', lineHeight: 1.45 }}>
            Sistem Manajemen Sekolah Terpadu
          </div>
          <div className="logo-tagline on-dark" style={{ fontSize: '13px', marginTop: '3px' }}>
            Sekolah Tertata, Pembelajaran Berkualitas.
          </div>
        </div>

        {/* Card Putih Utama */}
        <div 
          style={{ 
            background: '#FFFFFF', 
            borderRadius: '32px', 
            padding: '2rem 1.75rem', 
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.8)'
          }}
        >
          {mode !== 'login' && (
            <button 
              onClick={() => { setMode('login'); setError(null); setSuccess(null); }} 
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: '#64748B', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem', 
                marginBottom: '1rem', 
                cursor: 'pointer', 
                fontSize: '0.9rem', 
                fontWeight: 600,
                padding: 0
              }}
            >
              <ArrowLeft size={16} /> Kembali ke Pilihan Login
            </button>
          )}

          {/* Heading Form */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#092156', margin: '0 0 0.35rem 0', letterSpacing: '-0.3px' }}>
              {mode === 'register' ? 'Daftar Akun Baru' : mode === 'forgot' ? 'Lupa Password?' : 'Masuk ke GammaraApp'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#596783', margin: 0, lineHeight: '1.4' }}>
              {mode === 'register' 
                ? 'Lengkapi email dan kata sandi untuk mendaftar akun pendidik.' 
                : mode === 'forgot' 
                ? 'Masukkan email instansi untuk menerima tautan pemulihan.' 
                : 'Sudah punya akun? Pilih tipe login di bawah.'}
            </p>
          </div>

          {/* Alert Error / Success */}
          {error && (
            <div style={{ padding: '0.8rem', background: '#FEE2E2', color: '#B91C1C', borderRadius: '14px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '0.8rem', background: '#D1FAE5', color: '#065F46', borderRadius: '14px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', border: '1px solid #A7F3D0' }}>
              {success}
            </div>
          )}

          {/* Selector Tipe Login (Kepala Sekolah, Guru, Admin, Vendor) */}
          {mode === 'login' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.65rem' }}>
                TIPE LOGIN
              </span>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                {ROLES.map((role) => {
                  const Icon = role.icon
                  const isSelected = selectedRole === role.id
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRole(role.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.85rem 0.5rem',
                        borderRadius: '18px',
                        border: isSelected ? '2px solid #00B4D8' : '1.5px solid #E2E8F0',
                        background: isSelected ? 'rgba(0, 180, 216, 0.08)' : '#FAFCFF',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isSelected ? '0 4px 14px rgba(0, 180, 216, 0.2)' : 'none',
                        position: 'relative'
                      }}
                    >
                      <div style={{ 
                        color: isSelected ? '#0096C7' : '#64748B', 
                        marginBottom: '0.35rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon size={24} strokeWidth={isSelected ? 2.3 : 1.8} />
                      </div>
                      <span style={{ 
                        fontSize: '0.82rem', 
                        fontWeight: isSelected ? 800 : 600, 
                        color: isSelected ? '#0B2545' : '#475569',
                        textAlign: 'center'
                      }}>
                        {role.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Form Login / Register / Forgot */}
          <form onSubmit={handleSubmit}>
            {selectedRole === 'pengembang' ? (
              /* Tampilan Khusus Pengembang: Cukup Masukkan Kode Unik Pengembang */
              <div style={{ marginBottom: '1.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', paddingLeft: '0.2rem', paddingRight: '0.2rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334E68', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Key size={14} color="#0096C7" /> Kode Akses Kunci Pengembang
                  </label>
                  <span style={{ fontSize: '0.72rem', background: '#F1F5F9', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#64748B', fontWeight: 700 }}>
                    Super Admin
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <Lock size={18} color="#829AB1" style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input 
                    type={showDevKey ? "text" : "password"} 
                    value={devKey}
                    disabled={lockoutTimer > 0}
                    onChange={(e) => setDevKey(e.target.value)}
                    placeholder="Masukkan Kode Kunci Pengembang"
                    style={{ 
                      width: '100%', 
                      padding: '0.85rem 2.85rem 0.85rem 2.85rem', 
                      borderRadius: '16px', 
                      border: lockoutTimer > 0 ? '1.5px solid #EF4444' : '1.5px solid #D9E2EC', 
                      background: lockoutTimer > 0 ? '#FEF2F2' : '#F8FAFC', 
                      fontSize: '0.92rem', 
                      color: '#102A43', 
                      outline: 'none', 
                      transition: 'all 0.2s',
                      letterSpacing: showDevKey ? 'normal' : '0.15em'
                    }}
                    onFocus={(e) => { 
                      if (lockoutTimer === 0) {
                        e.target.style.borderColor = '#00B4D8'
                        e.target.style.background = '#FFFFFF'
                        e.target.style.boxShadow = '0 0 0 4px rgba(0, 180, 216, 0.12)'
                      }
                    }}
                    onBlur={(e) => { 
                      if (lockoutTimer === 0) {
                        e.target.style.borderColor = '#D9E2EC'
                        e.target.style.background = '#F8FAFC'
                        e.target.style.boxShadow = 'none'
                      }
                    }}
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowDevKey(!showDevKey)}
                    style={{
                      position: 'absolute',
                      right: '0.9rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748B',
                      padding: '0.2rem',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {showDevKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Indikator Brute Force Lockout */}
                {lockoutTimer > 0 ? (
                  <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.8rem', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#991B1B', fontWeight: 600 }}>
                    <ShieldAlert size={16} color="#DC2626" />
                    <span>Akses dibekukan demi keamanan. Tunggu {Math.floor(lockoutTimer / 60)}m {lockoutTimer % 60}s</span>
                  </div>
                ) : (
                  <p style={{ margin: '0.45rem 0 0 0.2rem', fontSize: '0.72rem', color: '#64748B', lineHeight: '1.3' }}>
                    🔒 Dilindungi enkripsi SHA-256 + Salt. Maksimal 3 kali percobaan salah sebelum dibekukan 15 menit.
                  </p>
                )}
              </div>
            ) : (
              /* Tampilan Standar: Email & Password untuk Guru, Admin, Kepala Sekolah */
              <>
                {mode === 'register' && (
                  <div style={{ marginBottom: '1.15rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334E68', marginBottom: '0.4rem', marginLeft: '0.2rem' }}>
                      Nama Lengkap
                    </label>
                    <input 
                      type="text" 
                      value={fullNameInput}
                      onChange={(e) => setFullNameInput(e.target.value)}
                      placeholder="Nama Lengkap & Gelar"
                      style={{ 
                        width: '100%', 
                        padding: '0.85rem 1rem', 
                        borderRadius: '16px', 
                        border: '1.5px solid #D9E2EC', 
                        background: '#F8FAFC', 
                        fontSize: '0.92rem', 
                        color: '#102A43', 
                        outline: 'none', 
                        transition: 'all 0.2s' 
                      }}
                      required 
                    />
                  </div>
                )}

                {/* Khusus Registrasi Tendik: Pilihan Kategori & Penugasan */}
                {selectedRole === 'tendik' && (
                  <div style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: '16px', padding: '0.9rem', marginBottom: '1.15rem' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#0369A1', marginBottom: '0.35rem' }}>
                        Kategori Tendik
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setTendikCategory('operator')
                            setTendikPenugasan('Operator Dapodik')
                          }}
                          style={{
                            padding: '0.55rem 0.6rem',
                            borderRadius: '10px',
                            border: tendikCategory === 'operator' ? '2px solid #0284C7' : '1px solid #CBD5E1',
                            background: tendikCategory === 'operator' ? '#0284C7' : '#FFFFFF',
                            color: tendikCategory === 'operator' ? '#FFFFFF' : '#334155',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          ⚙️ Operator
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTendikCategory('non_operator')
                            setTendikPenugasan('Pustakawan')
                          }}
                          style={{
                            padding: '0.55rem 0.6rem',
                            borderRadius: '10px',
                            border: tendikCategory === 'non_operator' ? '2px solid #0284C7' : '1px solid #CBD5E1',
                            background: tendikCategory === 'non_operator' ? '#0284C7' : '#FFFFFF',
                            color: tendikCategory === 'non_operator' ? '#FFFFFF' : '#334155',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          👤 Non Operator
                        </button>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#0369A1', marginBottom: '0.35rem' }}>
                        Tugas & Jabatan Tendik
                      </label>
                      <select
                        value={tendikPenugasan}
                        onChange={(e) => setTendikPenugasan(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '10px',
                          border: '1.5px solid #7DD3FC',
                          background: '#FFFFFF',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: '#0F172A',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {tendikCategory === 'operator' ? (
                          <>
                            <option value="Operator Dapodik">💻 Operator Dapodik</option>
                            <option value="Operator Sekolah">🖥️ Operator Sekolah</option>
                          </>
                        ) : (
                          <>
                            <option value="Pustakawan">📚 Pustakawan</option>
                            <option value="Bujang">🧹 Bujang (Kebersihan / Pelaksana)</option>
                            <option value="Satpam">🛡️ Satpam (Keamanan)</option>
                          </>
                        )}
                      </select>
                      <small style={{ display: 'block', marginTop: '4px', fontSize: '0.72rem', color: '#0284C7' }}>
                        {tendikCategory === 'operator' 
                          ? 'Akses: Presensi, Master KBM (tambah/hapus siswa & kelas), Riwayat & Profil.' 
                          : 'Akses: Presensi, Tambah/Hapus Siswa & Kelas, Riwayat & Profil (Tanpa KBM).'}
                      </small>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: '1.15rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334E68', marginBottom: '0.4rem', marginLeft: '0.2rem' }}>
                    Email Instansi ({currentRoleObj.label})
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} color="#829AB1" style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={currentRoleObj.placeholder}
                      style={{ 
                        width: '100%', 
                        padding: '0.85rem 1rem 0.85rem 2.85rem', 
                        borderRadius: '16px', 
                        border: '1.5px solid #D9E2EC', 
                        background: '#F8FAFC', 
                        fontSize: '0.92rem', 
                        color: '#102A43', 
                        outline: 'none', 
                        transition: 'all 0.2s' 
                      }}
                      onFocus={(e) => { 
                        e.target.style.borderColor = '#00B4D8'
                        e.target.style.background = '#FFFFFF'
                        e.target.style.boxShadow = '0 0 0 4px rgba(0, 180, 216, 0.12)'
                      }}
                      onBlur={(e) => { 
                        e.target.style.borderColor = '#D9E2EC'
                        e.target.style.background = '#F8FAFC'
                        e.target.style.boxShadow = 'none'
                      }}
                      required 
                    />
                  </div>
                </div>
                
                {mode !== 'forgot' && (
                  <div style={{ marginBottom: '1.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', paddingLeft: '0.2rem', paddingRight: '0.2rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334E68' }}>Password</label>
                      {mode === 'login' && (
                        <span 
                          onClick={() => { setMode('forgot'); setError(null); setSuccess(null); }} 
                          style={{ fontSize: '0.78rem', color: '#0096C7', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Lupa Password?
                        </span>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Lock size={18} color="#829AB1" style={{ position: 'absolute', left: '1.1rem', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'register' ? "Minimal 6 karakter" : "••••••••"}
                        minLength={mode === 'register' ? 6 : 1}
                        style={{ 
                          width: '100%', 
                          padding: '0.85rem 1rem 0.85rem 2.85rem', 
                          borderRadius: '16px', 
                          border: '1.5px solid #D9E2EC', 
                          background: '#F8FAFC', 
                          fontSize: '0.92rem', 
                          color: '#102A43', 
                          outline: 'none', 
                          transition: 'all 0.2s' 
                        }}
                        onFocus={(e) => { 
                          e.target.style.borderColor = '#00B4D8'
                          e.target.style.background = '#FFFFFF'
                          e.target.style.boxShadow = '0 0 0 4px rgba(0, 180, 216, 0.12)'
                        }}
                        onBlur={(e) => { 
                          e.target.style.borderColor = '#D9E2EC'
                          e.target.style.background = '#F8FAFC'
                          e.target.style.boxShadow = 'none'
                        }}
                        required 
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            
            {/* Tombol Submit Utama */}
            <button 
              type="submit" 
              disabled={loading || (selectedRole === 'pengembang' && lockoutTimer > 0)}
              style={{ 
                width: '100%', 
                padding: '0.95rem', 
                background: selectedRole === 'pengembang'
                  ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0284C7 100%)'
                  : 'linear-gradient(135deg, #0B2545 0%, #0077B6 60%, #00B4D8 100%)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '16px', 
                fontSize: '0.95rem', 
                fontWeight: 700, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '0.5rem', 
                cursor: (loading || (selectedRole === 'pengembang' && lockoutTimer > 0)) ? 'not-allowed' : 'pointer', 
                opacity: (selectedRole === 'pengembang' && lockoutTimer > 0) ? 0.6 : 1,
                boxShadow: '0 8px 20px -4px rgba(0, 119, 182, 0.45)', 
                transition: 'all 0.2s'
              }}
            >
              {mode === 'login' ? <LogIn size={18} /> : mode === 'register' ? <UserPlus size={18} /> : <KeyRound size={18} />}
              {loading 
                ? 'Memproses...' 
                : selectedRole === 'pengembang' 
                ? (lockoutTimer > 0 ? `Dibekukan (${Math.ceil(lockoutTimer / 60)}m)` : 'Buka Console Pengembang')
                : mode === 'login' 
                ? `Masuk sebagai ${currentRoleObj.label}` 
                : mode === 'register' 
                ? 'Daftar Sekarang' 
                : 'Kirim Link Reset'}
            </button>
          </form>

          {/* Opsi Login Google & QR Scanner (Disembunyikan jika role pengembang) */}
          {mode === 'login' && selectedRole !== 'pengembang' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '1.25rem 0', color: '#94A3B8' }}>
                <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                <span style={{ padding: '0 0.75rem', fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8' }}>atau</span>
                <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
              </div>

              <div>
                {/* Tombol Google OAuth */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    padding: '0.85rem 1rem',
                    background: '#FFFFFF',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '16px',
                    color: '#0B2545',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00B4D8'; e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#FFFFFF' }}
                >
                  {/* Google SVG Icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Daftar / Masuk dengan Google</span>
                </button>
              </div>

              {/* Tautan Daftar Baru */}
              <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: '#64748B', fontWeight: 500, margin: '1.25rem 0 0 0' }}>
                Belum punya akun?{' '}
                <span 
                  onClick={() => { setMode('register'); setError(null); setSuccess(null); }} 
                  style={{ color: '#0096C7', fontWeight: 800, cursor: 'pointer' }}
                >
                  Daftar di sini
                </span>
              </p>
            </>
          )}
        </div>

        {/* Footer Tagline & Copyright */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <div className="gammara-logo on-dark" style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>
            <span className="gammara">Gammara</span><span className="app">App</span>
          </div>
          <p className="logo-description on-dark" style={{ fontSize: '0.78rem', margin: '0 0 2px 0' }}>
            Sistem Manajemen Sekolah Terpadu
          </p>
          <p className="logo-tagline on-dark" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
            Sekolah Tertata, Pembelajaran Berkualitas.
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#94A3B8' }}>
            &copy; {new Date().getFullYear()} GammaraApp. All Rights Reserved.
          </p>
        </div>

      </div>
    </div>
  )
}
