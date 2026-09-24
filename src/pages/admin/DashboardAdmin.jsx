import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Users, FileText, Settings, ShieldCheck, ArrowLeft, Download, Database, Search, ArrowUpDown } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function DashboardAdmin() {
  const [admin, setAdmin] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') 
  const [namaSekolah, setNamaSekolah] = useState('HR Dashboard')
  
  // Data State
  const [pegawaiData, setPegawaiData] = useState([])
  const [absensiData, setAbsensiData] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  
  // Search and Sort State
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('newest') // 'newest' | 'oldest' | 'name-asc' | 'name-desc'
  
  const navigate = useNavigate()

  useEffect(() => {
    fetchAdmin()
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data && data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
  }

  const fetchAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigate('/')
    setAdmin(user)
  }

  const loadPegawai = async () => {
    setLoadingData(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) setPegawaiData(data)
    setLoadingData(false)
  }

  const loadAbsensi = async () => {
    setLoadingData(true)
    const { data } = await supabase
      .from('absensi')
      .select('*, profiles(full_name, email, foto_profil, jabatan)')
      .order('waktu_masuk', { ascending: false })
      .limit(200)
      
    if (data) setAbsensiData(data)
    setLoadingData(false)
  }

  const handleMenuClick = (menu) => {
    setActiveTab(menu)
    if (menu === 'pegawai') loadPegawai()
    if (menu === 'laporan') loadAbsensi()
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

  // Filter and Sort Logic
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

  const filteredAbsensi = getFilteredAndSortedData()

  return (
    <div className="container" style={{ paddingBottom: '90px', background: '#F8FAFC' }}>
      {/* Header Admin */}
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '1.5rem', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}></div>
        <div className="flex justify-between items-center position-relative">
          <div className="flex items-center gap-3">
            <div style={{ width: '56px', height: '56px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={32} color="white" />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', fontWeight: '500' }}>Administrator</p>
              <h2 style={{ fontSize: '1.4rem', marginTop: '0.1rem', color: 'white' }}>{namaSekolah}</h2>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        {activeTab === 'overview' && (
          <div className="fade-in">
            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', color: '#1E293B' }}>Menu Utama</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div onClick={() => handleMenuClick('pegawai')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Users size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Pegawai</h3>
              </div>
              <div onClick={() => handleMenuClick('laporan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <FileText size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Laporan</h3>
              </div>
              <div onClick={() => handleMenuClick('pengaturan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', gridColumn: 'span 2' }}>
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
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Daftar Pegawai</h3>
             </div>
             {loadingData ? <p className="text-center text-muted">Memuat data pegawai...</p> : (
               <div className="flex flex-col gap-2">
                 {pegawaiData.length === 0 && <p className="text-center text-muted">Tidak ada pegawai.</p>}
                 {pegawaiData.map(p => (
                   <div key={p.id} className="card flex items-center justify-between" style={{ padding: '1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                     <div className="flex gap-3 items-center">
                       {p.foto_profil ? (
                          <img src={p.foto_profil} style={{ width:'48px', height:'48px', borderRadius:'50%', objectFit:'cover'}} />
                       ) : (
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <UserCircle size={28} color="var(--text-muted)" />
                          </div>
                       )}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '1rem' }}>{p.full_name || p.email}</h4>
                         <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.jabatan || 'Pegawai'} • {p.nip || 'Tanpa NIP'}</p>
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

            {/* Filter and Sort Controls */}
            <div className="flex flex-col gap-3 mb-4">
               <div style={{ position: 'relative' }}>
                  <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Cari nama pegawai..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: '2.5rem', borderRadius: '12px' }}
                  />
               </div>
               <div style={{ position: 'relative' }}>
                  <ArrowUpDown size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <select 
                    className="input" 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    style={{ paddingLeft: '2.5rem', borderRadius: '12px', appearance: 'none' }}
                  >
                     <option value="newest">Paling Baru</option>
                     <option value="oldest">Paling Lama</option>
                     <option value="name-asc">Nama (A - Z)</option>
                     <option value="name-desc">Nama (Z - A)</option>
                  </select>
               </div>
            </div>

            {loadingData ? (
              <p className="text-center text-muted mt-8">Memuat data...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredAbsensi.length === 0 && <p className="text-center text-muted">Data tidak ditemukan.</p>}
                
                {/* Compact List Cards */}
                {filteredAbsensi.map(a => (
                  <div key={a.id} className="card flex items-center justify-between" style={{ padding: '0.8rem 1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                    <div className="flex gap-3 items-center">
                       {a.profiles?.foto_profil ? (
                          <img src={a.profiles.foto_profil} alt="Foto" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                       ) : (
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={24} color="var(--text-muted)" />
                          </div>
                       )}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                           {a.profiles?.full_name || a.profiles?.email?.split('@')[0]}
                         </h4>
                         <p style={{ margin: 0, fontSize: '0.75rem', color: a.status !== 'hadir' && a.status ? '#DC2626' : 'var(--text-muted)' }}>
                           {new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                           {a.status && a.status !== 'hadir' && ` • ${a.status.toUpperCase()}: ${a.keterangan || '-'}`}
                         </p>
                       </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>IN</div>
                         <div style={{ fontWeight: '700', color: '#059669', fontSize: '0.9rem' }}>
                           {new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                         </div>
                      </div>
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>OUT</div>
                         <div style={{ fontWeight: '700', color: a.waktu_pulang ? '#D97706' : '#CBD5E1', fontSize: '0.9rem' }}>
                           {a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                         </div>
                      </div>
                    </div>
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
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Pengaturan Sekolah</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white' }}>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const newName = formData.get('nama_sekolah');
                 
                 const { error } = await supabase.from('settings').upsert({ id: 1, nama_sekolah: newName });
                 if (error) {
                   alert('Gagal menyimpan! (Tabel settings belum dibuat di Supabase)');
                 } else {
                   setNamaSekolah(newName);
                   alert('Pengaturan berhasil disimpan permanen!');
                 }
               }}>
                 <div className="input-group">
                   <label className="input-label">Nama Sekolah / Instansi</label>
                   <input type="text" name="nama_sekolah" className="input" defaultValue={namaSekolah} required />
                 </div>
                 <div className="input-group">
                   <label className="input-label">URL Logo Sekolah (Opsional)</label>
                   <input type="url" className="input" placeholder="https://..." />
                 </div>
                 <div className="input-group">
                   <label className="input-label">Zona Waktu Default</label>
                   <select className="input">
                     <option value="WIB">Waktu Indonesia Barat (WIB)</option>
                     <option value="WITA">Waktu Indonesia Tengah (WITA)</option>
                     <option value="WIT">Waktu Indonesia Timur (WIT)</option>
                   </select>
                 </div>
                 <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '1rem', background: '#F59E0B' }}>
                   Simpan Pengaturan
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
