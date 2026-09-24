import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogIn, UserCheck, Mail, Lock } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [namaSekolah, setNamaSekolah] = useState('Sistem Kehadiran')
  const [logoSekolah, setLogoSekolah] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      if (data) {
        if (data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
        if (data.logo_sekolah) setLogoSekolah(data.logo_sekolah)
      }
    }
    fetchSettings()
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
        
      if (profile?.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/guru')
      }
    }
    setLoading(false)
  }

  return (
    <div className="container flex items-center justify-center" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4F8 0%, #D9E2EC 100%)', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className="text-center mb-6">
          <div style={{ 
            background: logoSekolah ? 'transparent' : 'linear-gradient(135deg, var(--primary) 0%, #312E81 100%)', 
            width: '100px', height: '100px', borderRadius: logoSekolah ? '0' : '28px', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.2rem auto', 
            boxShadow: logoSekolah ? 'none' : '0 15px 30px -5px rgba(79, 70, 229, 0.4)',
          }}>
            {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <UserCheck size={48} color="white" />}
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#102A43', marginBottom: '0.4rem', lineHeight: '1.3', letterSpacing: '-0.02em' }}>
            {namaSekolah}
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#627D98', fontWeight: '500' }}>Sistem Kehadiran Karyawan & Guru</p>
        </div>
        
        <div className="card" style={{ padding: '2rem', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '28px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.08)' }}>
          {error && (
            <div style={{ padding: '0.875rem', background: '#FEE2E2', color: '#B91C1C', borderRadius: '16px', marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: '600', textAlign: 'center', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334E68', marginBottom: '0.5rem', marginLeft: '0.25rem' }}>Email Instansi</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} color="#829AB1" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@sekolah.edu"
                  style={{ width: '100%', padding: '0.9rem 1rem 0.9rem 3rem', borderRadius: '16px', border: '2px solid #D9E2EC', background: '#F0F4F8', fontSize: '0.95rem', color: '#102A43', outline: 'none', transition: 'all 0.25s' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#D9E2EC'; e.target.style.background = '#F0F4F8'; e.target.style.boxShadow = 'none'; }}
                  required 
                />
              </div>
            </div>
            <div style={{ marginBottom: '1.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334E68', marginBottom: '0.5rem', marginLeft: '0.25rem' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="#829AB1" style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '0.9rem 1rem 0.9rem 3rem', borderRadius: '16px', border: '2px solid #D9E2EC', background: '#F0F4F8', fontSize: '0.95rem', color: '#102A43', outline: 'none', transition: 'all 0.25s' }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.background = '#FFFFFF'; e.target.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#D9E2EC'; e.target.style.background = '#F0F4F8'; e.target.style.boxShadow = 'none'; }}
                  required 
                />
              </div>
            </div>
            <button type="submit" style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, var(--primary) 0%, #4338CA 100%)', color: 'white', border: 'none', borderRadius: '16px', fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.4)', transition: 'transform 0.1s, box-shadow 0.2s' }} disabled={loading} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
              <LogIn size={20} />
              {loading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
            </button>
          </form>
        </div>
        <p className="text-center" style={{ marginTop: '2.5rem', fontSize: '0.85rem', color: '#829AB1', fontWeight: '600' }}>
          &copy; {new Date().getFullYear()} Absensi Guru & Pegawai
        </p>
      </div>
    </div>
  )
}
