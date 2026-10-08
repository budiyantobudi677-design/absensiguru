'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Upload, Trash2, Edit3, Save, School, X, Sparkles, FileText, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function MasterSiswaDanKelas({ user, schoolInfo, onRefresh }) {
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [students, setStudents] = useState([])
  const [newClassName, setNewClassName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const [studentForm, setStudentForm] = useState({ name: '', nisn: '', gender: 'L' })
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [showAddClass, setShowAddClass] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchClasses()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId)
    } else {
      setStudents([])
    }
  }, [selectedClassId])

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase.from('classes').select('*').order('name', { ascending: true })
      if (error) throw error
      setClasses(data || [])
      if (data && data.length > 0 && !selectedClassId) {
        setSelectedClassId(data[0].id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchStudents = async (classId) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('name', { ascending: true })
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddClass = async (e) => {
    e.preventDefault()
    if (!newClassName.trim()) return
    try {
      const { data, error } = await supabase
        .from('classes')
        .insert([{ name: newClassName.trim(), teacher_id: user?.id }])
        .select()
      if (error) throw error
      setClasses([...classes, data[0]])
      setSelectedClassId(data[0].id)
      setNewClassName('')
      setShowAddClass(false)
      setMessage({ type: 'success', text: 'Kelas baru berhasil ditambahkan!' })
      if (onRefresh) onRefresh()
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambah kelas: ' + err.message })
    }
  }

  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!studentForm.name.trim() || !selectedClassId) return
    try {
      const { data, error } = await supabase
        .from('students')
        .insert([{
          name: studentForm.name.trim(),
          nisn: studentForm.nisn.trim() || null,
          gender: studentForm.gender,
          class_id: selectedClassId
        }])
        .select()

      if (error) throw error
      setStudents([...students, data[0]])
      setStudentForm({ name: '', nisn: '', gender: 'L' })
      setShowAddStudent(false)
      setMessage({ type: 'success', text: 'Siswa berhasil didaftarkan!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambah siswa: ' + err.message })
    }
  }

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Yakin ingin menghapus siswa ini dari sistem?')) return
    try {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
      setStudents(students.filter(s => s.id !== id))
    } catch (err) {
      alert('Gagal menghapus siswa: ' + err.message)
    }
  }

  const handleExcelImport = (e) => {
    const file = e.target.files[0]
    if (!file || !selectedClassId) {
      alert('Pilih kelas terlebih dahulu!')
      return
    }

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

        const newStudents = []
        for (let i = 1; i < data.length; i++) {
          const row = data[i]
          if (!row || row.length === 0) continue

          const name = row[1] || row[0]
          const nisn = row[2] ? String(row[2]) : null
          const gender = row[3] && String(row[3]).toUpperCase().startsWith('P') ? 'P' : 'L'

          if (name && typeof name === 'string' && name.trim()) {
            newStudents.push({
              name: name.trim(),
              nisn: nisn,
              gender: gender,
              class_id: selectedClassId
            })
          }
        }

        if (newStudents.length === 0) {
          return alert('Format file Excel tidak sesuai atau data kosong. Pastikan kolom memuat Nama Siswa.')
        }

        setLoading(true)
        const { error } = await supabase.from('students').insert(newStudents)
        if (error) throw error

        await fetchStudents(selectedClassId)
        setMessage({ type: 'success', text: `Berhasil mengimpor ${newStudents.length} siswa!` })
      } catch (err) {
        setMessage({ type: 'error', text: 'Gagal impor Excel: ' + err.message })
      } finally {
        setLoading(false)
        e.target.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.nisn && s.nisn.includes(searchTerm))
  )

  const activeClass = classes.find(c => c.id === selectedClassId)

  return (
    <div className="flex flex-col gap-4">
      {/* Top Banner Control */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2.5 py-0.5 rounded-full inline-block mb-1">
              Basis Data Akademik
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Master Siswa & Manajemen Rombel</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddClass(!showAddClass)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <School size={15} />
              <span>+ Kelas Baru</span>
            </button>

            <button
              onClick={() => setShowAddStudent(!showAddStudent)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>+ Siswa Baru</span>
            </button>
          </div>
        </div>

        {/* Add Class Form Popover */}
        {showAddClass && (
          <form onSubmit={handleAddClass} className="p-3.5 mb-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              placeholder="Nama Rombel / Kelas (contoh: 7-A, Kelas 4)..."
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none"
            />
            <div className="flex gap-2 w-full sm:w-auto">
              <button type="submit" className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer">
                Simpan Kelas
              </button>
              <button type="button" onClick={() => setShowAddClass(false)} className="px-3 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Add Student Form Popover */}
        {showAddStudent && (
          <form onSubmit={handleAddStudent} className="p-3.5 mb-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col gap-3">
            <div className="text-xs font-bold text-indigo-900">Tambah Siswa ke {activeClass?.name || 'Kelas Aktif'}</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama Lengkap Siswa *"
                value={studentForm.name}
                onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                required
                className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none"
              />
              <input
                type="text"
                placeholder="NISN / NIS (Opsional)"
                value={studentForm.nisn}
                onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })}
                className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none"
              />
              <select
                value={studentForm.gender}
                onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none"
              >
                <option value="L">Laki-laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddStudent(false)} className="px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">
                Batal
              </button>
              <button type="submit" className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl cursor-pointer">
                Simpan Siswa
              </button>
            </div>
          </form>
        )}

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

        {/* Class Selection & Quick Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-xl">
            {classes.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedClassId === c.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Upload size={14} />
              <span>Impor Excel Massal</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Student List View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Daftar Siswa {activeClass?.name} ({filteredStudents.length} Siswa)
            </span>
          </div>

          <input
            type="text"
            placeholder="Cari siswa atau NISN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat daftar siswa...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {students.length === 0
              ? 'Belum ada siswa di kelas ini. Klik tombol Tambah Siswa atau Impor Excel massal.'
              : 'Tidak ditemukan siswa yang cocok.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredStudents.map((student, idx) => (
              <div
                key={student.id}
                className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-xs font-bold text-slate-300">{idx + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/60">
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-slate-900">{student.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      NISN: {student.nisn || '-'} • Gender: {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    student.gender === 'L' ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
                  }`}>
                    {student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                  </span>
                  <button
                    onClick={() => handleDeleteStudent(student.id)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Hapus Siswa"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
