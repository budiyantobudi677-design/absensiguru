'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BookOpen, Plus, Trash2, Calendar, FileText, CheckCircle2 } from 'lucide-react'

export default function InputJurnalMengajar({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes[0]?.id || ''))
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  // Form State
  const [formData, setFormData] = useState({
    tanggal: '',
    mata_pelajaran: user?.mata_pelajaran || 'Matematika',
    topik: '',
    teknik: 'Luring',
    kegiatan: '',
    penilaian: '',
    catatan: ''
  })

  const standardSubjects = [
    'Matematika',
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'IPA',
    'IPS',
    'Pendidikan Agama',
    'Pancasila / PPKn',
    'Seni Budaya',
    'PJOK',
    'Informatika'
  ]

  useEffect(() => {
    setFormData(prev => ({ ...prev, tanggal: new Date().toLocaleDateString('en-CA') }))
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
    if (!formData.topik) return
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
          topik: formData.topik,
          teknik: formData.teknik,
          kegiatan: formData.kegiatan,
          penilaian: formData.penilaian,
          catatan: formData.catatan
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
      setMessage({ type: 'success', text: 'Jurnal mengajar berhasil ditambahkan!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menambah jurnal: ' + err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Hapus entri jurnal ini?')) return
    try {
      const { error } = await supabase.from('learning_journals').delete().eq('id', id)
      if (error) throw error
      setJournals(journals.filter(j => j.id !== id))
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Form Input Jurnal */}
      <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
        <h3 className="text-lg font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--text)' }}>
          <span>📓</span> Form Jurnal Pembelajaran
        </h3>
        <p className="text-xs text-muted mb-4">Catat materi, kegiatan, serta penilaian yang dilaksanakan hari ini.</p>

        {message && (
          <div className={`p-3 rounded-xl text-xs font-semibold text-center mb-3 border ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Kelas</label>
              <select
                value={activeClassId}
                onChange={(e) => setActiveClassId(e.target.value)}
                className="input text-sm font-semibold"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Tanggal</label>
              <input
                type="date"
                name="tanggal"
                value={formData.tanggal}
                onChange={handleInputChange}
                className="input text-sm font-semibold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Mata Pelajaran</label>
              <select
                name="mata_pelajaran"
                value={formData.mata_pelajaran}
                onChange={handleInputChange}
                className="input text-sm font-semibold"
              >
                {standardSubjects.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Metode / Teknik</label>
              <select
                name="teknik"
                value={formData.teknik}
                onChange={handleInputChange}
                className="input text-sm font-semibold"
              >
                <option value="Luring">Tatap Muka (Luring)</option>
                <option value="Daring">Online (Daring)</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Materi Pokok / Topik Pembahasan *</label>
            <input
              type="text"
              name="topik"
              value={formData.topik}
              onChange={handleInputChange}
              placeholder="Contoh: Operasi Hitung Aljabar, Ekosistem Sawah, dll."
              className="input text-sm"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Uraian Kegiatan Pembelajaran</label>
            <textarea
              name="kegiatan"
              rows={2}
              value={formData.kegiatan}
              onChange={handleInputChange}
              placeholder="Contoh: Diskusi kelompok, presentasi materi, kerja lembar kerja siswa (LKS)..."
              className="input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Bentuk Penilaian / Asesmen</label>
              <input
                type="text"
                name="penilaian"
                value={formData.penilaian}
                onChange={handleInputChange}
                placeholder="Contoh: Kuis lisan, formatif 1, tugas mandiri"
                className="input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Catatan Tambahan</label>
              <input
                type="text"
                name="catatan"
                value={formData.catatan}
                onChange={handleInputChange}
                placeholder="Contoh: 3 anak remidi, kelas kondusif"
                className="input text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-md"
          >
            {submitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin"></div> : <Plus size={16} />}
            {submitting ? 'Menyimpan...' : 'Tambah Jurnal Mengajar'}
          </button>
        </form>
      </div>

      {/* Riwayat Kartu Jurnal */}
      <div className="card" style={{ padding: '1rem', borderRadius: '18px' }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-muted">RIWAYAT JURNAL KELAS ({journals.length})</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat riwayat jurnal...
          </div>
        ) : journals.length === 0 ? (
          <div className="py-8 text-center text-muted text-xs">
            Belum ada catatan jurnal mengajar untuk kelas ini.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {journals.map((j) => (
              <div
                key={j.id}
                className="p-3.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all flex flex-col gap-2 relative shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 mr-2">
                      {j.mata_pelajaran}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {j.teknik}
                    </span>
                    <div className="text-xs font-bold text-gray-800 mt-1">{j.topik}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">
                      {new Date(j.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => handleDelete(j.id)}
                      className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                      title="Hapus Jurnal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {j.kegiatan && (
                  <p className="text-xs text-gray-600 m-0">
                    <strong className="text-gray-700">Kegiatan:</strong> {j.kegiatan}
                  </p>
                )}

                {(j.penilaian || j.catatan) && (
                  <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                    {j.penilaian && <div><strong>Asesmen:</strong> {j.penilaian}</div>}
                    {j.catatan && <div><strong>Catatan:</strong> {j.catatan}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
