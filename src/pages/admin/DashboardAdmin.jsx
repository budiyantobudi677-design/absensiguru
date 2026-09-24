import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Users, FileText, Settings, ShieldCheck, ArrowLeft, Download, Search, ArrowUpDown, UserCircle, Activity, Clock, XCircle, Bell, Trash2 } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function DashboardAdmin() {
  const [admin, setAdmin] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') 
  const [namaSekolah, setNamaSekolah] = useState('HR Dashboard')
  const [logoSekolah, setLogoSekolah] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const [pegawaiData, setPegawaiData] = useState([])
  const [absensiData, setAbsensiData] = useState([])
  const [pengumumanData, setPengumumanData] = useState([])
  const [targetType, setTargetType] = useState('all')
  const [selectedPegawai, setSelectedPegawai] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [laporanPeriod, setLaporanPeriod] = useState('hari_ini')
  
  const [pegawaiSearch, setPegawaiSearch] = useState('')
  const [pegawaiSort, setPegawaiSort] = useState('name-asc')

  const [overviewStats, setOverviewStats] = useState({ hadir: 0, tidakHadir: 0 })
  
  const navigate = useNavigate()

  useEffect(() => {
    fetchAdmin()
    fetchSettings()
    fetchOverviewStats()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTab === 'laporan') {
       loadAbsensi()
    }
  }, [laporanPeriod])

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data) {
      if (data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
      if (data.logo_sekolah) setLogoSekolah(data.logo_sekolah)
    }
  }

  const fetchAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigate('/')
    setAdmin(user)
  }

  const fetchOverviewStats = async () => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase.from('absensi').select('*').eq('tanggal', todayStr)
    if (data) {
       let hadir = 0
       let tidakHadir = 0
       data.forEach(a => {
          if (a.status === 'hadir') {
             hadir++
          } else {
             tidakHadir++
          }
       })
       setOverviewStats({ hadir, tidakHadir })
    }
  }

  const loadPegawai = async () => {
    setLoadingData(true)
    const { data } = await supabase.from('profiles').select('*')
    if (data) setPegawaiData(data)
    setLoadingData(false)
  }

  const loadAbsensi = async () => {
    setLoadingData(true)
    let query = supabase.from('absensi').select('*, profiles(full_name, email, foto_profil, jabatan)')
    
    const today = new Date()
    if (laporanPeriod === 'hari_ini') {
       query = query.eq('tanggal', today.toLocaleDateString('en-CA'))
    } else if (laporanPeriod === 'bulan_ini') {
       const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay)
    } else if (laporanPeriod === 'semester_ini') {
       const month = today.getMonth()
       const startMonth = month < 6 ? 0 : 6
       const firstDay = new Date(today.getFullYear(), startMonth, 1).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay)
    }
    
    const { data } = await query.order('waktu_masuk', { ascending: false }).limit(500)
    if (data) setAbsensiData(data)
    setLoadingData(false)
  }

  const loadPengumuman = async () => {
    setLoadingData(true)
    const { data, error } = await supabase.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(50)
    if (!error && data) setPengumumanData(data)
    setLoadingData(false)
  }

  const hapusPengumuman = async (id) => {
    if (!window.confirm("Hapus pengumuman ini?")) return
    const { error } = await supabase.from('pengumuman').delete().eq('id', id)
    if (!error) {
       setPengumumanData(pengumumanData.filter(p => p.id !== id))
    }
  }

  const tambahPengumuman = async (e) => {
    e.preventDefault()
    const pesan = e.target.pesan.value
    if (!pesan.trim()) return
    if (targetType === 'selected' && selectedPegawai.length === 0) {
       return alert("Pilih minimal satu pegawai untuk menerima notifikasi ini.")
    }
    
    const target_users = targetType === 'selected' ? selectedPegawai.join(',') : ''
    const { data, error } = await supabase.from('pengumuman').insert({ pesan, target_type: targetType, target_users }).select()
    
    if (!error && data) {
       setPengumumanData([data[0], ...pengumumanData])
       e.target.reset()
       setTargetType('all')
       setSelectedPegawai([])
       alert("Pengumuman berhasil dikirim!")
    } else {
       if (error?.code === '42P01' || error?.message?.includes('target_type')) {
          alert("Error: Struktur tabel 'pengumuman' belum diperbarui di Supabase. Silakan perbarui tabel (tambah kolom target_type dan target_users)!")
       } else {
          alert("Gagal mengirim pengumuman: " + error?.message)
       }
    }
  }

  const handleMenuClick = (menu) => {
    setActiveTab(menu)
    if (menu === 'pegawai') loadPegawai()
    if (menu === 'laporan') loadAbsensi()
    if (menu === 'overview') fetchOverviewStats()
    if (menu === 'pengumuman') {
       loadPengumuman()
       loadPegawai()
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
          if (width > height) {
            if (width > 600) { height = Math.round((height *= 600 / width)); width = 600; }
          } else {
            if (height > 600) { width = Math.round((width *= 600 / height)); height = 600; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], "logo_" + Date.now() + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const compressedFile = await compressImage(file)
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.webp`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('settings').upsert({ id: 1, logo_sekolah: publicUrl }, { onConflict: 'id' })
      if (updateError) throw updateError
      setLogoSekolah(publicUrl)
      alert("Logo berhasil diperbarui!")
    } catch (err) {
      alert("Gagal upload logo: " + err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const downloadExcel = () => {
    if (absensiData.length === 0) return alert("Tidak ada data untuk diunduh.");
    const worksheetData = getFilteredAndSortedData().map((a, index) => ({
      'No': index + 1,
      'Nama Pegawai': a.profiles?.full_name || a.profiles?.email?.split('@')[0] || 'Unknown',
      'Tanggal': new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      'Jam Masuk': new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      'Jam Pulang': a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Belum Pulang',
      'Status': a.status?.toUpperCase() || 'HADIR'
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Presensi");
    worksheet['!cols'] = [{wch: 5}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 12}];
    XLSX.writeFile(workbook, `Laporan_Kehadiran.xlsx`);
  }

  const getFilteredAndSortedData = () => {
    let result = absensiData.filter(a => {
      const name = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      return name.includes(searchTerm.toLowerCase())
    })
    result.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.waktu_masuk) - new Date(a.waktu_masuk)
      if (sortOrder === 'oldest') return new Date(a.waktu_masuk) - new Date(b.waktu_masuk)
      const nameA = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      const nameB = (b.profiles?.full_name || b.profiles?.email || '').toLowerCase()
      if (sortOrder === 'name-asc') return nameA.localeCompare(nameB)
      if (sortOrder === 'name-desc') return nameB.localeCompare(nameA)
      return 0
    })
    return result
  }

  const getFilteredPegawai = () => {
    let result = pegawaiData.filter(p => {
      const name = (p.full_name || p.email || '').toLowerCase()
      return name.includes(pegawaiSearch.toLowerCase())
    })
    result.sort((a, b) => {
      const nameA = (a.full_name || a.email || '').toLowerCase()
      const nameB = (b.full_name || b.email || '').toLowerCase()
      if (pegawaiSort === 'name-asc') return nameA.localeCompare(nameB)
      if (pegawaiSort === 'name-desc') return nameB.localeCompare(nameA)
      if (pegawaiSort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      return 0
    })
    return result
  }

  const filteredAbsensi = getFilteredAndSortedData()
  const filteredPegawai = getFilteredPegawai()

  return (
    <div className="container" style={{ paddingBottom: '90px', background: '#F8FAFC', minHeight: '100vh' }}>
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '2rem', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}></div>
        <div className="flex justify-between items-center position-relative mb-6">
          <div className="flex items-center gap-4">
            <div style={{ width: '56px', height: '56px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ShieldCheck size={32} color="white" />}
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.1rem' }}>Administrator,</p>
              <h2 style={{ fontSize: '1.4rem', marginTop: 0, color: 'white', letterSpacing: '0.5px' }}>{namaSekolah}</h2>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between position-relative" style={{ background: 'rgba(255,255,255,0.15)', padding: '1rem 1.25rem', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-3" style={{ color: 'white' }}>
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
        {activeTab === 'overview' && (
          <div className="fade-in">
            
            {/* Real-time Dashboard Metrics */}
            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', color: '#1E293B' }}>Kehadiran Hari Ini</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
               <div className="card text-center" style={{ padding: '1.25rem 0.5rem', borderRadius: '20px', border: 'none', background: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.1)' }}>
                  <Activity size={24} color="#10B981" style={{ margin: '0 auto 0.5rem auto' }} />
                  <h2 style={{ fontSize: '1.5rem', color: '#10B981', margin: '0 0 0.25rem 0' }}>{overviewStats.hadir}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0, fontWeight: '600' }}>HADIR</p>
               </div>
               <div className="card text-center" style={{ padding: '1.25rem 0.5rem', borderRadius: '20px', border: 'none', background: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.1)' }}>
                  <XCircle size={24} color="#EF4444" style={{ margin: '0 auto 0.5rem auto' }} />
                  <h2 style={{ fontSize: '1.5rem', color: '#EF4444', margin: '0 0 0.25rem 0' }}>{overviewStats.tidakHadir}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0, fontWeight: '600' }}>IZIN/SAKIT</p>
               </div>
            </div>

            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', color: '#1E293B' }}>Menu Navigasi</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div onClick={() => handleMenuClick('pegawai')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Users size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Data Pegawai</h3>
              </div>
              <div onClick={() => handleMenuClick('laporan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <FileText size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Laporan</h3>
              </div>
              <div onClick={() => handleMenuClick('pengumuman')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Bell size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Pengumuman</h3>
              </div>
              <div onClick={() => handleMenuClick('pengaturan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Settings size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Pengaturan Sekolah</h3>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pegawai' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Daftar Pegawai</h3>
             </div>
             
             <div className="flex flex-col gap-3 mb-4">
                <div style={{ position: 'relative' }}>
                   <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <input type="text" className="input" placeholder="Cari nama guru..." value={pegawaiSearch} onChange={(e) => setPegawaiSearch(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', fontSize: '0.9rem' }} />
                </div>
                <div style={{ position: 'relative' }}>
                   <ArrowUpDown size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <select className="input" value={pegawaiSort} onChange={(e) => setPegawaiSort(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', appearance: 'none', fontSize: '0.9rem' }}>
                      <option value="name-asc">Nama (A - Z)</option>
                      <option value="name-desc">Nama (Z - A)</option>
                      <option value="newest">Terbaru Ditambahkan</option>
                   </select>
                </div>
             </div>

             {loadingData ? <p className="text-center text-muted">Memuat data...</p> : (
               <div className="flex flex-col gap-2">
                 {filteredPegawai.length === 0 && <p className="text-center text-muted">Tidak ada pegawai.</p>}
                 {filteredPegawai.map(p => (
                   <div key={p.id} className="card flex items-center justify-between" style={{ padding: '0.75rem 1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                     <div className="flex gap-4 items-center">
                       {p.foto_profil ? <img src={p.foto_profil} style={{ width:'36px', height:'36px', borderRadius:'50%', objectFit:'cover'}} /> : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserCircle size={20} color="var(--text-muted)" /></div>}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{p.full_name || p.email}</h4>
                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.jabatan || 'Pegawai'} {p.nip && `• ${p.nip}`}</p>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'laporan' && (
          <div className="fade-in">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Laporan</h3>
                </div>
                <button onClick={downloadExcel} className="btn" style={{ background: '#10B981', color: 'white', padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.8rem', borderRadius: '10px' }}>
                  <Download size={14} /> Excel
                </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
               {/* Laporan Period Filter */}
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                 <button onClick={() => setLaporanPeriod('hari_ini')} className="btn" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '10px', background: laporanPeriod === 'hari_ini' ? '#4F46E5' : '#E2E8F0', color: laporanPeriod === 'hari_ini' ? 'white' : '#475569' }}>Hari Ini</button>
                 <button onClick={() => setLaporanPeriod('bulan_ini')} className="btn" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '10px', background: laporanPeriod === 'bulan_ini' ? '#4F46E5' : '#E2E8F0', color: laporanPeriod === 'bulan_ini' ? 'white' : '#475569' }}>Bulan Ini</button>
                 <button onClick={() => setLaporanPeriod('semester_ini')} className="btn" style={{ padding: '0.5rem', fontSize: '0.75rem', borderRadius: '10px', background: laporanPeriod === 'semester_ini' ? '#4F46E5' : '#E2E8F0', color: laporanPeriod === 'semester_ini' ? 'white' : '#475569' }}>Semester</button>
               </div>
               
               <div style={{ position: 'relative' }}>
                  <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input" placeholder="Cari nama pegawai..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', fontSize: '0.9rem' }} />
               </div>
            </div>

            {loadingData ? <p className="text-center text-muted mt-8">Memuat data...</p> : (
              <div className="flex flex-col gap-2">
                {filteredAbsensi.length === 0 && <p className="text-center text-muted">Data tidak ditemukan pada periode ini.</p>}
                {filteredAbsensi.map(a => (
                  <div key={a.id} className="card flex items-center justify-between" style={{ padding: '0.8rem 1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                    <div className="flex gap-3 items-center">
                       {a.profiles?.foto_profil ? <img src={a.profiles.foto_profil} alt="Foto" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} color="var(--text-muted)" /></div>}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{a.profiles?.full_name || a.profiles?.email?.split('@')[0]}</h4>
                         <p style={{ margin: 0, fontSize: '0.75rem', color: a.status !== 'hadir' && a.status ? '#DC2626' : 'var(--text-muted)' }}>
                           {new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                           {a.status && a.status !== 'hadir' && ` • ${a.status.toUpperCase()}: ${a.keterangan || '-'}`}
                         </p>
                       </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>IN</div>
                         <div style={{ fontWeight: '700', color: '#059669', fontSize: '0.9rem' }}>{new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>OUT</div>
                         <div style={{ fontWeight: '700', color: a.waktu_pulang ? '#D97706' : '#CBD5E1', fontSize: '0.9rem' }}>{a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'pengumuman' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Notifikasi & Pengumuman</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Buat Pengumuman Baru</h4>
               <form onSubmit={tambahPengumuman}>
                 <div className="input-group">
                   <textarea name="pesan" className="input" rows="3" placeholder="Tulis pesan atau notifikasi..." required style={{ resize: 'vertical' }}></textarea>
                 </div>
                 
                 <div className="input-group" style={{ marginTop: '1rem' }}>
                   <label className="input-label" style={{ fontSize: '0.85rem' }}>Kirim Ke</label>
                   <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: '0.75rem', borderRadius: '12px' }}>
                      <option value="all">Semua Pegawai</option>
                      <option value="selected">Pegawai Tertentu</option>
                   </select>
                 </div>
                 
                 {targetType === 'selected' && (
                    <div className="input-group" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                       {pegawaiData.length === 0 ? <p className="text-muted text-sm m-0">Memuat data pegawai...</p> : pegawaiData.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                             <input type="checkbox" checked={selectedPegawai.includes(p.id)} onChange={(e) => {
                                if (e.target.checked) setSelectedPegawai([...selectedPegawai, p.id]);
                                else setSelectedPegawai(selectedPegawai.filter(id => id !== p.id));
                             }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                             <span style={{ fontSize: '0.95rem', color: '#334E68' }}>{p.full_name || p.email}</span>
                          </label>
                       ))}
                    </div>
                 )}

                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '1.25rem', width: '100%', background: '#EC4899', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                   <Bell size={18} /> Kirim Notifikasi
                 </button>
               </form>
             </div>

             <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Riwayat Pengumuman</h4>
             {loadingData ? <p className="text-muted">Memuat data...</p> : (
               <div className="flex flex-col gap-3">
                 {pengumumanData.length === 0 && <p className="text-muted">Belum ada pengumuman.</p>}
                 {pengumumanData.map(p => (
                   <div key={p.id} className="card" style={{ padding: '1rem', border: '1px solid #F1F5F9', borderRadius: '16px', background: 'white' }}>
                     <div className="flex justify-between items-start mb-2">
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                         {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </span>
                       <button onClick={() => hapusPengumuman(p.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                         <Trash2 size={16} />
                       </button>
                     </div>
                     <p style={{ margin: 0, fontSize: '0.95rem', color: '#334E68', lineHeight: '1.5' }}>{p.pesan}</p>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'pengaturan' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Pengaturan</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Profil Sekolah</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const { error } = await supabase.from('settings').upsert({ id: 1, nama_sekolah: formData.get('nama_sekolah'), logo_sekolah: logoSekolah }, { onConflict: 'id' });
                 if (error) alert('Error: ' + error.message);
                 else { setNamaSekolah(formData.get('nama_sekolah')); alert('Tersimpan!'); }
               }}>
                 <div className="input-group">
                   <label className="input-label">Nama Sekolah / Instansi</label>
                   <input type="text" name="nama_sekolah" className="input" defaultValue={namaSekolah} required />
                 </div>
                 <div className="input-group">
                   <label className="input-label">Logo Sekolah</label>
                   <div className="flex gap-4 items-center">
                     <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                       {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ShieldCheck size={24} color="var(--text-muted)" />}
                     </div>
                     <label className="btn" style={{ background: '#F1F5F9', color: '#1E293B', cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.875rem', borderRadius: '12px' }}>
                       {uploadingLogo ? '...' : 'Upload Logo'}
                       <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
                     </label>
                   </div>
                 </div>
                 <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '1rem', background: '#F59E0B' }}>Simpan Pengaturan</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Keamanan Akun</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const newPassword = formData.get('new_password');
                 
                 const { error } = await supabase.auth.updateUser({ password: newPassword });
                 if (!error) {
                   alert("Password berhasil diperbarui!");
                   e.target.reset();
                 } else {
                   alert("Gagal mengubah password: " + error.message);
                 }
               }}>
                 <div className="input-group">
                   <label className="input-label">Ubah Password Baru</label>
                   <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }}>
                   Ubah Password
                 </button>
               </form>
             </div>
          </div>
        )}
      </div>

      <nav className="bottom-nav" style={{ paddingBottom: '1.5rem' }}>
        <button className={`nav-item active`} onClick={() => setActiveTab('overview')}>
          <Settings size={24} strokeWidth={2.5} /> Panel Utama
        </button>
        <button className={`nav-item`} onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}>
          <LogOut size={24} strokeWidth={1.5} /> Log Out
        </button>
      </nav>
    </div>
  )
}
