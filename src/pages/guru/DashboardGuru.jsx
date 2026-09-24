import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Clock, CheckCircle, UserCircle, Calendar, Fingerprint, Check, WifiOff, RefreshCw } from 'lucide-react'

export default function DashboardGuru() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('absensi') 
  const [hasCheckedIn, setHasCheckedIn] = useState(false)
  const [izinMode, setIzinMode] = useState(null) // 'sakit' or 'izin'
  const [keterangan, setKeterangan] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // Offline State
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [unsyncedCount, setUnsyncedCount] = useState(0)

  const navigate = useNavigate()

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 11) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }

  const [popup, setPopup] = useState({ show: false, title: '', message: '', type: 'success' })

  useEffect(() => {
    // Check auto logout (1 pekan = 7 hari * 24 jam * 60 menit * 60 detik * 1000 ms)
    const lastActive = localStorage.getItem('lastActive_guru')
    const now = Date.now()
    if (lastActive && now - parseInt(lastActive) > 7 * 24 * 60 * 60 * 1000) {
       localStorage.removeItem('lastActive_guru')
       supabase.auth.signOut().then(() => navigate('/'))
       return
    }
    localStorage.setItem('lastActive_guru', now.toString())

    fetchUser()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    
    // Offline Listeners
    const handleOnline = () => { setIsOffline(false); syncOfflineData(); }
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Initial check for unsynced
    checkUnsynced()

    return () => {
      clearInterval(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const checkUnsynced = () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    setUnsyncedCount(offlineData.length)
  }

  const syncOfflineData = async () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    if (offlineData.length === 0) return

    setLoading(true)
    let syncSuccessCount = 0
    
    for (const record of offlineData) {
      if (record.jenis === 'masuk') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: 'hadir' })
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'pulang') {
        const { error } = await supabase.from('absensi').update({ waktu_pulang: record.waktu, lokasi_pulang: record.loc }).eq('user_id', record.user_id).eq('tanggal', record.tanggal)
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'sakit' || record.jenis === 'izin') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: record.jenis, keterangan: record.keterangan })
        if (!error) syncSuccessCount++
      }
    }
    
    localStorage.removeItem('offlineAbsensi')
    setUnsyncedCount(0)
    setLoading(false)
    if (syncSuccessCount > 0) {
      showPopup("Sinkronisasi Selesai", `${syncSuccessCount} data luring telah disinkronkan ke server.`, "success")
      fetchUser() // Refresh UI
    }
  }

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')
      setUser(user)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (profile) setProfile(profile)
      
      const today = getLocalDateString()
      const { data: absensiList } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).order('waktu_masuk', { ascending: false }).limit(1)
        
      const absensi = absensiList && absensiList.length > 0 ? absensiList[0] : null;

      if (absensi && absensi.waktu_masuk) {
        setHasCheckedIn(true)
      } else {
        // Also check if there's offline check-in for today
        const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
        const offlineToday = offlineData.find(d => d.tanggal === today && (d.jenis === 'masuk' || d.jenis === 'sakit' || d.jenis === 'izin'))
        if (offlineToday) setHasCheckedIn(true)
        else setHasCheckedIn(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const showPopup = (title, message, type = 'success') => {
    setPopup({ show: true, title, message, type })
    setTimeout(() => {
      setPopup({ show: false, title: '', message: '', type: 'success' })
    }, 3000)
  }

  const saveOffline = (jenis, loc, now, today, ket = '') => {
    const record = { user_id: user.id, jenis, loc, waktu: now, tanggal: today, keterangan: ket }
    const current = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    current.push(record)
    localStorage.setItem('offlineAbsensi', JSON.stringify(current))
    checkUnsynced()
    
    if (jenis !== 'pulang') {
       setHasCheckedIn(true)
       setIzinMode(null)
    }
    showPopup("Tersimpan Luring (Offline)", "Data disimpan sementara. Akan dikirim otomatis saat internet tersambung.", "success")
    setLoading(false)
  }

  const handleAbsen = async (jenis) => {
    setLoading(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const loc = `${position.coords.latitude}, ${position.coords.longitude}`
        const today = getLocalDateString()
        const now = new Date().toISOString()
        
        if (isOffline) {
           saveOffline(jenis, loc, now, today, keterangan)
           return
        }

        try {
          if (jenis === 'masuk') {
            const { error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
            if (error) throw error
            setHasCheckedIn(true)
            showPopup("Absen Berhasil!", "Data jam masuk Anda telah tersimpan ke sistem.", "success")
          } else if (jenis === 'pulang') {
            const { error } = await supabase.from('absensi').update({ waktu_pulang: now, lokasi_pulang: loc }).eq('user_id', user.id).eq('tanggal', today)
            if (error) throw error
            showPopup("Pulang Tercatat!", "Terima kasih atas kerja keras Anda hari ini.", "success")
          } else if (jenis === 'sakit' || jenis === 'izin') {
            const { error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan })
            if (error) throw error
            setHasCheckedIn(true)
            setIzinMode(null)
            showPopup("Data Terkirim!", `Keterangan ${jenis} Anda telah dilaporkan.`, "success")
          }
        } catch (error) {
          // Fallback to offline if supabase fails
          saveOffline(jenis, loc, now, today, keterangan)
        }
        setLoading(false)
      }, () => {
        showPopup("Akses Lokasi Ditolak", "Mohon izinkan akses GPS.", "error")
        setLoading(false)
      }, { timeout: 10000 })
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
            height *= MAX_SIZE / width; width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height; height = MAX_SIZE;
          }
          canvas.width = width; canvas.height = height;
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
      if (isOffline) {
         showPopup("Tidak Ada Internet", "Anda harus online untuk mengubah foto profil.", "error")
         return
      }
      setLoading(true)
      const file = event.target.files[0]
      if(!file) return
      const compressedFile = await compressImage(file)
      const fileName = `${user.id}-${Math.random()}.webp`
      
      let { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile, { contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: profileError } = await supabase.from('profiles').update({ foto_profil: publicUrl }).eq('id', user.id)
      if (profileError) throw profileError
      
      setProfile({ ...profile, foto_profil: publicUrl })
      showPopup("Tersimpan!", "Foto profil berhasil diperbarui.", "success")
    } catch (error) {
      showPopup("Gagal", error.message, "error")
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
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '1.5rem' }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            {profile?.foto_profil ? (
              <img src={profile.foto_profil} alt="Profil" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)', background: 'white' }} />
            ) : (
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserCircle size={36} color="var(--primary)" />
              </div>
            )}
            <div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.1rem' }}>{getGreeting()},</p>
              <h2 style={{ fontSize: '1.3rem', marginTop: 0, letterSpacing: '0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
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
        
        {/* Offline & Sync Indicators */}
        {isOffline && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#DC2626', fontSize: '0.85rem' }}>
             <WifiOff size={16} /> Mode Luring (Offline) Aktif
          </div>
        )}
        {!isOffline && unsyncedCount > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', color: '#D97706', fontSize: '0.85rem' }}>
             <span>Ada {unsyncedCount} data absen tertunda.</span>
             <button onClick={syncOfflineData} style={{ background: 'transparent', border: 'none', color: '#D97706', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold' }} disabled={loading}>
                <RefreshCw size={14} className={loading ? "spin" : ""} /> Sync
             </button>
          </div>
        )}

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
                  <input type="file" id="upload-foto" accept="image/*" style={{ display: 'none' }} onChange={uploadFoto} disabled={loading || isOffline} />
                  <label htmlFor="upload-foto" className="btn" style={{ background: '#E0E7FF', color: '#4F46E5', fontSize: '0.85rem', padding: '0.5rem 1rem', cursor: 'pointer', opacity: isOffline ? 0.5 : 1 }}>
                    {loading ? 'Mengunggah...' : 'Ubah Foto'}
                  </label>
                </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa menyimpan profil saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const updates = { full_name: formData.get('full_name'), nip: formData.get('nip'), jabatan: formData.get('jabatan') };
                
                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (!error) {
                  setProfile({ ...profile, ...updates });
                  showPopup("Tersimpan!", "Profil Anda berhasil diperbarui.", "success");
                } else {
                  showPopup("Gagal", error.message, "error");
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
                  {loading ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </form>
            </div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', marginTop: '2rem' }}>Keamanan</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa mengubah password saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const newPassword = formData.get('new_password');
                
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (!error) {
                  showPopup("Berhasil!", "Password Anda telah diperbarui.", "success");
                  e.target.reset();
                } else {
                  showPopup("Gagal", error.message, "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Ubah Password Baru</label>
                  <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                </div>
                <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }} disabled={loading}>
                  {loading ? 'Memproses...' : 'Ubah Password'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Corporate Style Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'absensi' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('absensi')}>
          <Clock size={24} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.5} /> Presensi
        </button>
        <button className={`nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('pengaturan')}>
          <UserCircle size={24} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.5} /> Profil
        </button>
      </nav>
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
