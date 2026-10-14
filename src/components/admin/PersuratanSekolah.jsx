import React, { useState, useEffect, useRef } from 'react'
import {
  FileText,
  Briefcase,
  UserCheck,
  ArrowRightLeft,
  Navigation,
  Download,
  Printer,
  FileCode,
  Sparkles,
  Settings,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  Building,
  CheckCircle,
  Eye,
  RefreshCw,
  Copy
} from 'lucide-react'
import {
  DEFAULT_KOP_DATA,
  getSuratTugasHtml,
  getSuratRekomendasiHtml,
  getSuratPindahHtml,
  getSppdHtml,
  exportToWordDoc,
  printDocument,
  exportToPdfDirect
} from '../../lib/persuratanGenerator'
import {
  exportSuratTugasDocx,
  exportSuratRekomendasiDocx,
  exportSuratPindahDocx,
  exportSppdDocx
} from '../../lib/persuratanDocx'

// Helper angka bulan romawi
function getRomanMonth(monthIndex) {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
  return roman[monthIndex] || 'X'
}

// Format tanggal Indonesia: 14 Oktober 2026
function formatTanggalIndo(date) {
  const bulan = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const d = date.getDate()
  const m = bulan[date.getMonth()]
  const y = date.getFullYear()
  return `${d} ${m} ${y}`
}

