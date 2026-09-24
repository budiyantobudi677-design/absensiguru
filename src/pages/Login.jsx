import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogIn, UserCheck } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [namaSekolah, setNamaSekolah] = useState('HR Dashboard')
  const navigate = useNavigate()

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      if (data && data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
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
    <div className="container flex items-center justify-center" style={{ background: 'var(--primary-light)' }}>
      <div style={{ width: '100%', padding: '2rem' }}>
        <div className="text-center mb-8">
          <div style={{ 
            background: 'linear-gradient(135deg, var(--primary) 0%, #312E81 100%)', 
            width: '88px', height: '88px', borderRadius: '24px', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto', 
            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.5)' 
          }}>
            <UserCheck size={44} color="white" />
          </div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.25rem' }}>{namaSekolah}</h1>
          <p className="text-muted" style={{ fontSize: '1rem' }}>Sistem Kehadiran Karyawan & Guru</p>
        </div>
        
        <div className="card" style={{ padding: '2rem', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
          {error && (
            <div style={{ padding: '1rem', background: '#FEF2F2', color: 'var(--danger)', borderRadius: '12px', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label className="input-label">Email Instansi</label>
              <input 
                type="email" 
                className="input" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@sekolah.edu"
                required 
              />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input 
                type="password" 
                className="input" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
              <LogIn size={20} />
              {loading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
            </button>
          </form>
        </div>
        <p className="text-center text-muted" style={{ marginTop: '2.5rem', fontSize: '0.875rem' }}>
          &copy; 2024 Corporate HR System
        </p>
      </div>
    </div>
  )
}
