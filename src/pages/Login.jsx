import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { 
  LogIn, Mail, Lock, UserPlus, KeyRound, ArrowLeft, 
  ShieldCheck, BookOpen, SlidersHorizontal, Code2, 
  X, Check
} from 'lucide-react'

const ROLES = [
  { id: 'kepsek', label: 'Kepala Sekolah', icon: ShieldCheck, placeholder: 'kepsek@sekolah.edu' },
  { id: 'guru', label: 'Guru', icon: BookOpen, placeholder: 'guru@sekolah.edu / NIP' },
  { id: 'admin', label: 'Admin', icon: SlidersHorizontal, placeholder: 'admin@sekolah.edu' },
  { id: 'pengembang', label: 'Pengembang', icon: Code2, placeholder: 'developer@panrita.edu' },
]

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [selectedRole, setSelectedRole] = useState('guru')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  const [namaSekolah, setNamaSekolah] = useState('Sistem Kehadiran')
  const navigate = useNavigate()

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

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
        const userRole = profile?.role || 'guru'
        localStorage.setItem(`panrita_role_${data.user.id}`, userRole)

        // Validasi ketat kecocokan role yang dipilih dengan role di database
        if (selectedRole === 'guru' && userRole !== 'guru') {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda terdaftar sebagai Admin, bukan Guru. Silakan pilih tipe login "Admin".')
        }

        if (selectedRole === 'admin' && userRole !== 'admin') {
          await supabase.auth.signOut()
          throw new Error('Akses ditolak: Akun Anda terdaftar sebagai Guru, bukan Admin. Silakan pilih tipe login "Guru".')
        }

        if (selectedRole === 'kepsek' && userRole !== 'kepsek') {
          await supabase.auth.signOut()
          throw new Error(`Akses ditolak: Akun Anda terdaftar sebagai ${userRole === 'admin' ? 'Admin' : 'Guru'}, bukan Kepala Sekolah. Silakan pilih tipe login "${userRole === 'admin' ? 'Admin' : 'Guru'}".`)
        }

        if (selectedRole === 'pengembang' && userRole !== 'pengembang' && userRole !== 'developer') {
          await supabase.auth.signOut()
          throw new Error(`Akses ditolak: Akun Anda terdaftar sebagai ${userRole === 'admin' ? 'Admin' : 'Guru'}, bukan Pengembang. Silakan pilih tipe login "${userRole === 'admin' ? 'Admin' : 'Guru'}".`)
        }

        if (userRole === 'admin' || userRole === 'pengembang' || userRole === 'developer') navigate('/admin')
        else navigate('/guru')
        
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
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
        
        {/* Header Logo & Brand PanritaEdu (Sesuai Desain Unggahan) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.75rem', width: '100%' }}>
          {/* Logo Frame dengan Bingkai Cyan Glowing */}
          <div 
            style={{ 
              width: '66px', 
              height: '66px', 
              borderRadius: '20px', 
              background: '#071C35',
              padding: '2px',
              border: '2px solid #00B4D8',
              boxShadow: '0 0 20px rgba(0, 180, 216, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <img 
              src="/panrita_logo.webp" 
              alt="PanritaEdu Logo" 
              style={{ 
                width: '100%', 
                height: '100%', 
                borderRadius: '16px', 
                objectFit: 'contain'
              }} 
            />
          </div>

          <div style={{ textAlign: 'left', minWidth: 0 }}>
            {/* Title: PanritaEdu */}
            <div className="brand" style={{ fontSize: '1.95rem', lineHeight: '1', letterSpacing: '-0.5px' }}>
              <span style={{ color: '#FFFFFF', fontWeight: 800 }}>Panrita</span>
              <span className="brand-edu" style={{ color: '#00B4D8', fontWeight: 700, fontSize: '1.95rem' }}>Edu</span>
            </div>
            {/* Kepanjangan Akronim PanritaEdu (Menyatu langsung di bawah teks PanritaEdu) */}
            <p style={{ margin: '0.15rem 0 0.4rem 0', fontSize: '0.73rem', color: '#CBD5E1', fontWeight: 600, letterSpacing: '-0.1px', lineHeight: '1.2' }}>
              Presensi, Penilaian, Riwayat, dan Tata Kelola Edukasi
            </p>
            {/* Tagline: Sistem Presensi & Manajemen Pembelajaran Terpadu (Berada di bawahnya) */}
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#00B4D8', fontWeight: 700, letterSpacing: '-0.2px' }}>
              Sistem Presensi & Manajemen Pembelajaran Terpadu
            </p>
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
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0B2545', margin: '0 0 0.35rem 0', letterSpacing: '-0.3px' }}>
              {mode === 'register' ? 'Daftar Akun Baru' : mode === 'forgot' ? 'Lupa Password?' : 'Masuk ke PanritaEdu'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, lineHeight: '1.4' }}>
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
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
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
                        padding: '0.9rem 0.6rem',
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
                        fontSize: '0.85rem', 
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
            
            {/* Tombol Submit Utama */}
            <button 
              type="submit" 
              disabled={loading}
              style={{ 
                width: '100%', 
                padding: '0.95rem', 
                background: 'linear-gradient(135deg, #0B2545 0%, #0077B6 60%, #00B4D8 100%)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '16px', 
                fontSize: '0.95rem', 
                fontWeight: 700, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '0.5rem', 
                cursor: loading ? 'not-allowed' : 'pointer', 
                boxShadow: '0 8px 20px -4px rgba(0, 119, 182, 0.45)', 
                transition: 'all 0.2s'
              }}
            >
              {mode === 'login' ? <LogIn size={18} /> : mode === 'register' ? <UserPlus size={18} /> : <KeyRound size={18} />}
              {loading ? 'Memproses...' : mode === 'login' ? `Masuk sebagai ${currentRoleObj.label}` : mode === 'register' ? 'Daftar Sekarang' : 'Kirim Link Reset'}
            </button>
          </form>

          {/* Opsi Login Google & QR Scanner (Sesuai Referensi) */}
          {mode === 'login' && (
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
          <p className="brand" style={{ fontSize: '0.88rem', margin: '0 0 0.25rem 0', color: '#E2E8F0' }}>
            &copy; {new Date().getFullYear()} <span style={{ fontWeight: 800, color: '#FFFFFF' }}>Panrita</span><span className="brand-edu" style={{ fontSize: '0.88rem' }}>Edu</span>
          </p>
          <p className="brand-tagline" style={{ fontSize: '0.78rem', margin: 0, color: '#90E0EF', opacity: 0.9 }}>
            Sistem Presensi & Manajemen Pembelajaran Terpadu
          </p>
        </div>

      </div>
    </div>
  )
}
