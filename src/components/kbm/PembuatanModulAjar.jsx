import { useState, useEffect } from 'react'
import { 
  Sparkles, BookOpen, Download, Printer, Copy, Check, 
  Trash2, Plus, RefreshCw, FileText, ChevronRight, AlertCircle, 
  School, Calendar, Clock, Award, Layers, HelpCircle, CheckCircle2,
  Users, Sliders, ExternalLink, ArrowLeft, Eye
} from 'lucide-react'
import { generateModulAjarAI, getSavedGeminiKey, loadSavedGeminiKeyAsync, saveGeminiKey } from '../../lib/gemini'
import { exportModulAjarToWord, printModulAjar } from '../../lib/modulAjarExport'

export default function PembuatanModulAjar({ user, profile, schoolName, supabase, onBack }) {
  const [apiKey, setApiKey] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [activeTab, setActiveTab] = useState('generator') // 'generator' | 'preview' | 'history'

  // Input State
  const [namaGuru, setNamaGuru] = useState(profile?.full_name || 'Budianto, S.Pd., Gr.')
  const [sekolah, setSekolah] = useState(schoolName || 'UPTD SPF SD Inpres Tangkala II')
  const [tahunPelajaran, setTahunPelajaran] = useState('2026/2027')
  const [semester, setSemester] = useState('1 (Satu)')
  const [mataPelajaran, setMataPelajaran] = useState('Bahasa Indonesia')
  const [kelas, setKelas] = useState('Kelas 5')
  const [fase, setFase] = useState('Fase C')
  const [topik, setTopik] = useState('Bab 1: Aku yang Unik')
  const [elemen, setElemen] = useState('Membaca dan Memirsa | Menulis dan Mempresentasikan')
  const [alokasiWaktu, setAlokasiWaktu] = useState('2 Pertemuan × 3 × 35 Menit')
  const [model, setModel] = useState('PBL (Problem Based Learning)')
  const [catatanTambahan, setCatatanTambahan] = useState('')
  const [jumlahSesi, setJumlahSesi] = useState(2)

  // Status & Hasil AI
  const [generating, setGenerating] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [currentModul, setCurrentModul] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [copied, setCopied] = useState(false)

  // Riwayat Modul Tersimpan
  const [savedModuls, setSavedModuls] = useState([])

  const storageKey = `panrita_modul_ajar_history_${user?.id || 'guest'}`

  useEffect(() => {
    // Ambil API Key Gemini
    const uId = user?.id || profile?.id
    loadSavedGeminiKeyAsync(uId, user, profile).then(k => {
      if (k) {
        setApiKey(k)
        setApiKeyInput(k)
      }
    })

    // Ambil Riwayat dari LocalStorage
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setSavedModuls(parsed)
      }
    } catch (e) {}

    // Auto-update nama guru & sekolah dari prop jika ada
    if (profile?.full_name) setNamaGuru(profile.full_name)
    if (schoolName) setSekolah(schoolName)
  }, [user, profile, schoolName])

  // Sinkronisasi Fase otomatis berdasarkan pilihan Kelas
  const handleKelasChange = (newKelas) => {
    setKelas(newKelas)
    if (['Kelas 1', 'Kelas 2'].includes(newKelas)) setFase('Fase A')
    else if (['Kelas 3', 'Kelas 4'].includes(newKelas)) setFase('Fase B')
    else if (['Kelas 5', 'Kelas 6'].includes(newKelas)) setFase('Fase C')
  }

  // Simpan Modul ke Riwayat
  const saveToHistory = (modulData) => {
    try {
      const newItem = {
        id: 'MODUL-' + Date.now(),
        createdAt: new Date().toISOString(),
        data: modulData
      }
      const updated = [newItem, ...savedModuls.filter(m => m.data?.identifikasi?.topikElemen !== modulData.identifikasi?.topikElemen)]
      setSavedModuls(updated)
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch (e) {
      console.warn('Gagal menyimpan ke riwayat modul:', e)
    }
  }

  // Hapus dari riwayat
  const handleDeleteHistory = (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Hapus modul ajar ini dari riwayat?')) return
    const filtered = savedModuls.filter(m => m.id !== id)
    setSavedModuls(filtered)
    localStorage.setItem(storageKey, JSON.stringify(filtered))
  }

  // Handle Generate AI
  const handleGenerate = async (e) => {
    e?.preventDefault()
    setErrorMsg(null)

    if (!apiKey || !apiKey.trim()) {
      setShowKeyModal(true)
      return
    }

    if (!topik.trim()) {
      setErrorMsg('Silakan masukkan Topik / Bab Pembelajaran.')
      return
    }

    setGenerating(true)
    setProgressStep(1)

    const timer1 = setTimeout(() => setProgressStep(2), 2500)
    const timer2 = setTimeout(() => setProgressStep(3), 5500)
    const timer3 = setTimeout(() => setProgressStep(4), 9000)

    try {
      const res = await generateModulAjarAI({
        apiKey,
        inputData: {
          namaGuru,
          namaSekolah: sekolah,
          tahunPelajaran,
          semester,
          mataPelajaran,
          kelas,
          fase,
          topik,
          elemen,
          alokasiWaktu,
          model,
          catatanTambahan,
          jumlahSesi: Number(jumlahSesi) || 2
        }
      })

      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)

      if (res && res.data) {
        setCurrentModul(res.data)
        saveToHistory(res.data)
        setActiveTab('preview')
      } else {
        throw new Error('AI tidak mengembalikan data modul ajar yang valid.')
      }
    } catch (err) {
      console.error('Error generate modul ajar:', err)
      setErrorMsg(err.message || 'Terjadi kesalahan saat menyusun Modul Ajar dengan AI. Silakan coba kembali.')
    } finally {
      setGenerating(false)
      setProgressStep(0)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return
    const clean = apiKeyInput.trim()
    setApiKey(clean)
    await saveGeminiKey(clean, user?.id || profile?.id, supabase)
    setShowKeyModal(false)
  }

  const handleCopySummary = () => {
    if (!currentModul) return
    const iden = currentModul.identifikasi || {}
    const text = `*${currentModul.judul || 'MODUL AJAR DEEP LEARNING'}*\n\nMapel: ${iden.mataPelajaran}\nKelas/Fase: ${iden.kelasFase}\nTopik: ${iden.topikElemen}\nAlokasi: ${iden.alokasiWaktu}\nPenyusun: ${iden.penyusun}\n\n*Tujuan Pembelajaran:*\n${(currentModul.desainPembelajaran?.tujuanPembelajaran || []).join('\n')}\n\n*Pendekatan:* Deep Learning (Berkesadaran, Bermakna, Menggembirakan)`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="modul-ajar-container" style={{ padding: '0 0.5rem 2rem 0.5rem' }}>
      
      {/* 1. Header Card Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
        borderRadius: '20px',
        padding: '1.75rem',
        color: 'white',
        marginBottom: '1.5rem',
        boxShadow: '0 10px 25px -5px rgba(67, 56, 202, 0.25)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {onBack && (
                <button 
                  onClick={onBack}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '10px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <ArrowLeft size={16} /> Kembali
                </button>
              )}
              <span style={{ 
                background: 'rgba(255,255,255,0.15)', 
                backdropFilter: 'blur(8px)',
                padding: '4px 12px', 
                borderRadius: '20px', 
                fontSize: '0.75rem', 
                fontWeight: '600',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <Sparkles size={14} color="#FBBF24" /> Inovasi Kurikulum Merdeka
              </span>
            </div>

            <button
              onClick={() => setShowKeyModal(true)}
              style={{
                background: apiKey ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.25)',
                border: apiKey ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.5)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {apiKey ? (
                <>
                  <CheckCircle2 size={14} color="#34D399" />
                  <span>AI Siap Digunakan</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} color="#F87171" />
                  <span>Atur API Key AI</span>
                </>
              )}
            </button>
          </div>

          <h2 style={{ fontSize: '1.45rem', fontWeight: '800', margin: '0 0 0.4rem 0', letterSpacing: '-0.02em' }}>
            Pembuatan Modul Ajar AI (Deep Learning)
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#E0E7FF', maxWidth: '750px', margin: 0, lineHeight: 1.5 }}>
            Menyusun Rencana Pembelajaran Mendalam (RPM) lengkap sesuai format resmi sekolah. Dilengkapi skenario 3 Prinsip Deep Learning (Berkesadaran, Bermakna, Menggembirakan), LKPD, rubrik penilaian, dan materi ajar siap cetak.
          </p>
        </div>

        {/* Ambient Decorative Glow */}
        <div style={{ position: 'absolute', right: '-40px', bottom: '-40px', width: '220px', height: '220px', background: 'radial-gradient(circle, rgba(129,140,248,0.3) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%' }} />
      </div>

      {/* 2. Navigasi Tab */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('generator')}
          style={{
            background: activeTab === 'generator' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'generator' ? 'white' : 'var(--text-muted)',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '10px',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s'
          }}
        >
          <Sparkles size={16} /> Buat Modul Baru
        </button>

        {currentModul && (
          <button
            onClick={() => setActiveTab('preview')}
            style={{
              background: activeTab === 'preview' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'preview' ? 'white' : 'var(--text-muted)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <Eye size={16} /> Preview & Unduh
          </button>
        )}

        <button
          onClick={() => setActiveTab('history')}
          style={{
            background: activeTab === 'history' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'history' ? 'white' : 'var(--text-muted)',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '10px',
            fontWeight: '600',
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
            marginLeft: 'auto'
          }}
        >
          <Layers size={16} /> Riwayat Tersimpan ({savedModuls.length})
        </button>
      </div>

      {/* 3. Konten Tab 1: Form Generator Modul Ajar AI */}
      {activeTab === 'generator' && (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '1.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          {errorMsg && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '12px', padding: '0.9rem 1.2rem', marginBottom: '1.25rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleGenerate}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.2rem', marginBottom: '1.2rem' }}>
              
              {/* Mata Pelajaran */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Mata Pelajaran
                </label>
                <select
                  value={mataPelajaran}
                  onChange={(e) => setMataPelajaran(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                >
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Matematika">Matematika</option>
                  <option value="Ilmu Pengetahuan Alam dan Sosial (IPAS)">IPAS (Ilmu Pengetahuan Alam & Sosial)</option>
                  <option value="Pendidikan Pancasila (PPKn)">Pendidikan Pancasila (PPKn)</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="Pendidikan Agama & Budi Pekerti">Pendidikan Agama & Budi Pekerti</option>
                  <option value="Seni Rupa">Seni Rupa</option>
                  <option value="Seni Musik">Seni Musik</option>
                  <option value="PJOK">PJOK (Penjasorkes)</option>
                </select>
              </div>

              {/* Kelas & Fase */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Kelas & Fase Capaian
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    value={kelas}
                    onChange={(e) => handleKelasChange(e.target.value)}
                    style={{ flex: 1, padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                  >
                    <option value="Kelas 1">Kelas 1</option>
                    <option value="Kelas 2">Kelas 2</option>
                    <option value="Kelas 3">Kelas 3</option>
                    <option value="Kelas 4">Kelas 4</option>
                    <option value="Kelas 5">Kelas 5</option>
                    <option value="Kelas 6">Kelas 6</option>
                  </select>
                  <input
                    type="text"
                    value={fase}
                    readOnly
                    style={{ width: '90px', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--border)', color: 'var(--text)', fontSize: '0.875rem', fontWeight: 'bold', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Topik / Bab Pembelajaran */}
              <div style={{ gridColumn: 'span 1' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Bab / Topik Pembelajaran <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Contoh: Bab 1: Aku yang Unik / Pecahan Senilai"
                  required
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                />
              </div>

              {/* Elemen Capaian */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Elemen Capaian Pembelajaran
                </label>
                <input
                  type="text"
                  value={elemen}
                  onChange={(e) => setElemen(e.target.value)}
                  placeholder="Contoh: Membaca dan Memirsa | Menulis"
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                />
              </div>

              {/* Model Pembelajaran */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Model Pembelajaran
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                >
                  <option value="PBL (Problem Based Learning)">PBL (Problem Based Learning)</option>
                  <option value="PjBL (Project Based Learning)">PjBL (Project Based Learning)</option>
                  <option value="Discovery Learning">Discovery Learning</option>
                  <option value="Inquiry Learning">Inquiry Learning (Inkuiri)</option>
                  <option value="Cooperative Learning">Cooperative Learning</option>
                </select>
              </div>

              {/* Alokasi Waktu & Sesi */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Alokasi Waktu & Jumlah Sesi Skenario
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={alokasiWaktu}
                    onChange={(e) => setAlokasiWaktu(e.target.value)}
                    placeholder="2 Pertemuan × 3 × 35 Menit"
                    style={{ flex: 1, padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                  />
                  <select
                    value={jumlahSesi}
                    onChange={(e) => setJumlahSesi(e.target.value)}
                    style={{ width: '90px', padding: '0.65rem 0.5rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem', fontWeight: 'bold' }}
                  >
                    <option value={1}>1 Sesi</option>
                    <option value={2}>2 Sesi</option>
                    <option value={3}>3 Sesi</option>
                    <option value={4}>4 Sesi</option>
                  </select>
                </div>
              </div>

              {/* Satuan Pendidikan & Guru */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Satuan Pendidikan
                </label>
                <input
                  type="text"
                  value={sekolah}
                  onChange={(e) => setSekolah(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Nama Guru Penyusun
                </label>
                <input
                  type="text"
                  value={namaGuru}
                  onChange={(e) => setNamaGuru(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem' }}
                />
              </div>

            </div>

            {/* Catatan Khusus Guru (Opsional) */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                Instruksi / Catatan Khusus untuk AI (Opsional)
              </label>
              <textarea
                value={catatanTambahan}
                onChange={(e) => setCatatanTambahan(e.target.value)}
                placeholder="Contoh: Sertakan aktivitas permainan tebak kata, gunakan media digital Canva/Quizizz, atau fokuskan pada pengenalan teks deskripsi tokoh."
                rows={2}
                style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '0.875rem', resize: 'vertical' }}
              />
            </div>

            {/* Tombol Eksekusi AI */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>Format Standar Rencana Pembelajaran Mendalam (RPM) Kurikulum Merdeka</span>
              </div>

              <button
                type="submit"
                disabled={generating}
                style={{
                  background: generating ? '#9CA3AF' : 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                  color: 'white',
                  padding: '12px 28px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: generating ? 'none' : '0 6px 16px rgba(79, 70, 229, 0.35)',
                  transition: 'all 0.2s'
                }}
              >
                {generating ? (
                  <>
                    <RefreshCw size={18} className="spin" />
                    <span>AI Sedang Menyusun Dokumen...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} color="#FBBF24" />
                    <span>Buat Modul Ajar dengan AI</span>
                  </>
                )}
              </button>
            </div>

            {/* Progress Status saat AI Berjalan */}
            {generating && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
                  <div style={{ width: '20px', height: '20px', border: '3px solid #E2E8F0', borderTopColor: '#4F46E5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B' }}>
                    {progressStep === 1 && 'Langkah 1/4: Mengidentifikasi Capaian Pembelajaran & Profil Lulusan...'}
                    {progressStep === 2 && 'Langkah 2/4: Merancang Skenario Deep Learning (Berkesadaran, Bermakna, Menggembirakan)...'}
                    {progressStep === 3 && 'Langkah 3/4: Menyusun Asesmen Diagnostik, Formatif, dan Soal HOTS...'}
                    {progressStep >= 4 && 'Langkah 4/4: Melengkapi LKPD Murid, Refleksi, dan Glosarium...'}
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(progressStep * 25, 95)}%`, height: '100%', background: '#4F46E5', transition: 'width 0.8s ease' }} />
                </div>
              </div>
            )}

          </form>
        </div>
      )}

      {/* 4. Konten Tab 2: Preview & Unduh Modul Ajar */}
      {activeTab === 'preview' && currentModul && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Action Bar */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: '14px',
            border: '1px solid var(--border)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={20} color="#10B981" />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                  {currentModul.identifikasi?.topikElemen || currentModul.judul}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {currentModul.identifikasi?.mataPelajaran} • {currentModul.identifikasi?.kelasFase}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleCopySummary}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {copied ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
                <span>{copied ? 'Tersalin' : 'Salin Info'}</span>
              </button>

              <button
                onClick={() => printModulAjar(currentModul)}
                style={{
                  background: '#0284C7',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={16} />
                <span>Cetak / Simpan PDF</span>
              </button>

              <button
                onClick={() => exportModulAjarToWord(currentModul)}
                style={{
                  background: '#2563EB',
                  border: 'none',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                }}
              >
                <Download size={16} />
                <span>Unduh Word (.doc)</span>
              </button>
            </div>
          </div>

          {/* Dokumen Tampilan Lengkap */}
          <div style={{
            background: 'var(--surface)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '2rem',
            boxShadow: '0 6px 20px rgba(0,0,0,0.04)',
            lineHeight: 1.6
          }}>
            
            {/* Kop Dokumen */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid var(--border)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--primary)', background: 'var(--primary-light)', padding: '4px 10px', borderRadius: '12px' }}>
                KURIKULUM MERDEKA - DEEP LEARNING
              </span>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: '0.75rem 0 0.25rem 0', textTransform: 'uppercase' }}>
                {currentModul.judul || 'RENCANA PEMBELAJARAN MENDALAM (RPM)'}
              </h2>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                {currentModul.identifikasi?.sekolah}
              </div>
            </div>

            {/* Bagian A: IDENTIFIKASI */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                A. IDENTIFIKASI
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem', background: 'var(--bg)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem' }}>
                <div><strong>Penyusun:</strong> {currentModul.identifikasi?.penyusun}</div>
                <div><strong>Satuan Pendidikan:</strong> {currentModul.identifikasi?.sekolah}</div>
                <div><strong>Tahun Pelajaran:</strong> {currentModul.identifikasi?.tahunPelajaran}</div>
                <div><strong>Semester:</strong> {currentModul.identifikasi?.semester}</div>
                <div><strong>Mata Pelajaran:</strong> {currentModul.identifikasi?.mataPelajaran}</div>
                <div><strong>Kelas / Fase:</strong> {currentModul.identifikasi?.kelasFase}</div>
                <div><strong>Topik / Elemen:</strong> {currentModul.identifikasi?.topikElemen}</div>
                <div><strong>Alokasi Waktu:</strong> {currentModul.identifikasi?.alokasiWaktu}</div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Pengetahuan Awal:</strong>
                <ul style={{ margin: '0.3rem 0 0 1.25rem', padding: 0 }}>
                  {(currentModul.identifikasi?.pengetahuanAwal || []).map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Minat Belajar:</strong>
                <ul style={{ margin: '0.3rem 0 0 1.25rem', padding: 0 }}>
                  {(currentModul.identifikasi?.minatBelajar || []).map((mb, i) => <li key={i}>{mb}</li>)}
                </ul>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <strong>Latar Belakang:</strong>
                <p style={{ margin: '0.25rem 0', color: 'var(--text-muted)' }}>{currentModul.identifikasi?.latarBelakang}</p>
              </div>

              <div>
                <strong>Kebutuhan Belajar:</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <div style={{ background: 'var(--bg)', padding: '0.5rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                    <strong>Visual:</strong> {currentModul.identifikasi?.kebutuhanBelajar?.visual}
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '0.5rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                    <strong>Kinestetik:</strong> {currentModul.identifikasi?.kebutuhanBelajar?.kinestetik}
                  </div>
                  <div style={{ background: 'var(--bg)', padding: '0.5rem 0.8rem', borderRadius: '8px', fontSize: '0.8rem' }}>
                    <strong>Audio:</strong> {currentModul.identifikasi?.kebutuhanBelajar?.audio}
                  </div>
                </div>
              </div>
            </div>

            {/* Bagian B: PROFIL LULUSAN DPL */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                B. IDENTIFIKASI DIMENSI PROFIL KELULUSAN (DPL)
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      <th style={{ padding: '8px', border: '1px solid var(--border)', width: '25%' }}>Dimensi Profil</th>
                      <th style={{ padding: '8px', border: '1px solid var(--border)' }}>Penerapan dalam Materi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentModul.profilLulusan || []).map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}>{item.dimensi}</td>
                        <td style={{ padding: '8px', border: '1px solid var(--border)' }}>{item.deskripsi}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bagian C: DESAIN PEMBELAJARAN */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                C. DESAIN PEMBELAJARAN
              </h3>
              <div style={{ marginBottom: '0.8rem' }}>
                <strong>Capaian Pembelajaran (CP):</strong>
                <p style={{ margin: '0.3rem 0', color: 'var(--text-muted)' }}>{currentModul.desainPembelajaran?.capaianPembelajaran}</p>
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <strong>Tujuan Pembelajaran (TP):</strong>
                <ol style={{ margin: '0.3rem 0 0 1.25rem', padding: 0 }}>
                  {(currentModul.desainPembelajaran?.tujuanPembelajaran || []).map((tp, idx) => <li key={idx}>{tp}</li>)}
                </ol>
              </div>

              <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: '12px', marginBottom: '0.8rem' }}>
                <strong>Praktik Pedagogi:</strong>
                <div style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
                  <div>• <strong>Model:</strong> {currentModul.desainPembelajaran?.praktikPedagogi?.model}</div>
                  <div>• <strong>Pendekatan:</strong> {currentModul.desainPembelajaran?.praktikPedagogi?.pendekatan}</div>
                  <div>• <strong>Metode:</strong> {currentModul.desainPembelajaran?.praktikPedagogi?.metode}</div>
                  <div>• <strong>Strategi:</strong> {currentModul.desainPembelajaran?.praktikPedagogi?.strategi}</div>
                </div>
              </div>
            </div>

            {/* Bagian D: PENGALAMAN BELAJAR (SKENARIO) */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                D. PENGALAMAN BELAJAR (SKENARIO PEMBELAJARAN)
              </h3>
              
              {(currentModul.pengalamanBelajar || []).map((sesi, idx) => (
                <div key={idx} style={{ marginBottom: '1.5rem', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ background: 'var(--primary)', color: 'white', padding: '0.6rem 1rem', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{sesi.label || `Sesi ${sesi.sesi}`} : {sesi.topik}</span>
                    <span>{sesi.durasi}</span>
                  </div>

                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ fontWeight: 'bold', color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: '6px' }}>
                        KEGIATAN PEMBUKA ({sesi.pembuka?.waktuPrinsip || '10 Menit'})
                      </span>
                      <p style={{ margin: '0.3rem 0 0 0' }}>{sesi.pembuka?.deskripsi}</p>
                    </div>

                    <div>
                      <span style={{ fontWeight: 'bold', color: '#2563EB', background: '#DBEAFE', padding: '2px 8px', borderRadius: '6px' }}>
                        KEGIATAN INTI ({sesi.inti?.waktuPrinsip || '85 Menit'})
                      </span>
                      <div style={{ margin: '0.3rem 0 0 0', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div><strong>1. Memahami:</strong> {sesi.inti?.memahami}</div>
                        <div><strong>2. Mengaplikasikan:</strong> {sesi.inti?.mengaplikasikan}</div>
                        <div><strong>3. Merefleksikan:</strong> {sesi.inti?.merefleksikan}</div>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontWeight: 'bold', color: '#4B5563', background: '#E5E7EB', padding: '2px 8px', borderRadius: '6px' }}>
                        KEGIATAN PENUTUP ({sesi.penutup?.waktuPrinsip || '10 Menit'})
                      </span>
                      <p style={{ margin: '0.3rem 0 0 0' }}>{sesi.penutup?.deskripsi}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bagian E: ASESMEN & RUBRIK */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                E. PENILAIAN / ASESMEN
              </h3>
              
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                      <th style={{ padding: '8px', border: '1px solid var(--border)' }}>Jenis Asesmen</th>
                      <th style={{ padding: '8px', border: '1px solid var(--border)' }}>Bentuk Instrumen</th>
                      <th style={{ padding: '8px', border: '1px solid var(--border)' }}>Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentModul.asesmen?.tabelJenis || []).map((t, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '8px', border: '1px solid var(--border)', fontWeight: 'bold' }}>{t.jenis}</td>
                        <td style={{ padding: '8px', border: '1px solid var(--border)' }}>{t.instrumen}</td>
                        <td style={{ padding: '8px', border: '1px solid var(--border)' }}>{t.waktu}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Soal Sumatif HOTS */}
              <div>
                <strong>Contoh Soal Asesmen Sumatif HOTS:</strong>
                <ol style={{ margin: '0.3rem 0 0 1.25rem', padding: 0, fontSize: '0.85rem' }}>
                  {(currentModul.asesmen?.soalSumatifHots || []).map((s, idx) => (
                    <li key={idx} style={{ marginBottom: '0.4rem' }}>
                      <strong>{s.soal}</strong><br />
                      <span style={{ color: 'var(--text-muted)' }}><em>Kunci/Rubrik:</em> {s.kunciJawaban}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Bagian F: LAMPIRAN LKPD */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem', marginBottom: '0.8rem' }}>
                F. LAMPIRAN LEMBAR KERJA PESERTA DIDIK (LKPD)
              </h3>
              {(currentModul.lkpd || []).map((item, idx) => (
                <div key={idx} style={{ border: '1px dashed var(--border)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem', background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--primary)', textAlign: 'center' }}>
                    {item.judul}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.6rem' }}>
                    {item.sintaksPbl}
                  </div>
                  <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div><strong>Stimulus:</strong> {item.kegiatanMemahami?.bacaanAtauStimulus}</div>
                    <div>
                      <strong>Pertanyaan Pemahaman:</strong>
                      <ol style={{ margin: '0.2rem 0 0 1.25rem', padding: 0 }}>
                        {(item.kegiatanMemahami?.pertanyaan || []).map((q, qIdx) => <li key={qIdx}>{q}</li>)}
                      </ol>
                    </div>
                    <div><strong>Aplikasi & Tugas:</strong> {item.kegiatanMengaplikasikan?.petunjuk}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pengesahan */}
            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', textAlign: 'center', fontSize: '0.85rem' }}>
              <div style={{ width: '45%' }}>
                Mengetahui,<br />
                Kepala Sekolah
                <div style={{ height: '60px' }} />
                <strong><u>{currentModul.pengesahan?.kepalaSekolah?.nama || '( ........................................ )'}</u></strong><br />
                NIP. {currentModul.pengesahan?.kepalaSekolah?.nip || '...........................................'}
              </div>
              <div style={{ width: '45%' }}>
                {currentModul.pengesahan?.kota || 'Makassar'}, {currentModul.pengesahan?.tanggal || new Date().toLocaleDateString('id-ID')}<br />
                Guru Kelas / Pengampu
                <div style={{ height: '60px' }} />
                <strong><u>{currentModul.pengesahan?.guru?.nama || currentModul.identifikasi?.penyusun || '( ........................................ )'}</u></strong><br />
                NIP. {currentModul.pengesahan?.guru?.nip || '...........................................'}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 5. Konten Tab 3: Riwayat Modul Tersimpan */}
      {activeTab === 'history' && (
        <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
            Riwayat Modul Ajar Tersimpan
          </h3>

          {savedModuls.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <BookOpen size={48} style={{ opacity: 0.3, margin: '0 auto 0.75rem auto' }} />
              <p style={{ margin: 0 }}>Belum ada modul ajar yang disimpan.</p>
              <button
                onClick={() => setActiveTab('generator')}
                style={{ marginTop: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Buat Modul Ajar Sekarang
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {savedModuls.map((item) => {
                const m = item.data
                const iden = m?.identifikasi || {}
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setCurrentModul(m)
                      setActiveTab('preview')
                    }}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text)' }}>
                          {iden.topikElemen || m?.judul}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {iden.mataPelajaran} • {iden.kelasFase} • {new Date(item.createdAt).toLocaleDateString('id-ID')}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          exportModulAjarToWord(m)
                        }}
                        title="Unduh Word"
                        style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                      >
                        <Download size={14} /> Word
                      </button>
                      <button
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        title="Hapus"
                        style={{ background: '#FEE2E2', border: 'none', color: '#DC2626', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Pengaturan API Key Gemini */}
      {showKeyModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} color="#4F46E5" /> Pengaturan API Key AI
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
              Fitur Pembuatan Modul Ajar menggunakan Google Gemini AI. Dapatkan API Key gratis di Google AI Studio (aistudio.google.com).
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text)', marginBottom: '0.4rem' }}>
                Google Gemini API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                style={{
                  width: '100%',
                  padding: '0.7rem 0.9rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Simpan API Key
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
