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
  const [izinMode, setIzinMode] = useState(null) // 'sakit' or 'izin'
  const [keterangan, setKeterangan] = useState('')
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
        } else if (jenis === 'pulang') {
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
        } else if (jenis === 'sakit' || jenis === 'izin') {
          const { error } = await supabase
            .from('absensi')
            .insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan })
          
          if (!error) {
            setHasCheckedIn(true)
            setIzinMode(null)
            showPopup("Data Terkirim!", `Keterangan ${jenis} Anda telah dilaporkan.`, "success")
          } else {
            showPopup("Terjadi Kesalahan", error.message, "error")
          }
        }
        setLoading(false)
      }, () => {
        showPopup("Akses Lokasi Ditolak", "Mohon izinkan akses GPS.", "error")
        setLoading(false)
      })
    } else {
      showPopup("GPS Tidak Didukung", "Browser Anda tidak mendukung lokasi.", "error")
      setLoading(false)
    }
  }

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_SIZE = 600;
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  }

  const uploadFoto = async (event) => {
    try {
      setLoading(true)
      const file = event.target.files[0]
      if(!file) return
      
      const compressedFile = await compressImage(file)
      const fileName = `${user.id}-${Math.random()}.webp`
      const filePath = `${fileName}`

      let { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile, { contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)
      
      await supabase.from('profiles').update({ foto_profil: publicUrl }).eq('id', user.id)
      setProfile({ ...profile, foto_profil: publicUrl })
      showPopup("Tersimpan!", "Foto profil berhasil diperbarui.", "success")
    } catch (error) {
      showPopup("Gagal", error.message + " (Pastikan sudah membuat bucket 'avatars' public)", "error")
    } finally {
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
            {profile?.foto_profil ? (
              <img src={profile.foto_profil} alt="Profil" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid white' }} />
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCircle size={32} color="var(--primary)" />
              </div>
            )}
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
              <>
                <button className="btn-clock" onClick={() => handleAbsen('masuk')} disabled={loading} style={{ marginBottom: '1.5rem' }}>
                  <Fingerprint size={48} strokeWidth={1.5} />
                  <span>Clock In</span>
                </button>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                  <button onClick={() => setIzinMode('sakit')} className="btn" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '0.75rem 1.5rem' }}>Sakit</button>
                  <button onClick={() => setIzinMode('izin')} className="btn" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D', padding: '0.75rem 1.5rem' }}>Izin</button>
                </div>
              </>
            ) : (
              <button className="btn-clock out" onClick={() => handleAbsen('pulang')} disabled={loading}>
                <Fingerprint size={48} strokeWidth={1.5} />
                <span>Clock Out</span>
              </button>
            )}

            {izinMode && (
              <div className="card" style={{ marginTop: '2rem', textAlign: 'left' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Form {izinMode === 'sakit' ? 'Sakit' : 'Izin'}</h4>
                <textarea className="input" rows="3" placeholder="Masukkan keterangan..." value={keterangan} onChange={e => setKeterangan(e.target.value)} style={{ marginBottom: '1rem' }} />
                <div className="flex gap-2">
                  <button onClick={() => setIzinMode(null)} className="btn" style={{ background: '#E2E8F0', flex: 1 }}>Batal</button>
                  <button onClick={() => handleAbsen(izinMode)} className="btn btn-primary" style={{ flex: 1 }}>Kirim</button>
                </div>
              </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                {profile?.foto_profil ? (
                  <img src={profile.foto_profil} alt="Profil" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '1rem' }} />
                ) : (
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <UserCircle size={40} color="var(--text-muted)" />
                  </div>
                )}
                <div>
                  <input type="file" id="upload-foto" accept="image/*" style={{ display: 'none' }} onChange={uploadFoto} disabled={loading} />
                  <label htmlFor="upload-foto" className="btn" style={{ background: '#E0E7FF', color: '#4F46E5', fontSize: '0.85rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                    {loading ? 'Mengunggah...' : 'Ubah Foto'}
                  </label>
                </div>
              </div>

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
