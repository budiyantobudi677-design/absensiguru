'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BookOpen, Plus, Trash2, Calendar, FileText, CheckCircle2, Sparkles, Clock, Compass, Tag } from 'lucide-react'

export default function InputJurnalMengajar({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

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
    'IPA',
    'IPS',
    'Pendidikan Agama',
    'Pendidikan Pancasila',
    'Seni & Prakarya',
    'PJOK',
    'Informatika'
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
      setMessage({ type: 'success', text: 'Jurnal pembelajaran berhasil dicatat ke sistem!' })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus riwayat jurnal ini?')) return
    try {
      const { error } = await supabase.from('learning_journals').delete().eq('id', id)
      if (error) throw error
      setJournals(journals.filter(j => j.id !== id))
    } catch (err) {
      alert('Gagal menghapus: ' + err.message)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Form Input Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
          <div>
            <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded-full inline-block mb-1">
              Catatan KBM Guru
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Form Jurnal Mengajar Harian</h2>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <BookOpen size={20} />
          </div>
        </div>

        {message && (
          <div className={`p-3.5 rounded-xl text-xs font-semibold mb-4 flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-[11px] underline opacity-75">Tutup</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Rombel / Kelas</label>
              <select
                value={activeClassId}
                onChange={(e) => setActiveClassId(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
              >
                {(classes || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Tanggal Mengajar</label>
              <input
                type="date"
                name="tanggal"
                value={formData.tanggal}
                onChange={handleInputChange}
                required
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Mata Pelajaran</label>
              <select
                name="mata_pelajaran"
                value={formData.mata_pelajaran}
                onChange={handleInputChange}
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
              >
                {standardSubjects.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Materi Pokok / Topik Bahasan</label>
              <input
                type="text"
                name="topik"
                value={formData.topik}
                onChange={handleInputChange}
                placeholder="Contoh: Operasi Hitung Perkalian Bilangan Cacah..."
                required
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Metode Pembelajaran</label>
              <select
                name="teknik"
                value={formData.teknik}
                onChange={handleInputChange}
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
              >
                <option value="Tatap Muka (Luring)">Tatap Muka (Luring)</option>
                <option value="Praktikum / Eksperimen">Praktikum / Eksperimen</option>
                <option value="Diskusi & Presentasi Kelompok">Diskusi Kelompok</option>
                <option value="Daring / Asynchronous">Daring / Hybrid</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Kegiatan & Ringkasan Pembelajaran</label>
            <textarea
              name="kegiatan"
              rows={2}
              value={formData.kegiatan}
              onChange={handleInputChange}
              placeholder="Deskripsi aktivitas belajar mengajar di kelas..."
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm font-normal text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Bentuk Penilaian / Tugas</label>
              <input
                type="text"
                name="penilaian"
                value={formData.penilaian}
                onChange={handleInputChange}
                placeholder="Contoh: Latihan Mandiri Hal 42, Kuis 5 Soal..."
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Catatan / Hambatan Siswa</label>
              <input
                type="text"
                name="catatan"
                value={formData.catatan}
                onChange={handleInputChange}
                placeholder="Catatan kendala materi atau siswa yang butuh remidi..."
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Plus size={16} />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Jurnal KBM'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* History Feed Section */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Riwayat Jurnal Kelas ({journals.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat riwayat jurnal...
          </div>
        ) : journals.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada catatan jurnal pada kelas ini.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {journals.map(j => (
              <div
                key={j.id}
                className="p-4 rounded-xl border border-slate-100 hover:border-teal-200 bg-slate-50/50 hover:bg-white transition-all shadow-sm flex flex-col gap-2 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px] font-bold border border-teal-100">
                        {j.mata_pelajaran}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        {j.teknik || 'Tatap Muka'}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        • {new Date(j.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                      {j.topik}
                    </h4>
                  </div>
                  <button
                    onClick={() => handleDelete(j.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Hapus Jurnal"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {j.kegiatan && (
                  <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100">
                    {j.kegiatan}
                  </p>
                )}

                {(j.penilaian || j.catatan) && (
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                    {j.penilaian && (
                      <span className="text-slate-600">
                        <strong className="text-slate-700">Tugas/Evaluasi:</strong> {j.penilaian}
                      </span>
                    )}
                    {j.catatan && (
                      <span className="text-slate-500">
                        <strong className="text-slate-700">Catatan:</strong> {j.catatan}
                      </span>
                    )}
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
