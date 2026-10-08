'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BookOpen, Plus, Trash2, Calendar, FileText, CheckCircle2, Clock, PlusCircle, ListFilter } from 'lucide-react'

export default function InputJurnalMengajar({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [viewTab, setViewTab] = useState('form') // 'form' | 'history'

  const [formData, setFormData] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    mata_pelajaran: user?.mata_pelajaran || 'Matematika',
    topik: '',
    teknik: 'Tatap Muka (Luring)',
    kegiatan: '',
    penilaian: '',
    catatan: ''
  })

  const standardSubjects = [
    'Matematika',
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'IPA / Sains',
    'IPS / Sosial',
    'Pendidikan Agama & Budi Pekerti',
    'Pendidikan Pancasila / PKn',
    'Seni Budaya & Prakarya',
    'Pendidikan Jasmani (PJOK)',
    'Informatika / TIK',
    'Muatan Lokal / Bahasa Daerah'
  ]

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
      const { data, error } = await supabase
        .from('learning_journals')
        .insert([{
          teacher_id: user?.id,
          class_id: activeClassId,
          tanggal: formData.tanggal,
          mata_pelajaran: formData.mata_pelajaran,
          topik: formData.topik.trim(),
          teknik: formData.teknik,
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
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#0D9488', background: '#CCFBF1', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Agenda Pembelajaran Guru
            </span>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
              Catat Agenda & Evaluasi KBM
            </h3>
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
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Mata Pelajaran
                </label>
                <select
                  name="mata_pelajaran"
                  value={formData.mata_pelajaran}
                  onChange={handleInputChange}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
                >
                  {standardSubjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

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
                  <option value="Tatap Muka (Luring)">Tatap Muka (Luring)</option>
                  <option value="Diskusi Kelompok">Diskusi Kelompok</option>
                  <option value="Praktikum / Eksperimen">Praktikum / Eksperimen</option>
                  <option value="Pembelajaran Proyek (PBL)">Pembelajaran Proyek (PBL)</option>
                  <option value="Daring / Online">Daring / Online</option>
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
              disabled={submitting}
              className="btn"
              style={{
                marginTop: '0.5rem',
                background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
                color: 'white',
                borderRadius: '14px',
                padding: '0.85rem 1.5rem',
                fontWeight: 'bold',
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.3)'
              }}
            >
              <BookOpen size={18} />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Jurnal Pembelajaran'}</span>
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
    </div>
  )
}
