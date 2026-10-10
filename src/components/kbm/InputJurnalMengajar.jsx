import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BookOpen, Plus, Trash2, Calendar, FileText, CheckCircle2, Clock, PlusCircle, ListFilter, Lock, ShieldAlert, AlertCircle, Sparkles, Image as ImageIcon, Upload, X, Loader2 } from 'lucide-react'
import { getCustomSubjects, getAssignedMapelInfo } from '../../lib/subjectsManager'
import { getSavedGeminiKey, fileToBase64, generateJurnalFromModul } from '../../lib/gemini'

export default function InputJurnalMengajar({ selectedClass, classes, user, profile, schoolInfo }) {
  const activeProfile = profile || user || {}
  const uId = activeProfile?.id || user?.id
  const guruTipe = localStorage.getItem(`guru_tipe_${uId}`) || activeProfile?.penugasan_tipe || (activeProfile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
  const isGuruMapel = guruTipe === 'guru_mapel'
  const guruMapelSubject = activeProfile?.mata_pelajaran || localStorage.getItem(`guru_mapel_${uId}`) || ''

  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [viewTab, setViewTab] = useState('form') // 'form' | 'history'
  const [availableSubjects, setAvailableSubjects] = useState(getCustomSubjects())
  const [assignedMapelMap, setAssignedMapelMap] = useState({})

  // State Modal AI Jurnal
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiInputMode, setAiInputMode] = useState('photo') // 'photo' | 'text'
  const [aiTextPrompt, setAiTextPrompt] = useState('')
  const [aiSelectedFile, setAiSelectedFile] = useState(null)
  const [aiImagePreview, setAiImagePreview] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const initialSubject = isGuruMapel && guruMapelSubject 
    ? guruMapelSubject 
    : (activeProfile?.mata_pelajaran || getCustomSubjects()[0] || 'Matematika')

  const [formData, setFormData] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    mata_pelajaran: initialSubject,
    topik: '',
    teknik: 'Luring',
    kegiatan: '',
    penilaian: '',
    catatan: ''
  })

  useEffect(() => {
    // Muat info peta guru mapel
    getAssignedMapelInfo(supabase).then(info => {
      setAssignedMapelMap(info || {})
    })
  }, [])

  useEffect(() => {
    // Jika guru mapel, kunci form ke mapel miliknya sendiri
    if (isGuruMapel && guruMapelSubject) {
      setFormData(prev => ({ ...prev, mata_pelajaran: guruMapelSubject }))
    }
  }, [isGuruMapel, guruMapelSubject])

  useEffect(() => {
    const onSubjectsUpdated = () => {
      setAvailableSubjects(getCustomSubjects())
    }
    window.addEventListener('kbm_subjects_updated', onSubjectsUpdated)
    return () => window.removeEventListener('kbm_subjects_updated', onSubjectsUpdated)
  }, [])

  const standardSubjects = availableSubjects

  // Cek apakah mata pelajaran yang dipilih saat ini diampu oleh Guru Mapel spesifik
  const currentAssignedInfo = assignedMapelMap[formData.mata_pelajaran]
  const isMapelManagedByGuruMapel = Boolean(currentAssignedInfo && currentAssignedInfo.teacherId !== uId)
  // Untuk Guru Kelas: jika mapel sudah ada guru mapelnya, jadikan read-only
  const isReadOnlyForGuruKelas = !isGuruMapel && isMapelManagedByGuruMapel

  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  useEffect(() => {
    if (activeClassId) {
      fetchJournals()
    }
  }, [activeClassId])

  const fetchJournals = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('learning_journals')
        .select('*, classes(name)')
        .eq('class_id', activeClassId)
        .order('tanggal', { ascending: false })

      if (error) throw error
      setJournals(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.topik.trim()) return
    setSubmitting(true)
    setMessage(null)

    try {
      // Pastikan nilai teknik selalu sesuai constraint database: 'Luring', 'Daring', atau 'Hybrid'
      const rawTeknik = (formData.teknik || '').toLowerCase()
      let safeTeknik = 'Luring'
      if (rawTeknik.includes('daring') || rawTeknik.includes('online')) {
        safeTeknik = 'Daring'
      } else if (rawTeknik.includes('hybrid') || rawTeknik.includes('campuran') || rawTeknik.includes('kombinasi')) {
        safeTeknik = 'Hybrid'
      }

      const { data, error } = await supabase
        .from('learning_journals')
        .insert([{
          teacher_id: user?.id,
          class_id: activeClassId,
          tanggal: formData.tanggal,
          mata_pelajaran: formData.mata_pelajaran,
          topik: formData.topik.trim(),
          teknik: safeTeknik,
          kegiatan: formData.kegiatan.trim(),
          penilaian: formData.penilaian.trim(),
          catatan: formData.catatan.trim()
        }])
        .select('*, classes(name)')

      if (error) throw error

      setJournals([data[0], ...journals])
      setFormData(prev => ({
        ...prev,
        topik: '',
        kegiatan: '',
        penilaian: '',
        catatan: ''
      }))
      setMessage({ type: 'success', text: 'Jurnal mengajar berhasil disimpan!' })
      setViewTab('history') // otomatis arahkan ke riwayat
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus riwayat agenda jurnal ini?')) return
    try {
      const { error } = await supabase.from('learning_journals').delete().eq('id', id)
      if (error) throw error
      setJournals(journals.filter(j => j.id !== id))
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  const handleProcessAiJurnal = async () => {
    setAiError(null)
    const apiKey = getSavedGeminiKey(uId)
    if (!apiKey) {
      setAiError('API Key Gemini belum diatur! Buka menu Profil / Pengaturan Akun untuk memasukkan API Key Gemini Anda.')
      return
    }

    if (aiInputMode === 'photo' && !aiSelectedFile) {
      setAiError('Silakan pilih atau ambil foto modul ajar / RPP terlebih dahulu.')
      return
    }
    if (aiInputMode === 'text' && !aiTextPrompt.trim()) {
      setAiError('Silakan masukkan teks ringkasan materi / modul ajar.')
      return
    }

    setAiLoading(true)
    try {
      let imageBase64 = null
      let imageMimeType = null

      if (aiInputMode === 'photo' && aiSelectedFile) {
        const converted = await fileToBase64(aiSelectedFile)
        imageBase64 = converted.base64Data
        imageMimeType = converted.mimeType
      }

      const activeClassName = (classes || []).find(c => c.id === activeClassId)?.name || ''
      const res = await generateJurnalFromModul({
        apiKey,
        text: aiInputMode === 'text' ? aiTextPrompt : '',
        imageBase64,
        imageMimeType,
        mataPelajaran: formData.mata_pelajaran,
        namaKelas: activeClassName
      })

      if (res && res.data) {
        setFormData(prev => ({
          ...prev,
          topik: res.data.topik || prev.topik,
          teknik: res.data.teknik || prev.teknik || 'Luring',
          kegiatan: res.data.kegiatan || prev.kegiatan,
          penilaian: res.data.penilaian || prev.penilaian,
          catatan: res.data.catatan || prev.catatan
        }))

        setShowAiModal(false)
        setAiSelectedFile(null)
        setAiImagePreview(null)
        setAiTextPrompt('')
        setMessage({
          type: 'success',
          text: `✨ Berhasil mengisi jurnal dengan ${res.usedModel}! Silakan tinjau dan klik Simpan Jurnal.`
        })
      }
    } catch (err) {
      console.error(err)
      setAiError(err.message || 'Gagal memproses modul ajar dengan AI.')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Top Segmented Control */}
      <div className="card" style={{ padding: '0.5rem', background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border)', display: 'flex', gap: '6px' }}>
        <button
          onClick={() => setViewTab('form')}
          type="button"
          style={{
            flex: 1,
            padding: '0.65rem 1rem',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: viewTab === 'form' ? '#0D9488' : 'transparent',
            color: viewTab === 'form' ? 'white' : 'var(--text-muted)',
            boxShadow: viewTab === 'form' ? '0 2px 8px rgba(13, 148, 136, 0.3)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <PlusCircle size={16} />
          <span>Tulis Jurnal Baru</span>
        </button>
        <button
          onClick={() => setViewTab('history')}
          type="button"
          style={{
            flex: 1,
            padding: '0.65rem 1rem',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: viewTab === 'history' ? '#0D9488' : 'transparent',
            color: viewTab === 'history' ? 'white' : 'var(--text-muted)',
            boxShadow: viewTab === 'history' ? '0 2px 8px rgba(13, 148, 136, 0.3)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <BookOpen size={16} />
          <span>Riwayat Jurnal ({journals.length})</span>
        </button>
      </div>

      {/* Alert Notifikasi */}
      {message && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '14px',
          fontSize: '0.85rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FECACA'}`
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: FORM TULIS JURNAL BARU */}
      {viewTab === 'form' && (
        <div className="card" style={{ padding: '1.5rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#0D9488', background: '#CCFBF1', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Agenda Pembelajaran Guru
              </span>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
                Catat Agenda & Evaluasi KBM
              </h3>
            </div>

            {/* Tombol AI Auto-Fill Jurnal */}
            <button
              type="button"
              onClick={() => {
                setAiError(null)
                setShowAiModal(true)
              }}
              disabled={isReadOnlyForGuruKelas}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: isReadOnlyForGuruKelas ? '#CBD5E1' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                color: isReadOnlyForGuruKelas ? '#64748B' : 'white',
                border: 'none',
                borderRadius: '14px',
                padding: '0.65rem 1.15rem',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: isReadOnlyForGuruKelas ? 'not-allowed' : 'pointer',
                boxShadow: isReadOnlyForGuruKelas ? 'none' : '0 4px 12px rgba(79, 70, 229, 0.35)',
                transition: 'all 0.2s'
              }}
              title="Isi otomatis topik, kegiatan & penilaian dari foto atau teks modul ajar"
            >
              <Sparkles size={16} />
              <span>Isi Otomatis dengan AI</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Rombel / Kelas
                </label>
                <select
                  value={activeClassId}
                  onChange={(e) => setActiveClassId(e.target.value)}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                >
                  {(classes || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Tanggal KBM
                </label>
                <input
                  type="date"
                  name="tanggal"
                  value={formData.tanggal}
                  onChange={handleInputChange}
                  required
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Mata Pelajaran
                  </label>
                  {isGuruMapel && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                      <Lock size={11} /> Terkunci (Guru Mapel)
                    </span>
                  )}
                </div>
                {isGuruMapel ? (
                  <div style={{
                    padding: '0.65rem 0.85rem',
                    fontSize: '0.875rem',
                    borderRadius: '12px',
                    background: '#F0FDFA',
                    border: '1px solid #99F6E4',
                    color: '#0F766E',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>{formData.mata_pelajaran || guruMapelSubject || 'Belum diatur'}</span>
                    <Lock size={14} color="#0D9488" />
                  </div>
                ) : (
                  <select
                    name="mata_pelajaran"
                    value={formData.mata_pelajaran}
                    onChange={handleInputChange}
                    className="input"
                    style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                  >
                    {standardSubjects.map(sub => {
                      const isManaged = Boolean(assignedMapelMap[sub] && assignedMapelMap[sub].teacherId !== uId)
                      return (
                        <option key={sub} value={sub}>
                          {sub} {isManaged ? `(Diampu Guru Mapel)` : ''}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>
            </div>

            {/* Banner Mode Hanya Lihat untuk Guru Kelas jika mapel diampu Guru Mapel */}
            {isReadOnlyForGuruKelas && (
              <div style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: '14px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                color: '#92400E'
              }}>
                <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.82rem', lineHeight: '1.4' }}>
                  <strong>Mode Hanya Lihat:</strong> Mata pelajaran <u>{formData.mata_pelajaran}</u> diampu oleh <strong>{currentAssignedInfo?.teacherName}</strong> (Guru Mapel). 
                  <br />
                  <span style={{ fontSize: '0.75rem', color: '#B45309' }}>
                    Anda hanya dapat melihat riwayat agenda kegiatan dan mengunduh rekap. Pengisian agenda jurnal baru hanya dapat dilakukan oleh guru mapel bersangkutan.
                  </span>
                </div>
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Materi Pokok / Topik Pembelajaran *
              </label>
              <input
                type="text"
                name="topik"
                value={formData.topik}
                onChange={handleInputChange}
                required
                placeholder="Contoh: Operasi Hitung Perkalian Bilangan Cacah"
                className="input"
                style={{ padding: '0.75rem 1rem', fontSize: '0.9rem', borderRadius: '12px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Metode / Teknik Pembelajaran
                </label>
                <select
                  name="teknik"
                  value={formData.teknik}
                  onChange={handleInputChange}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                >
                  <option value="Luring">Tatap Muka (Luring)</option>
                  <option value="Daring">Daring / Online</option>
                  <option value="Hybrid">Hybrid (Kombinasi)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Bentuk Penilaian / Tugas
                </label>
                <input
                  type="text"
                  name="penilaian"
                  value={formData.penilaian}
                  onChange={handleInputChange}
                  placeholder="Contoh: Latihan Soal Mandiri Halaman 45"
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Ringkasan Kegiatan Belajar
              </label>
              <textarea
                name="kegiatan"
                rows="3"
                value={formData.kegiatan}
                onChange={handleInputChange}
                placeholder="Rangkuman langkah kegiatan pembuka, inti, dan penutup pembelajaran..."
                className="input"
                style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', borderRadius: '12px', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Catatan Khusus / Hambatan Siswa (Opsional)
              </label>
              <input
                type="text"
                name="catatan"
                value={formData.catatan}
                onChange={handleInputChange}
                placeholder="Contoh: 3 siswa membutuhkan bimbingan remedial pada konsep pembagian"
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || isReadOnlyForGuruKelas}
              className="btn"
              style={{
                marginTop: '0.5rem',
                background: isReadOnlyForGuruKelas ? '#CBD5E1' : 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: isReadOnlyForGuruKelas ? '#64748B' : 'white',
                borderRadius: '14px',
                padding: '0.85rem 1.5rem',
                fontWeight: 'bold',
                cursor: isReadOnlyForGuruKelas ? 'not-allowed' : 'pointer',
                boxShadow: isReadOnlyForGuruKelas ? 'none' : '0 4px 14px rgba(13, 148, 136, 0.3)'
              }}
            >
              {isReadOnlyForGuruKelas ? <Lock size={18} /> : <BookOpen size={18} />}
              <span>
                {isReadOnlyForGuruKelas 
                  ? 'Terkunci (Hanya Guru Mapel yang Mengisi)' 
                  : (submitting ? 'Menyimpan...' : 'Simpan Jurnal Pembelajaran')}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: RIWAYAT JURNAL MENGAJAR */}
      {viewTab === 'history' && (
        <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#0D9488', background: '#CCFBF1', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Arsip Pembelajaran
              </span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
                Daftar Jurnal Terisi
              </h3>
            </div>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="input"
              style={{ width: 'auto', padding: '0.45rem 0.85rem', fontSize: '0.8rem', borderRadius: '10px' }}
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Memuat data riwayat jurnal...
            </div>
          ) : journals.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Belum ada jurnal yang dicatat pada kelas ini.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {journals.map((j) => (
                <div
                  key={j.id}
                  style={{
                    padding: '1.15rem',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#0D9488', background: '#CCFBF1', padding: '2px 8px', borderRadius: '8px' }}>
                        {j.mata_pelajaran}
                      </span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#64748B', background: '#E2E8F0', padding: '2px 8px', borderRadius: '8px' }}>
                        {j.classes?.name || 'Kelas'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {new Date(j.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <button
                        onClick={() => handleDelete(j.id)}
                        style={{ background: '#FEE2E2', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '5px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}
                        title="Hapus Jurnal"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>
                    {j.topik}
                  </h4>

                  {j.kegiatan && (
                    <p style={{ fontSize: '0.82rem', color: '#475569', margin: 0, lineHeight: '1.5', background: 'white', padding: '8px 12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      {j.kegiatan}
                    </p>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {j.teknik && <span>Metode: <strong style={{ color: 'var(--text)' }}>{j.teknik}</strong></span>}
                    {j.penilaian && <span>Penilaian: <strong style={{ color: 'var(--text)' }}>{j.penilaian}</strong></span>}
                    {j.catatan && <span style={{ color: '#D97706' }}>Catatan: <strong>{j.catatan}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL AI: EKSTRAK JURNAL DARI FOTO / TEKS MODUL AJAR */}
      {showAiModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '24px',
            maxWidth: '520px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            {/* Header Modal */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0
                }}>
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold', color: '#1E293B' }}>
                    Ekstrak Jurnal dengan AI
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                    Gemini AI membaca modul ajar & mengisi formulir secara instan
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!aiLoading) {
                    setShowAiModal(false)
                    setAiError(null)
                  }
                }}
                disabled={aiLoading}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Segmented Mode: Foto vs Teks */}
            <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '12px' }}>
              <button
                type="button"
                onClick={() => setAiInputMode('photo')}
                style={{
                  flex: 1,
                  padding: '0.55rem',
                  border: 'none',
                  borderRadius: '9px',
                  fontSize: '0.82rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: aiInputMode === 'photo' ? 'white' : 'transparent',
                  color: aiInputMode === 'photo' ? '#4F46E5' : '#64748B',
                  boxShadow: aiInputMode === 'photo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <ImageIcon size={15} />
                <span>Foto Modul / RPP</span>
              </button>
              <button
                type="button"
                onClick={() => setAiInputMode('text')}
                style={{
                  flex: 1,
                  padding: '0.55rem',
                  border: 'none',
                  borderRadius: '9px',
                  fontSize: '0.82rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: aiInputMode === 'text' ? 'white' : 'transparent',
                  color: aiInputMode === 'text' ? '#4F46E5' : '#64748B',
                  boxShadow: aiInputMode === 'text' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <FileText size={15} />
                <span>Ketik / Tempel Teks</span>
              </button>
            </div>

            {/* Form Input Sesuai Mode */}
            {aiInputMode === 'photo' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: '16px',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                    background: aiImagePreview ? '#F8FAFC' : '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    disabled={aiLoading}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setAiSelectedFile(file)
                        const previewUrl = URL.createObjectURL(file)
                        setAiImagePreview(previewUrl)
                        setAiError(null)
                      }
                    }}
                  />
                  {aiImagePreview ? (
                    <div style={{ position: 'relative', width: '100%', maxHeight: '200px', display: 'flex', justifyContent: 'center' }}>
                      <img
                        src={aiImagePreview}
                        alt="Preview Modul"
                        style={{ maxHeight: '180px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F46E5' }}>
                        <Upload size={22} />
                      </div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                        Pilih atau Foto Lembar Modul Ajar
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                        Format JPG, PNG atau foto dari kamera smartphone
                      </span>
                    </>
                  )}
                </label>
                {aiSelectedFile && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '6px 12px', borderRadius: '8px' }}>
                    <span>File: <strong>{aiSelectedFile.name}</strong></span>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => {
                        setAiSelectedFile(null)
                        setAiImagePreview(null)
                      }}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Ganti Foto
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Ringkasan / Teks Materi Modul Ajar:
                </label>
                <textarea
                  rows="5"
                  value={aiTextPrompt}
                  onChange={(e) => setAiTextPrompt(e.target.value)}
                  disabled={aiLoading}
                  placeholder="Tempelkan teks modul ajar di sini. Contoh: Materi IPAS Bab 2 Siklus Hidup Hewan, fokus pada metamorfosis kupu-kupu dan katak. Siswa mengamati video lalu menggambar bagan..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    fontSize: '0.85rem',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {/* Error Message */}
            {aiError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{aiError}</span>
              </div>
            )}

            {/* Info Engine */}
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={14} color="#6366F1" style={{ flexShrink: 0 }} />
              <span>Sistem menggunakan Auto-Fallback Cerdas: <strong>Gemini 3.8 Flash ➔ 2.0 Flash ➔ 1.5 Flash</strong> jika kuota batas tercapai.</span>
            </div>

            {/* Tombol Aksi */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAiModal(false)
                  setAiError(null)
                }}
                disabled={aiLoading}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  background: 'white',
                  color: '#475569',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessAiJurnal}
                disabled={aiLoading}
                style={{
                  flex: 2,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: 'none',
                  background: aiLoading ? '#94A3B8' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: aiLoading ? 'none' : '0 4px 12px rgba(79, 70, 229, 0.35)'
                }}
              >
                {aiLoading ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    <span>Menganalisis dengan AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Mulai Proses AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