export default function PersuratanSekolah({ pegawaiData = [], darkMode = false }) {
  const [activeDoc, setActiveDoc] = useState('surat_tugas') // 'surat_tugas' | 'rekomendasi' | 'pindah' | 'sppd'
  const [mobileViewTab, setMobileViewTab] = useState('form') // 'form' | 'preview'
  const [showKopSettings, setShowKopSettings] = useState(false)
  const [copiedNotice, setCopiedNotice] = useState(false)
  const [exporting, setExporting] = useState(false)

  // State Kop Surat
  const [kopData, setKopData] = useState(() => {
    const saved = localStorage.getItem('panrita_kop_surat')
    if (saved) {
      try { return JSON.parse(saved) } catch (e) { /* use default */ }
    }
    return DEFAULT_KOP_DATA
  })

  const saveKopData = (newData) => {
    setKopData(newData)
    localStorage.setItem('panrita_kop_surat', JSON.stringify(newData))
  }

  const today = new Date()
  const todayStr = formatTanggalIndo(today)
  const currentMonthRoman = getRomanMonth(today.getMonth())
  const currentYear = today.getFullYear().toString()

  // 1. Data Surat Tugas
  const [suratTugas, setSuratTugas] = useState({
    nomorUrut: '01',
    nomor: `421.2/01/UPTD.SPF.SD.I.T.II/ST/${currentMonthRoman}/${currentYear}`,
    suratDari: 'Dinas Pendidikan Kota Makassar',
    suratNomor: '421.2/089/Disdik/X/2026',
    suratTanggal: todayStr,
    suratPerihal: 'permintaan peserta kegiatan Peningkatan dan Evaluasi Hasil Rapor Pendidikan Jenjang SD',
    pegawaiNama: '',
    pegawaiNip: '',
    pegawaiJabatan: 'Guru Kelas',
    kegiatan: 'Bertugas sebagai peserta kegiatan Peningkatan dan Evaluasi Hasil Rapor Pendidikan Jenjang SD, yang akan dilaksanakan pada :',
    hariTanggal: `Senin, ${todayStr}`,
    tempat: 'Hotel Melia Makassar',
    dikeluarkanDi: 'Makassar',
    tanggalSurat: todayStr,
  })

  // 2. Data Surat Rekomendasi Menerima
  const [rekomendasi, setRekomendasi] = useState({
    nomorUrut: '01',
    nomor: `421.2/01/UPTD.SPF.SD.I.T.II/SR/${currentMonthRoman}/${currentYear}`,
    nama: 'MUHAMMAD RIZKY PRATAMA',
    ttl: 'Makassar, 12 Mei 2018',
    nisn: '0182746192',
    jk: 'Laki-laki',
    agama: 'Islam',
    asalSekolah: 'SD Inpres Daya Kota Makassar',
    kelas: 'Kelas II (Dua)',
    namaOrtu: 'Andi Herman',
    alamat: 'Jl. Pangkep Raya Blok B No. 14 Perumnas Sudiang',
    tahunAjaran: `${currentYear}/${parseInt(currentYear) + 1}`,
    semester: 'Ganjil',
    tanggalSurat: todayStr,
    kota: 'Makassar',
  })

  // 3. Data Surat Pindah
  const [pindah, setPindah] = useState({
    nomorUrut: '01',
    nomor: `421.2/01/UPTD.SPF.SD.I.T.II/SP/${currentMonthRoman}/${currentYear}`,
    nama: 'NUR AISYAH HUMAIRAH',
    nisNisn: '1920042 / 0173928192',
    kelas: 'Kelas IV (Empat)',
    namaOrtu: 'Baharuddin, S.E.',
    pekerjaanOrtu: 'Wiraswasta',
    sekolahTujuan: 'SD Negeri 1 Sungguminasa',
    kecamatanTujuan: 'Somba Opu',
    kabupatenTujuan: 'Gowa',
    provinsiTujuan: 'Sulawesi Selatan',
    alasan: 'mengikuti orang tua yang berpindah domisili tempat kerja',
    tanggalSurat: todayStr,
    kota: 'Makassar',
    nssTujuan: '',
  })

  // 4. Data SPPD
  const [sppd, setSppd] = useState({
    nomorUrut: '01',
    nomor: `421.2/01/UPTD.SPF.SD.I.T.II/SPPD/${currentMonthRoman}/${currentYear}`,
    pejabatPemberi: `Kepala Sekolah ${kopData.sekolah || 'UPTD SPF SD Inpres Tangkala II'}`,
    pegawaiNama: '',
    pegawaiNip: '',
    pangkatGol: 'Penata Muda Tk. I / III/b',
    jabatan: 'Guru Kelas',
    instansi: kopData.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    maksudPerjalanan: 'Mengikuti Bimbingan Teknis dan Evaluasi Hasil Rapor Pendidikan Jenjang SD',
    alatAngkut: 'Kendaraan Pribadi Roda Dua',
    tempatBerangkat: kopData.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    tempatTujuan: 'Hotel Melia Makassar, Jl. Andi Mappanyukki No. 17',
    lamaPerjalanan: '1 (Satu)',
    tanggalBerangkat: todayStr,
    tanggalKembali: todayStr,
    pengikut: '-',
    pembebananInstansi: kopData.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    pembebananMak: 'Anggaran Sekolah (BOS)',
    keteranganLain: 'Surat tugas ini diberikan dan dipergunakan sebagaimana mestinya',
    dikeluarkanDi: 'Makassar',
    tanggalSurat: todayStr,
  })

  // Update nomor ketika nomor urut diubah
  const handleNomorUrutChange = (val, type) => {
    if (type === 'surat_tugas') {
      setSuratTugas(prev => ({
        ...prev,
        nomorUrut: val,
        nomor: `421.2/${val}/UPTD.SPF.SD.I.T.II/ST/${currentMonthRoman}/${currentYear}`
      }))
    } else if (type === 'rekomendasi') {
      setRekomendasi(prev => ({
        ...prev,
        nomorUrut: val,
        nomor: `421.2/${val}/UPTD.SPF.SD.I.T.II/SR/${currentMonthRoman}/${currentYear}`
      }))
    } else if (type === 'pindah') {
      setPindah(prev => ({
        ...prev,
        nomorUrut: val,
        nomor: `421.2/${val}/UPTD.SPF.SD.I.T.II/SP/${currentMonthRoman}/${currentYear}`
      }))
    } else if (type === 'sppd') {
      setSppd(prev => ({
        ...prev,
        nomorUrut: val,
        nomor: `421.2/${val}/UPTD.SPF.SD.I.T.II/SPPD/${currentMonthRoman}/${currentYear}`
      }))
    }
  }

  // Pilih pegawai dari database untuk Surat Tugas / SPPD
  const handlePilihPegawai = (e, targetForm) => {
    const pId = e.target.value
    if (!pId) return
    const p = pegawaiData.find(item => (item.id || item.user_id) === pId)
    if (!p) return

    const nama = p.full_name || p.nama || ''
    const nip = p.nip || ''
    const jab = p.jabatan || 'Guru Kelas'

    if (targetForm === 'surat_tugas') {
      setSuratTugas(prev => ({
        ...prev,
        pegawaiNama: nama,
        pegawaiNip: nip,
        pegawaiJabatan: jab
      }))
    } else if (targetForm === 'sppd') {
      setSppd(prev => ({
        ...prev,
        pegawaiNama: nama,
        pegawaiNip: nip,
        jabatan: jab
      }))
    }
  }

  // Generate Current HTML preview
  const getCurrentHtml = () => {
    switch (activeDoc) {
      case 'surat_tugas':
        return getSuratTugasHtml(suratTugas, kopData)
      case 'rekomendasi':
        return getSuratRekomendasiHtml(rekomendasi, kopData)
      case 'pindah':
        return getSuratPindahHtml(pindah, kopData)
      case 'sppd':
        return getSppdHtml(sppd, kopData)
      default:
        return ''
    }
  }

  const getDocTitle = () => {
    switch (activeDoc) {
      case 'surat_tugas':
        return `Surat_Tugas_${suratTugas.pegawaiNama || 'Guru'}`.replace(/\s+/g, '_')
      case 'rekomendasi':
        return `Surat_Rekomendasi_${rekomendasi.nama || 'Siswa'}`.replace(/\s+/g, '_')
      case 'pindah':
        return `Surat_Pindah_${pindah.nama || 'Siswa'}`.replace(/\s+/g, '_')
      case 'sppd':
        return `SPPD_${sppd.pegawaiNama || 'Guru'}`.replace(/\s+/g, '_')
      default:
        return 'Surat_Resmi'
    }
  }

  // Handlers Unduh
  const handleDownloadDocx = async () => {
    setExporting(true)
    try {
      const title = getDocTitle()
      if (activeDoc === 'surat_tugas') {
        await exportSuratTugasDocx(suratTugas, kopData, title)
      } else if (activeDoc === 'rekomendasi') {
        await exportSuratRekomendasiDocx(rekomendasi, kopData, title)
      } else if (activeDoc === 'pindah') {
        await exportSuratPindahDocx(pindah, kopData, title)
      } else if (activeDoc === 'sppd') {
        await exportSppdDocx(sppd, kopData, title)
      }
    } catch (err) {
      console.error('Error DOCX export:', err)
      // Fallback ke Word (.doc)
      exportToWordDoc(getCurrentHtml(), getDocTitle())
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadWordDoc = () => {
    exportToWordDoc(getCurrentHtml(), getDocTitle())
  }

  const handleDownloadPdf = () => {
    exportToPdfDirect(getCurrentHtml(), getDocTitle())
  }

  const handlePrintPdf = () => {
    printDocument(getCurrentHtml(), getDocTitle())
  }

  const docTabs = [
    { id: 'surat_tugas', label: 'Surat Tugas', icon: Briefcase, color: '#4F46E5' },
    { id: 'rekomendasi', label: 'Surat Rekomendasi Siswa', icon: UserCheck, color: '#10B981' },
    { id: 'pindah', label: 'Surat Pindah Sekolah', icon: ArrowRightLeft, color: '#F59E0B' },
    { id: 'sppd', label: 'SPPD Perjalanan Dinas', icon: Navigation, color: '#0284C7' },
  ]

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '2.5rem' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
        borderRadius: '24px',
        padding: '1.75rem',
        color: 'white',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.25)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <FileText size={30} color="#EEF2FF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '700' }}>Administrasi Persuratan Resmi</h1>
              <span style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '999px'
              }}>Khusus Admin</span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.88rem', opacity: 0.9 }}>
              Input data langsung terbit jadi Surat Tugas, Surat Rekomendasi, Surat Pindah, dan SPPD format resmi Word & PDF.
            </p>
          </div>
        </div>

        {/* Tombol Pengaturan KOP Surat */}
        <button
          onClick={() => setShowKopSettings(!showKopSettings)}
          style={{
            background: showKopSettings ? 'rgba(255,255,255,0.3)' : 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: 'white',
            padding: '0.6rem 1rem',
            borderRadius: '12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          <Settings size={16} />
          <span>Pengaturan Kop & TTD</span>
          {showKopSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Accordion Pengaturan Kop Surat & Tanda Tangan */}
      {showKopSettings && (
        <div style={{
          background: darkMode ? '#1E293B' : '#FFFFFF',
          border: '1px solid var(--border-color)',
          borderRadius: '20px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <Building size={18} color="#4F46E5" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Sesuaikan Identitas Kop Surat & Penandatangan</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Instansi Induk</label>
              <input
                type="text"
                value={kopData.instansiAtas}
                onChange={e => saveKopData({ ...kopData, instansiAtas: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Dinas</label>
              <input
                type="text"
                value={kopData.dinas}
                onChange={e => saveKopData({ ...kopData, dinas: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Satuan Pendidikan (Sekolah)</label>
              <input
                type="text"
                value={kopData.sekolah}
                onChange={e => saveKopData({ ...kopData, sekolah: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Kelurahan & Kecamatan</label>
              <input
                type="text"
                value={kopData.kelurahanKecamatan}
                onChange={e => saveKopData({ ...kopData, kelurahanKecamatan: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Alamat & Kode Pos</label>
              <input
                type="text"
                value={kopData.alamat}
                onChange={e => saveKopData({ ...kopData, alamat: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>NSS & NPSN</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="NSS"
                  value={kopData.nss}
                  onChange={e => saveKopData({ ...kopData, nss: e.target.value })}
                  className="input-field"
                  style={{ width: '50%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
                <input
                  type="text"
                  placeholder="NPSN"
                  value={kopData.npsn}
                  onChange={e => saveKopData({ ...kopData, npsn: e.target.value })}
                  className="input-field"
                  style={{ width: '50%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Kepala Sekolah</label>
              <input
                type="text"
                value={kopData.kepsekNama}
                onChange={e => saveKopData({ ...kopData, kepsekNama: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>NIP Kepala Sekolah</label>
              <input
                type="text"
                value={kopData.kepsekNip}
                onChange={e => saveKopData({ ...kopData, kepsekNip: e.target.value })}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
              />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => saveKopData(DEFAULT_KOP_DATA)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366F1',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
            >
              Kembalikan ke Default Sekolah
            </button>
          </div>
        </div>
      )}

      {/* Tabs Menu 4 Persuratan */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem'
      }}>
        {docTabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeDoc === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveDoc(tab.id)}
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${tab.color} 0%, ${tab.color}DD 100%)`
                  : (darkMode ? '#1E293B' : '#FFFFFF'),
                color: isActive ? '#FFFFFF' : (darkMode ? '#F1F5F9' : '#1E293B'),
                border: isActive ? 'none' : '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: isActive ? '0 8px 20px -4px rgba(0,0,0,0.15)' : 'none',
                transition: 'all 0.2s transform'
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: isActive ? 'rgba(255,255,255,0.2)' : `${tab.color}15`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={20} color={isActive ? '#FFFFFF' : tab.color} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: '700' }}>{tab.label}</div>
                <div style={{ fontSize: '0.72rem', opacity: isActive ? 0.9 : 0.6 }}>Isi & Unduh Berkas</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Mobile Switcher (Input Form vs Preview Surat) */}
      <div className="md:hidden" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setMobileViewTab('form')}
          style={{
            flex: 1,
            padding: '0.6rem',
            borderRadius: '10px',
            border: 'none',
            background: mobileViewTab === 'form' ? '#4F46E5' : 'var(--bg-card)',
            color: mobileViewTab === 'form' ? '#fff' : 'inherit',
            fontWeight: '600',
            fontSize: '0.85rem'
          }}
        >
          Formulir Input
        </button>
        <button
          onClick={() => setMobileViewTab('preview')}
          style={{
            flex: 1,
            padding: '0.6rem',
            borderRadius: '10px',
            border: 'none',
            background: mobileViewTab === 'preview' ? '#4F46E5' : 'var(--bg-card)',
            color: mobileViewTab === 'preview' ? '#fff' : 'inherit',
            fontWeight: '600',
            fontSize: '0.85rem'
          }}
        >
          Pratinjau Surat
        </button>
      </div>

      {/* Main Grid: Form di Kiri, Live Preview di Kanan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* ============================================================== */}
        {/* FORMULIR INPUT (SISI KIRI) */}
        {/* ============================================================== */}
        <div style={{
          display: mobileViewTab === 'form' ? 'block' : 'none',
          background: darkMode ? '#1E293B' : '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid var(--border-color)',
          padding: '1.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)'
        }} className="md:!block">
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileCode size={20} color="#4F46E5" />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
                {activeDoc === 'surat_tugas' && 'Input Surat Tugas'}
                {activeDoc === 'rekomendasi' && 'Input Surat Rekomendasi Siswa'}
                {activeDoc === 'pindah' && 'Input Surat Pindah Sekolah'}
                {activeDoc === 'sppd' && 'Input SPPD Perjalanan Dinas'}
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Otomatis tersinkron ke preview</span>
          </div>

          {/* ----------------- 1. FORM SURAT TUGAS ----------------- */}
          {activeDoc === 'surat_tugas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nomor Surat Tugas</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="No. Urut (01)"
                    value={suratTugas.nomorUrut}
                    onChange={e => handleNomorUrutChange(e.target.value, 'surat_tugas')}
                    style={{ width: '80px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <input
                    type="text"
                    value={suratTugas.nomor}
                    onChange={e => setSuratTugas({ ...suratTugas, nomor: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Dasar Penugasan */}
              <div style={{ background: darkMode ? '#0F172A' : '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem', color: '#4F46E5' }}>Dasar Penugasan</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Berdasarkan Surat dari</label>
                    <input
                      type="text"
                      value={suratTugas.suratDari}
                      onChange={e => setSuratTugas({ ...suratTugas, suratDari: e.target.value })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Nomor Surat Dasar</label>
                      <input
                        type="text"
                        value={suratTugas.suratNomor}
                        onChange={e => setSuratTugas({ ...suratTugas, suratNomor: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Tanggal Surat Dasar</label>
                      <input
                        type="text"
                        value={suratTugas.suratTanggal}
                        onChange={e => setSuratTugas({ ...suratTugas, suratTanggal: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Perihal Surat Dasar</label>
                    <input
                      type="text"
                      value={suratTugas.suratPerihal}
                      onChange={e => setSuratTugas({ ...suratTugas, suratPerihal: e.target.value })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Pegawai yang ditugaskan */}
              <div style={{ background: darkMode ? '#0F172A' : '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#4F46E5' }}>Pegawai yang Ditugaskan</span>
                  {pegawaiData.length > 0 && (
                    <select
                      onChange={e => handlePilihPegawai(e, 'surat_tugas')}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #6366F1' }}
                    >
                      <option value="">-- Ambil dari Daftar Guru --</option>
                      {pegawaiData.map(p => (
                        <option key={p.id || p.user_id} value={p.id || p.user_id}>
                          {p.full_name || p.nama} ({p.jabatan || 'Guru'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Nama Pegawai</label>
                    <input
                      type="text"
                      value={suratTugas.pegawaiNama}
                      onChange={e => setSuratTugas({ ...suratTugas, pegawaiNama: e.target.value })}
                      placeholder="Nama Lengkap & Gelar"
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>NIP (Bila ada)</label>
                      <input
                        type="text"
                        value={suratTugas.pegawaiNip}
                        onChange={e => setSuratTugas({ ...suratTugas, pegawaiNip: e.target.value })}
                        placeholder="NIP"
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Jabatan</label>
                      <input
                        type="text"
                        value={suratTugas.pegawaiJabatan}
                        onChange={e => setSuratTugas({ ...suratTugas, pegawaiJabatan: e.target.value })}
                        placeholder="Guru Kelas / Mapel"
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rincian Tugas & Pelaksanaan */}
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Deskripsi Tugas</label>
                <textarea
                  rows={2}
                  value={suratTugas.kegiatan}
                  onChange={e => setSuratTugas({ ...suratTugas, kegiatan: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Hari / Tanggal Pelaksanaan</label>
                  <input
                    type="text"
                    value={suratTugas.hariTanggal}
                    onChange={e => setSuratTugas({ ...suratTugas, hariTanggal: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tempat Pelaksanaan</label>
                  <input
                    type="text"
                    value={suratTugas.tempat}
                    onChange={e => setSuratTugas({ ...suratTugas, tempat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Dikeluarkan di</label>
                  <input
                    type="text"
                    value={suratTugas.dikeluarkanDi}
                    onChange={e => setSuratTugas({ ...suratTugas, dikeluarkanDi: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tanggal Surat</label>
                  <input
                    type="text"
                    value={suratTugas.tanggalSurat}
                    onChange={e => setSuratTugas({ ...suratTugas, tanggalSurat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ----------------- 2. FORM SURAT REKOMENDASI ----------------- */}
          {activeDoc === 'rekomendasi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nomor Surat Rekomendasi</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="No. Urut (01)"
                    value={rekomendasi.nomorUrut}
                    onChange={e => handleNomorUrutChange(e.target.value, 'rekomendasi')}
                    style={{ width: '80px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <input
                    type="text"
                    value={rekomendasi.nomor}
                    onChange={e => setRekomendasi({ ...rekomendasi, nomor: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Lengkap Siswa</label>
                <input
                  type="text"
                  value={rekomendasi.nama}
                  onChange={e => setRekomendasi({ ...rekomendasi, nama: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tempat / Tanggal Lahir</label>
                  <input
                    type="text"
                    value={rekomendasi.ttl}
                    onChange={e => setRekomendasi({ ...rekomendasi, ttl: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>NISN Siswa</label>
                  <input
                    type="text"
                    value={rekomendasi.nisn}
                    onChange={e => setRekomendasi({ ...rekomendasi, nisn: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Jenis Kelamin</label>
                  <select
                    value={rekomendasi.jk}
                    onChange={e => setRekomendasi({ ...rekomendasi, jk: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Agama</label>
                  <input
                    type="text"
                    value={rekomendasi.agama}
                    onChange={e => setRekomendasi({ ...rekomendasi, agama: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Asal Sekolah</label>
                  <input
                    type="text"
                    value={rekomendasi.asalSekolah}
                    onChange={e => setRekomendasi({ ...rekomendasi, asalSekolah: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Diterima di Kelas</label>
                  <input
                    type="text"
                    value={rekomendasi.kelas}
                    onChange={e => setRekomendasi({ ...rekomendasi, kelas: e.target.value })}
                    placeholder="Kelas II (Dua)"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Orang Tua / Wali</label>
                <input
                  type="text"
                  value={rekomendasi.namaOrtu}
                  onChange={e => setRekomendasi({ ...rekomendasi, namaOrtu: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Alamat Siswa</label>
                <input
                  type="text"
                  value={rekomendasi.alamat}
                  onChange={e => setRekomendasi({ ...rekomendasi, alamat: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tahun Pelajaran</label>
                  <input
                    type="text"
                    value={rekomendasi.tahunAjaran}
                    onChange={e => setRekomendasi({ ...rekomendasi, tahunAjaran: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Semester</label>
                  <select
                    value={rekomendasi.semester}
                    onChange={e => setRekomendasi({ ...rekomendasi, semester: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="Ganjil">Ganjil</option>
                    <option value="Genap">Genap</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Kota Penandatangan</label>
                  <input
                    type="text"
                    value={rekomendasi.kota}
                    onChange={e => setRekomendasi({ ...rekomendasi, kota: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tanggal Surat</label>
                  <input
                    type="text"
                    value={rekomendasi.tanggalSurat}
                    onChange={e => setRekomendasi({ ...rekomendasi, tanggalSurat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ----------------- 3. FORM SURAT PINDAH ----------------- */}
          {activeDoc === 'pindah' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nomor Surat Pindah</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="No. Urut (01)"
                    value={pindah.nomorUrut}
                    onChange={e => handleNomorUrutChange(e.target.value, 'pindah')}
                    style={{ width: '80px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <input
                    type="text"
                    value={pindah.nomor}
                    onChange={e => setPindah({ ...pindah, nomor: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Siswa</label>
                <input
                  type="text"
                  value={pindah.nama}
                  onChange={e => setPindah({ ...pindah, nama: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>NIS / NISN</label>
                  <input
                    type="text"
                    value={pindah.nisNisn}
                    onChange={e => setPindah({ ...pindah, nisNisn: e.target.value })}
                    placeholder="Nomor Induk / NISN"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Kelas / Tingkat</label>
                  <input
                    type="text"
                    value={pindah.kelas}
                    onChange={e => setPindah({ ...pindah, kelas: e.target.value })}
                    placeholder="Kelas IV (Empat)"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nama Orang Tua / Wali</label>
                  <input
                    type="text"
                    value={pindah.namaOrtu}
                    onChange={e => setPindah({ ...pindah, namaOrtu: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Pekerjaan Orang Tua</label>
                  <input
                    type="text"
                    value={pindah.pekerjaanOrtu}
                    onChange={e => setPindah({ ...pindah, pekerjaanOrtu: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Sekolah Tujuan */}
              <div style={{ background: darkMode ? '#0F172A' : '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem', color: '#F59E0B' }}>Data Sekolah Tujuan</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Nama Sekolah Tujuan</label>
                    <input
                      type="text"
                      value={pindah.sekolahTujuan}
                      onChange={e => setPindah({ ...pindah, sekolahTujuan: e.target.value })}
                      placeholder="Contoh: SD Negeri 1 Sungguminasa"
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Kecamatan Tujuan</label>
                      <input
                        type="text"
                        value={pindah.kecamatanTujuan}
                        onChange={e => setPindah({ ...pindah, kecamatanTujuan: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Kab./Kota Tujuan</label>
                      <input
                        type="text"
                        value={pindah.kabupatenTujuan}
                        onChange={e => setPindah({ ...pindah, kabupatenTujuan: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Provinsi Tujuan</label>
                    <input
                      type="text"
                      value={pindah.provinsiTujuan}
                      onChange={e => setPindah({ ...pindah, provinsiTujuan: e.target.value })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Alasan Pindah</label>
                <input
                  type="text"
                  value={pindah.alasan}
                  onChange={e => setPindah({ ...pindah, alasan: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Kota Penandatangan</label>
                  <input
                    type="text"
                    value={pindah.kota}
                    onChange={e => setPindah({ ...pindah, kota: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tanggal Surat</label>
                  <input
                    type="text"
                    value={pindah.tanggalSurat}
                    onChange={e => setPindah({ ...pindah, tanggalSurat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ----------------- 4. FORM SPPD ----------------- */}
          {activeDoc === 'sppd' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Nomor SPPD</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="No. Urut (01)"
                    value={sppd.nomorUrut}
                    onChange={e => handleNomorUrutChange(e.target.value, 'sppd')}
                    style={{ width: '80px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                  <input
                    type="text"
                    value={sppd.nomor}
                    onChange={e => setSppd({ ...sppd, nomor: e.target.value })}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              {/* Pegawai yang diperintahkan */}
              <div style={{ background: darkMode ? '#0F172A' : '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0284C7' }}>Pegawai yang Diperintahkan</span>
                  {pegawaiData.length > 0 && (
                    <select
                      onChange={e => handlePilihPegawai(e, 'sppd')}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #0284C7' }}
                    >
                      <option value="">-- Ambil dari Daftar Guru --</option>
                      {pegawaiData.map(p => (
                        <option key={p.id || p.user_id} value={p.id || p.user_id}>
                          {p.full_name || p.nama} ({p.jabatan || 'Guru'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Nama Pegawai</label>
                    <input
                      type="text"
                      value={sppd.pegawaiNama}
                      onChange={e => setSppd({ ...sppd, pegawaiNama: e.target.value })}
                      placeholder="Nama Pegawai"
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>NIP Pegawai</label>
                      <input
                        type="text"
                        value={sppd.pegawaiNip}
                        onChange={e => setSppd({ ...sppd, pegawaiNip: e.target.value })}
                        placeholder="NIP Pegawai"
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Pangkat / Golongan</label>
                      <input
                        type="text"
                        value={sppd.pangkatGol}
                        onChange={e => setSppd({ ...sppd, pangkatGol: e.target.value })}
                        placeholder="Penata Muda Tk. I / III/b"
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Jabatan</label>
                      <input
                        type="text"
                        value={sppd.jabatan}
                        onChange={e => setSppd({ ...sppd, jabatan: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Instansi</label>
                      <input
                        type="text"
                        value={sppd.instansi}
                        onChange={e => setSppd({ ...sppd, instansi: e.target.value })}
                        style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Maksud Perjalanan Dinas</label>
                <textarea
                  rows={2}
                  value={sppd.maksudPerjalanan}
                  onChange={e => setSppd({ ...sppd, maksudPerjalanan: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Alat Angkutan</label>
                  <input
                    type="text"
                    value={sppd.alatAngkut}
                    onChange={e => setSppd({ ...sppd, alatAngkut: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tempat Tujuan</label>
                  <input
                    type="text"
                    value={sppd.tempatTujuan}
                    onChange={e => setSppd({ ...sppd, tempatTujuan: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Lama (Hari)</label>
                  <input
                    type="text"
                    value={sppd.lamaPerjalanan}
                    onChange={e => setSppd({ ...sppd, lamaPerjalanan: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tgl Berangkat</label>
                  <input
                    type="text"
                    value={sppd.tanggalBerangkat}
                    onChange={e => setSppd({ ...sppd, tanggalBerangkat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tgl Kembali</label>
                  <input
                    type="text"
                    value={sppd.tanggalKembali}
                    onChange={e => setSppd({ ...sppd, tanggalKembali: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Pengikut</label>
                  <input
                    type="text"
                    value={sppd.pengikut}
                    onChange={e => setSppd({ ...sppd, pengikut: e.target.value })}
                    placeholder="-"
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Pembebanan Anggaran (MAK)</label>
                  <input
                    type="text"
                    value={sppd.pembebananMak}
                    onChange={e => setSppd({ ...sppd, pembebananMak: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Dikeluarkan di</label>
                  <input
                    type="text"
                    value={sppd.dikeluarkanDi}
                    onChange={e => setSppd({ ...sppd, dikeluarkanDi: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Tanggal Surat</label>
                  <input
                    type="text"
                    value={sppd.tanggalSurat}
                    onChange={e => setSppd({ ...sppd, tanggalSurat: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* LIVE PREVIEW & TOOLBAR UNDUH (SISI KANAN) */}
        {/* ============================================================== */}
        <div style={{
          display: mobileViewTab === 'preview' ? 'block' : 'none'
        }} className="md:!block">
          
          {/* Action Toolbar */}
          <div style={{
            background: darkMode ? '#1E293B' : '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 15px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Eye size={18} color="#4F46E5" />
              <span style={{ fontSize: '0.88rem', fontWeight: '700' }}>Pratinjau Surat Resmi</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {/* Tombol Unduh DOCX */}
              <button
                onClick={handleDownloadDocx}
                disabled={exporting}
                style={{
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                }}
              >
                <Download size={15} />
                <span>Unduh Word (.docx)</span>
              </button>

              {/* Tombol Unduh DOC HTML */}
              <button
                onClick={handleDownloadWordDoc}
                style={{
                  background: darkMode ? '#334155' : '#EEF2FF',
                  color: darkMode ? '#F8FAFC' : '#4338CA',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: '600'
                }}
              >
                <FileText size={15} />
                <span>Word (.doc)</span>
              </button>

              {/* Tombol Unduh PDF Direct */}
              <button
                onClick={handleDownloadPdf}
                style={{
                  background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  boxShadow: '0 4px 10px rgba(220, 38, 38, 0.25)'
                }}
              >
                <Download size={15} />
                <span>Unduh PDF</span>
              </button>

              {/* Tombol Cetak / Print PDF */}
              <button
                onClick={handlePrintPdf}
                style={{
                  background: darkMode ? '#334155' : '#F1F5F9',
                  color: darkMode ? '#F8FAFC' : '#1E293B',
                  border: '1px solid var(--border-color)',
                  padding: '0.55rem 0.9rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.82rem',
                  fontWeight: '600'
                }}
              >
                <Printer size={15} />
                <span>Cetak / Print PDF</span>
              </button>
            </div>
          </div>

          {/* Realistic A4 Paper Preview Container */}
          <div style={{
            background: darkMode ? '#0F172A' : '#E2E8F0',
            padding: '1.25rem',
            borderRadius: '20px',
            overflowX: 'auto',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <div
              id="persuratan-printable-content"
              style={{
                width: '100%',
                maxWidth: '750px',
                minHeight: '850px',
                background: '#FFFFFF',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                padding: '2rem 2.25rem',
                borderRadius: '4px',
                boxSizing: 'border-box'
              }}
              dangerouslySetInnerHTML={{ __html: getCurrentHtml() }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
