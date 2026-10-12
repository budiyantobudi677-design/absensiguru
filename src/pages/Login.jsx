import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { 
  LogIn, Mail, Lock, UserPlus, KeyRound, ArrowLeft, 
  ShieldCheck, BookOpen, SlidersHorizontal, Code2, 
  Eye, EyeOff, ShieldAlert, Key, Briefcase,
  Users, ClipboardList, PenTool, CheckCircle2, Info, Smartphone
} from 'lucide-react'
import { 
  verifyDeveloperKey, 
  checkBruteForceLockout,
  getDeveloperSession,
  verifyAdminOverrideLogin
} from '../lib/developerManager'
import { syncCloudTeacherAssignments } from '../lib/assignmentManager'

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
  const [fullNameInput, setFullNameInput] = useState('')
  
  // State Verifikasi OTP Email
  const [otpCode, setOtpCode] = useState('')
  const [otpSentEmail, setOtpSentEmail] = useState('')
  const [pendingUserData, setPendingUserData] = useState(null)
  const [resendTimer, setResendTimer] = useState(0)

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
        
        // Bersihkan sesi developer atau intended role lama agar tidak menimpa akun resmi
        localStorage.removeItem('panrita_developer_session')
        localStorage.removeItem('intended_login_role')

        const [profRes, cloudAssignments] = await Promise.all([
          supabase.from('profiles').select('role, jabatan, full_name').eq('id', data.user.id).maybeSingle(),
          syncCloudTeacherAssignments(supabase)
        ])
        const profile = profRes?.data
        const myAssignment = cloudAssignments?.[data.user.id]

        let userRole = profile?.role || 'guru'
        const effectiveJabatan = myAssignment?.jabatan || profile?.jabatan || localStorage.getItem(`tendik_penugasan_${data.user.id}`) || ''
        const effectiveTipe = myAssignment?.tipe || localStorage.getItem(`guru_tipe_${data.user.id}`) || ''

        const isAdmin = userRole === 'admin'
        const isKepsek = userRole === 'kepsek'
        const isTendik = userRole === 'tendik' || effectiveTipe === 'tendik' || effectiveJabatan?.includes('Tendik') || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(effectiveJabatan) || effectiveJabatan?.includes('Operator')
        const isGuru = !isAdmin && !isKepsek && !isTendik

        // Klasifikasikan tendik ke operator atau nonoperator
        if (isTendik) {
          const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(effectiveJabatan) || localStorage.getItem(`tendik_kategori_${data.user.id}`) === 'non_operator'
          userRole = isNonOp ? 'nonoperator' : 'operator'
        }

        localStorage.setItem(`panrita_role_${data.user.id}`, userRole)

        // Arahkan ke dashboard sesuai peran akun sebenarnya
        if (isAdmin) {
          navigate('/admin')
        } else if (isKepsek) {
          navigate('/kepsek')
        } else if (isTendik) {
          if (userRole === 'operator') {
            navigate('/operator')
          } else {
            navigate('/nonoperator')
          }
        } else {
          navigate('/guru')
        }
        
      } else if (mode === 'register') {
        if (selectedRole === 'admin' || selectedRole === 'kepsek') {
          throw new Error('Pendaftaran akun Kepala Sekolah dan Administrator hanya dapat dilakukan melalui Akun Pengembang Sistem.')
        }

        const formattedJabatan = selectedRole === 'tendik' 
          ? (tendikCategory === 'operator' ? 'Operator Dapodik' : 'Tenaga Kependidikan') 
          : 'Guru Kelas'

        const signUpData = {
          email,
          password,
          options: {
            data: {
              role: selectedRole === 'tendik' ? 'tendik' : 'guru',
              full_name: fullNameInput.trim() || email.split('@')[0],
              penugasan_tipe: selectedRole === 'tendik' ? 'tendik' : 'guru_kelas',
              tendik_kategori: selectedRole === 'tendik' ? tendikCategory : null,
              jabatan: formattedJabatan
            }
          }
        }
        const { data: authData, error } = await supabase.auth.signUp(signUpData)
        if (error) throw error

        // Simpan data pending untuk verifikasi OTP
        setOtpSentEmail(email)
        setOtpCode('')
        setPendingUserData({
          userId: authData?.user?.id,
          email,
          fullName: fullNameInput.trim() || email.split('@')[0],
          role: 'guru', // profiles_role_check constraint DB
          penugasan_tipe: selectedRole === 'tendik' ? 'tendik' : 'guru_kelas',
          tendik_kategori: selectedRole === 'tendik' ? tendikCategory : null,
          jabatan: formattedJabatan
        })

        // Beralih ke layar input verifikasi OTP
        setMode('verify_otp')
        setResendTimer(60)
        setSuccess(`Kode verifikasi 6-digit telah dikirim ke email ${email}. Masukkan kode di bawah untuk mengaktifkan akun Anda.`)
        
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

  // Hitung mundur kirim ulang OTP
  useEffect(() => {
    let t = null
    if (resendTimer > 0) {
      t = setInterval(() => setResendTimer(prev => prev - 1), 1000)
    }
    return () => clearInterval(t)
  }, [resendTimer])

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const cleanOtp = otpCode.trim()
      if (!cleanOtp || cleanOtp.length < 6) {
        throw new Error('Silakan masukkan 6 digit kode verifikasi dengan benar.')
      }

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email: otpSentEmail,
        token: cleanOtp,
        type: 'signup'
      })
      if (verifyError) throw verifyError

      const userId = verifyData?.user?.id || pendingUserData?.userId
      if (userId && pendingUserData) {
        await supabase.from('profiles').upsert({
          id: userId,
          email: pendingUserData.email,
          full_name: pendingUserData.fullName,
          role: pendingUserData.role,
          jabatan: pendingUserData.jabatan
        }).catch(() => {})

        if (pendingUserData.penugasan_tipe === 'tendik') {
          localStorage.setItem(`guru_tipe_${userId}`, 'tendik')
          if (pendingUserData.tendik_kategori) {
            localStorage.setItem(`tendik_kategori_${userId}`, pendingUserData.tendik_kategori)
          }
        }
      }

      setSuccess('Verifikasi berhasil! Akun Anda telah aktif.')
      navigate('/guru')
    } catch (err) {
      setError(err.message || 'Kode verifikasi tidak valid atau telah kedaluwarsa.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendTimer > 0) return
    setError(null)
    setSuccess(null)
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: otpSentEmail
      })
      if (resendErr) throw resendErr
      setResendTimer(60)
      setSuccess(`Kode verifikasi baru telah dikirimkan ke ${otpSentEmail}`)
    } catch (err) {
      setError(err.message || 'Gagal mengirim ulang kode verifikasi.')
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      localStorage.setItem('intended_login_role', selectedRole)
      const isNative = Capacitor.isNativePlatform()
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F7FAFC' }}>
      
      {/* 1. Header Prototype GammaraApp */}
      <header className="site-header">
        <div className="brand-zone">
          <span className="brand">
            <img src="/gammara_logo.png" alt="Logo GammaraApp" className="brand-icon" />
            <div className="brand-word-text">
              <span className="gammara">Gammara</span><span className="app">App</span>
            </div>
          </span>
          <div className="brand-divider"></div>
          <div className="brand-expansion">
            Gerbang Administrasi Modul, Monitoring, Absensi, Rapor, dan Arsip
          </div>
        </div>
        <div className="site-nav">
          <div className="status-pill">Sistem Manajemen Sekolah</div>
        </div>
      </header>

      {/* 2. Main Login Layout: 2 Kolom (Desktop) / 1 Kolom (Mobile) */}
      <main className="login-layout">
        
        {/* Kolom Kiri: Hero Panel */}
        <section className="hero-panel">
          <div className="hero-label">
            <span className="dot"></span> SISTEM MANAJEMEN SEKOLAH TERPADU
          </div>
          <h1>
            Sekolah tertata,<br />
            <span>pembelajaran</span><br />
            berkualitas.
          </h1>
          <p className="hero-description">
            Seluruh kebutuhan pengelolaan sekolah dalam satu platform yang sederhana, terintegrasi, dan siap mendukung kegiatan pendidikan setiap hari.
          </p>

          <div className="hero-features">
            <div className="hero-feature">
              <Users />
              <span>Presensi guru &amp; siswa</span>
            </div>
            <div className="hero-feature">
              <BookOpen />
              <span>Modul ajar digital</span>
            </div>
            <div className="hero-feature">
              <ClipboardList />
              <span>Penilaian &amp; rapor</span>
            </div>
            <div className="hero-feature">
              <PenTool />
              <span>Jurnal mengajar</span>
            </div>
            <div className="hero-feature">
              <Mail />
              <span>Persuratan &amp; arsip</span>
            </div>
            <div className="hero-feature">
              <CheckCircle2 />
              <span>Laporan terpadu</span>
            </div>
          </div>

          <div className="hero-caption">
            <Info />
            <span>Akses sesuai peran di lingkungan sekolah</span>
          </div>
        </section>

        {/* Kolom Kanan: Role Selection & Interactive Form */}
        <section className="login-side">
          <div className="role-panel">
            
            {mode !== 'login' && (
              <button 
                type="button"
                onClick={() => { setMode('login'); setError(null); setSuccess(null); }} 
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: '#058f9b', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.4rem', 
                  marginBottom: '1rem', 
                  cursor: 'pointer', 
                  fontSize: '0.85rem', 
                  fontWeight: 700,
                  padding: 0
                }}
              >
                <ArrowLeft size={16} /> Kembali ke Pilihan Login
              </button>
            )}

            <h2>
              {mode === 'verify_otp' 
                ? 'Verifikasi Kode Email' 
                : mode === 'register' 
                ? 'Daftar Akun Baru' 
                : mode === 'forgot' 
                ? 'Lupa Password?' 
                : <>Masuk ke <span style={{ color: '#00A8B0' }}>GammaraApp</span></>}
            </h2>
            <p className="subheading">
              {mode === 'verify_otp'
                ? `Masukkan 6-digit kode verifikasi yang dikirimkan ke ${otpSentEmail}`
                : mode === 'register' 
                ? 'Lengkapi data pendaftaran akun Anda.' 
                : mode === 'forgot' 
                ? 'Masukkan email untuk menerima tautan pemulihan.' 
                : 'Sudah punya akun? Pilih tipe login di bawah.'}
            </p>

            {/* Alert Error / Success */}
            {error && (
              <div style={{ padding: '0.8rem 1rem', background: '#FEE2E2', color: '#B91C1C', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ padding: '0.8rem 1rem', background: '#D1FAE5', color: '#065F46', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #A7F3D0' }}>
                {success}
              </div>
            )}

            {/* Pilihan Role di Mode Login */}
            {mode === 'login' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="role-heading">TIPE LOGIN</div>
                <div className="role-grid-proto" role="group" aria-label="Tipe login">
                  {ROLES.map((role) => {
                    const Icon = role.icon
                    const isSelected = selectedRole === role.id
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRole(role.id)}
                        className={`role-tile-proto ${isSelected ? 'selected' : ''}`}
                        aria-pressed={isSelected}
                      >
                        <Icon />
                        <span>{role.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Pilihan Role di Mode Register (Hanya Guru & Tendik) */}
            {mode === 'register' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="role-heading">TIPE AKUN YANG DIDAFTARKAN</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  {[
                    { id: 'guru', label: 'Guru', icon: BookOpen },
                    { id: 'tendik', label: 'Tendik', icon: Briefcase }
                  ].map((role) => {
                    const Icon = role.icon
                    const isSelected = selectedRole === role.id
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setSelectedRole(role.id)}
                        className={`role-tile-proto ${isSelected ? 'selected' : ''}`}
                        style={{ padding: '0.85rem 0.5rem' }}
                      >
                        <Icon size={20} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{role.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p style={{ margin: '0.65rem 0 0 0', fontSize: '0.73rem', color: '#64748B', lineHeight: 1.4 }}>
                  ℹ️ Akun <strong>Kepala Sekolah</strong> dan <strong>Admin</strong> didaftarkan secara resmi oleh Pengembang Sistem.
                </p>
              </div>
            )}

            {mode === 'verify_otp' ? (
              /* Tampilan Verifikasi Kode OTP Email */
              <div style={{ marginTop: '1rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#E0F7FA', color: '#00838F', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '1.5rem' }}>
                    ✉️
                  </div>
                  <h3 style={{ margin: '0 0 0.35rem 0', color: '#092C50', fontSize: '1.1rem', fontWeight: 800 }}>Verifikasi Kode Email</h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                    Kode 6-digit telah dikirim ke <strong>{otpSentEmail}</strong>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#38516a', marginBottom: '0.4rem', textAlign: 'center' }}>
                      Masukkan 6 Digit Kode OTP
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Contoh: 123456"
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        border: '2px solid #00AFD0',
                        background: '#FFFFFF',
                        fontSize: '1.4rem',
                        fontWeight: 800,
                        letterSpacing: '0.4rem',
                        textAlign: 'center',
                        color: '#092C50',
                        outline: 'none'
                      }}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otpCode.length < 6}
                    style={{
                      width: '100%',
                      padding: '0.95rem 1.25rem',
                      background: 'linear-gradient(100deg, #0d446f, #0ba6b0)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      cursor: (loading || otpCode.length < 6) ? 'not-allowed' : 'pointer',
                      opacity: (loading || otpCode.length < 6) ? 0.6 : 1,
                      boxShadow: '0 10px 23px rgba(0, 125, 145, 0.17)',
                      marginBottom: '1rem'
                    }}
                  >
                    {loading ? 'Memverifikasi...' : 'Konfirmasi & Aktifkan Akun'}
                  </button>
                </form>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setOtpCode(''); setError(null); }}
                    style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontWeight: 600 }}
                  >
                    ← Ubah Email / Kembali
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendTimer > 0 || loading}
                    style={{ background: 'none', border: 'none', color: resendTimer > 0 ? '#94A3B8' : '#058F9B', cursor: resendTimer > 0 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                  >
                    {resendTimer > 0 ? `Kirim Ulang (${resendTimer}s)` : 'Kirim Ulang Kode'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Form Input Sesuai Role Terpilih */}
                <form onSubmit={handleSubmit}>
              {selectedRole === 'pengembang' ? (
                /* Role Pengembang: Master Key Akses Khusus */
                <div style={{ marginBottom: '1.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38516a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Key size={14} color="#00a8b0" /> Kode Akses Kunci Pengembang
                    </label>
                    <span style={{ fontSize: '0.72rem', background: '#e9f8fa', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#058f9b', fontWeight: 800 }}>
                      Super Admin
                    </span>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <Lock size={18} color="#829AB1" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                      type={showDevKey ? "text" : "password"} 
                      value={devKey}
                      disabled={lockoutTimer > 0}
                      onChange={(e) => setDevKey(e.target.value)}
                      placeholder="Masukkan Kode Kunci Pengembang"
                      style={{ 
                        width: '100%', 
                        padding: '0.85rem 2.85rem 0.85rem 2.75rem', 
                        borderRadius: '12px', 
                        border: lockoutTimer > 0 ? '1.5px solid #EF4444' : '1px solid #D8E4ED', 
                        background: lockoutTimer > 0 ? '#FEF2F2' : '#FFFFFF', 
                        fontSize: '0.92rem', 
                        color: '#203E59', 
                        outline: 'none', 
                        transition: 'all 0.2s',
                        letterSpacing: showDevKey ? 'normal' : '0.15em'
                      }}
                      required 
                    />
                    <button
                      type="button"
                      onClick={() => setShowDevKey(!showDevKey)}
                      style={{
                        position: 'absolute',
                        right: '0.8rem',
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

                  {lockoutTimer > 0 ? (
                    <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.8rem', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#991B1B', fontWeight: 600 }}>
                      <ShieldAlert size={16} color="#DC2626" />
                      <span>Akses dibekukan demi keamanan. Tunggu {Math.floor(lockoutTimer / 60)}m {lockoutTimer % 60}s</span>
                    </div>
                  ) : (
                    <p style={{ margin: '0.5rem 0 0 0.2rem', fontSize: '0.72rem', color: '#869aae', lineHeight: '1.4' }}>
                      🔒 Dilindungi enkripsi SHA-256 + Salt. Maksimal 3 kali percobaan salah sebelum dibekukan 15 menit.
                    </p>
                  )}
                </div>
              ) : (
                /* Role Kepala Sekolah, Guru, Tendik, Admin */
                <>
                  {mode === 'register' && (
                    <div style={{ marginBottom: '1.15rem' }}>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#38516a', marginBottom: '0.4rem' }}>
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
                          borderRadius: '12px', 
                          border: '1px solid #D8E4ED', 
                          background: '#FFFFFF', 
                          fontSize: '0.92rem', 
                          color: '#203E59', 
                          outline: 'none', 
                          transition: 'all 0.2s' 
                        }}
                        required 
                      />
                    </div>
                  )}

                  {/* Pengaturan Kategori & Penugasan Tendik */}
                  {selectedRole === 'tendik' && (
                    <div style={{ background: '#F0F9FB', border: '1px solid #BAE6ED', borderRadius: '14px', padding: '0.9rem', marginBottom: '1.15rem' }}>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#092C50', marginBottom: '0.35rem' }}>
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
                              borderRadius: '8px',
                              border: tendikCategory === 'operator' ? '2px solid #00AFD0' : '1px solid #CBD5E1',
                              background: tendikCategory === 'operator' ? '#00AFD0' : '#FFFFFF',
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
                              borderRadius: '8px',
                              border: tendikCategory === 'non_operator' ? '2px solid #00AFD0' : '1px solid #CBD5E1',
                              background: tendikCategory === 'non_operator' ? '#00AFD0' : '#FFFFFF',
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

                      <div style={{ background: '#E0F7FA', border: '1px dashed #00ACC1', borderRadius: '8px', padding: '0.65rem 0.8rem', marginTop: '0.6rem' }}>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#006064', fontWeight: 600 }}>
                          ℹ️ Tugas & Penempatan (Pustakawan, Satpam, Kebersihan, Operator Dapodik/Sekolah) dapat dipilih di halaman <strong>Profil / Penugasan</strong> setelah berhasil login.
                        </p>
                      </div>
                    </div>
                  )}



                  <div style={{ marginBottom: '1.15rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#38516a', marginBottom: '0.4rem' }}>
                      Email Instansi ({currentRoleObj.label})
                    </label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={18} color="#829AB1" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={currentRoleObj.placeholder}
                        style={{ 
                          width: '100%', 
                          padding: '0.85rem 1rem 0.85rem 2.75rem', 
                          borderRadius: '12px', 
                          border: '1px solid #D8E4ED', 
                          background: '#FFFFFF', 
                          fontSize: '0.92rem', 
                          color: '#203E59', 
                          outline: 'none', 
                          transition: 'all 0.2s' 
                        }}
                        required 
                      />
                    </div>
                  </div>
                  
                  {mode !== 'forgot' && (
                    <div style={{ marginBottom: '1.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38516a' }}>Password</label>
                        {mode === 'login' && (
                          <span 
                            onClick={() => { setMode('forgot'); setError(null); setSuccess(null); }} 
                            style={{ fontSize: '0.78rem', color: '#058F9B', cursor: 'pointer', fontWeight: 800 }}
                          >
                            Lupa Password?
                          </span>
                        )}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Lock size={18} color="#829AB1" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                          type="password" 
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={mode === 'register' ? "Minimal 6 karakter" : "••••••••"}
                          minLength={mode === 'register' ? 6 : 1}
                          style={{ 
                            width: '100%', 
                            padding: '0.85rem 1rem 0.85rem 2.75rem', 
                            borderRadius: '12px', 
                            border: '1px solid #D8E4ED', 
                            background: '#FFFFFF', 
                            fontSize: '0.92rem', 
                            color: '#203E59', 
                            outline: 'none', 
                            transition: 'all 0.2s' 
                          }}
                          required 
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* Tombol Submit Utama Bergradasi Sesuai Prototipe */}
              <button 
                type="submit" 
                disabled={loading || (selectedRole === 'pengembang' && lockoutTimer > 0)}
                style={{ 
                  width: '100%', 
                  padding: '0.95rem 1.25rem', 
                  background: 'linear-gradient(100deg, #0d446f, #0ba6b0)', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '12px', 
                  fontSize: '0.95rem', 
                  fontWeight: 800, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.5rem', 
                  cursor: (loading || (selectedRole === 'pengembang' && lockoutTimer > 0)) ? 'not-allowed' : 'pointer', 
                  opacity: (selectedRole === 'pengembang' && lockoutTimer > 0) ? 0.6 : 1,
                  boxShadow: '0 10px 23px rgba(0, 125, 145, 0.17)', 
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

            {/* Opsi Login Google (Untuk Non-Pengembang) */}
            {mode === 'login' && selectedRole !== 'pengembang' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', margin: '1.25rem 0', color: '#94A3B8' }}>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                  <span style={{ padding: '0 0.75rem', fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8' }}>atau</span>
                  <div style={{ flex: 1, height: '1px', background: '#E2E8F0' }} />
                </div>

                <div>
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
                      borderRadius: '12px',
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
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Daftar / Masuk dengan Google</span>
                  </button>
                </div>

                {/* Tautan Berpindah Mode Daftar / Masuk */}
                <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
                  Belum punya akun?{' '}
                  <span 
                    onClick={() => { setMode('register'); setError(null); setSuccess(null); }} 
                    style={{ color: '#058F9B', fontWeight: 800, cursor: 'pointer' }}
                  >
                    Daftar di sini
                  </span>
                </p>
              </>
            )}

            {mode === 'register' && (
              <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
                Sudah punya akun?{' '}
                <span 
                  onClick={() => { setMode('login'); setError(null); setSuccess(null); }} 
                  style={{ color: '#058F9B', fontWeight: 800, cursor: 'pointer' }}
                >
                  Masuk di sini
                </span>
              </p>
            )}
              </>
            )}

          </div>
        </section>

      </main>

      {/* 3. Footer Prototype GammaraApp */}
      <footer className="footer-login">
        <div className="footer-left">
          <span className="brand">
            <img src="/gammara_logo.png" alt="Logo GammaraApp" className="brand-icon" />
            <div className="brand-word-text" style={{ fontSize: '20px' }}>
              <span className="gammara">Gammara</span><span className="app">App</span>
            </div>
          </span>
          <div className="footer-text">
            Gerbang Administrasi Modul, Monitoring,<br />
            Absensi, Rapor, dan Arsip
          </div>
        </div>
        <div className="footer-right">
          <b>&copy; {new Date().getFullYear()} GammaraApp</b><br />
          Sekolah Tertata, Pembelajaran Berkualitas.
        </div>
      </footer>

    </div>
  )
}
