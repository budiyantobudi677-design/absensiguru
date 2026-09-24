import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Clock, BookOpen, CheckCircle, UserCircle, Calendar, Fingerprint, Check } from 'lucide-react'

export default function DashboardGuru() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('absensi') 
  const [hasCheckedIn, setHasCheckedIn] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const navigate = useNavigate()

  // State for Custom Popup Animation
  const [popup, setPopup] = useState({ show: false, title: '', message: '', type: 'success' })

  useEffect(() => {
    fetchUser()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigate('/')
    setUser(user)

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(profile)
    
    const today = new Date().toISOString().split('T')[0]
    const { data: absensi } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).single()
      
    if (absensi?.waktu_masuk) {
      setHasCheckedIn(true)
    }
  }

  const showPopup = (title, message, type = 'success') => {
    setPopup({ show: true, title, message, type })
    // Auto close after 3 seconds
    setTimeout(() => {
      setPopup({ show: false, title: '', message: '', type: 'success' })
    }, 3000)
  }

  const handleAbsen = async (jenis) => {
    setLoading(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const loc = `${position.coords.latitude}, ${position.coords.longitude}`
        const today = new Date().toISOString().split('T')[0]
        const now = new Date().toISOString()
        
        if (jenis === 'masuk') {
          const { error } = await supabase
            .from('absensi')
            .insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
          
          if (!error) {
            setHasCheckedIn(true)
            showPopup("Absen Berhasil!", "Data jam masuk Anda telah tersimpan ke sistem.", "success")
          } else {
            showPopup("Terjadi Kesalahan", error.message, "error")
          }
        } else {
          const { error } = await supabase
            .from('absensi')
            .update({ waktu_pulang: now, lokasi_pulang: loc })
            .eq('user_id', user.id)
            .eq('tanggal', today)
            
          if (!error) {
            showPopup("Pulang Tercatat!", "Terima kasih atas kerja keras Anda hari ini.", "success")
          } else {
            showPopup("Terjadi Kesalahan", error.message, "error")
          }
        }
        setLoading(false)
      }, () => {
        showPopup("Akses Lokasi Ditolak", "Mohon izinkan akses GPS untuk absensi.", "error")
        setLoading(false)
      })
    } else {
      showPopup("GPS Tidak Didukung", "Browser Anda tidak mendukung lokasi.", "error")
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ paddingBottom: '90px' }}>
      
      {/* Custom Popup Modal */}
      {popup.show && (
        <div className="popup-overlay">
          <div className="popup-content">
             <div style={{ margin: '0 auto 1rem auto', width: '64px', height: '64px', background: popup.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: popup.type === 'success' ? '#059669' : '#DC2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={32} strokeWidth={3} />
             </div>
             <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{popup.title}</h2>
             <p className="text-muted" style={{ fontSize: '0.95rem' }}>{popup.message}</p>
          </div>
        </div>
      )}

      {/* Header ID Card */}
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '2rem' }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCircle size={32} color="var(--primary)" />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>Selamat Pagi,</p>
              <h2 style={{ fontSize: '1.25rem', marginTop: '0.1rem', letterSpacing: '0.5px' }}>
                {profile?.full_name || user?.email?.split('@')[0]}
              </h2>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.15)', padding: '1rem 1.25rem', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-3">
            <Clock size={20} />
            <span style={{ fontSize: '1rem', fontWeight: '500', letterSpacing: '1px' }}>
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}>
            {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        {activeTab === 'absensi' && (
          <div className="text-center">
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Sentuh tombol di bawah untuk absensi</p>

            {!hasCheckedIn ? (
              <button className="btn-clock" onClick={() => handleAbsen('masuk')} disabled={loading}>
                <Fingerprint size={48} strokeWidth={1.5} />
                <span>Clock In</span>
              </button>
            ) : (
              <button className="btn-clock out" onClick={() => handleAbsen('pulang')} disabled={loading}>
                <Fingerprint size={48} strokeWidth={1.5} />
                <span>Clock Out</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'jurnal' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 style={{ fontSize: '1.25rem' }}>Jurnal Harian</h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: '600', background: 'var(--primary-light)', padding: '0.25rem 0.75rem', borderRadius: '99px' }}>Hari Ini</span>
            </div>
            
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <form onSubmit={(e) => { e.preventDefault(); showPopup("Jurnal Terkirim", "Laporan harian Anda berhasil disimpan."); }}>
                <div className="input-group">
                  <label className="input-label">Mata Pelajaran / Tugas</label>
                  <input type="text" className="input" placeholder="Kegiatan utama" required />
                </div>
                <div className="input-group">
                  <label className="input-label">Laporan / Catatan</label>
                  <textarea className="input" rows="4" placeholder="Detail pekerjaan atau materi yang disampaikan..." required></textarea>
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '1rem' }}>
                  Kirim Laporan
                </button>
              </form>
            </div>
          </div>
        )}
        {activeTab === 'pengaturan' && (
          <div className="fade-in">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Pengaturan Profil</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                const formData = new FormData(e.target);
                const updates = {
                  full_name: formData.get('full_name'),
                  nip: formData.get('nip'),
                  jabatan: formData.get('jabatan')
                };
                
                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (!error) {
                  setProfile({ ...profile, ...updates });
                  showPopup("Tersimpan!", "Profil Anda berhasil diperbarui.", "success");
                } else {
                  showPopup("Gagal", "Silakan tambahkan kolom NIP & Jabatan di Supabase.", "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Nama Lengkap</label>
                  <input type="text" name="full_name" className="input" defaultValue={profile?.full_name || ''} required />
                </div>
                <div className="input-group">
                  <label className="input-label">NIP / ID Pegawai</label>
                  <input type="text" name="nip" className="input" defaultValue={profile?.nip || ''} placeholder="Contoh: 198012312005011002" />
                </div>
                <div className="input-group">
                  <label className="input-label">Jabatan / Guru Mapel</label>
                  <input type="text" name="jabatan" className="input" defaultValue={profile?.jabatan || ''} placeholder="Contoh: Guru Matematika" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Corporate Style Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'absensi' ? 'active' : ''}`} onClick={() => setActiveTab('absensi')}>
          <Clock size={24} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.5} /> Presensi
        </button>
        <button className={`nav-item ${activeTab === 'jurnal' ? 'active' : ''}`} onClick={() => setActiveTab('jurnal')}>
          <BookOpen size={24} strokeWidth={activeTab === 'jurnal' ? 2.5 : 1.5} /> Jurnal
        </button>
        <button className={`nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} onClick={() => setActiveTab('pengaturan')}>
          <UserCircle size={24} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.5} /> Profil
        </button>
      </nav>
    </div>
  )
}
