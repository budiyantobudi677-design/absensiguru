'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Upload, Trash2, Edit3, Save, School, X } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function MasterSiswaDanKelas({ user, schoolInfo, onRefresh }) {
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [students, setStudents] = useState([])
  const [newClassName, setNewClassName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Single Student Form
  const [studentForm, setStudentForm] = useState({ name: '', nisn: '', gender: 'L' })
  const [showAddStudent, setShowAddStudent] = useState(false)

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
      setMessage({ type: 'success', text: 'Kelas berhasil ditambahkan!' })
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
      setMessage({ type: 'success', text: 'Siswa berhasil ditambahkan!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambah siswa: ' + err.message })
    }
  }

  const handleDeleteStudent = async (id) => {
    if (!confirm('Hapus siswa ini?')) return
    try {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
      setStudents(students.filter(s => s.id !== id))
    } catch (err) {
      alert('Gagal menghapus siswa: ' + err.message)
    }
  }

  // Import Massal Siswa via Excel
  const handleImportExcel = (e) => {
    const file = e.target.files[0]
    if (!file || !selectedClassId) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 })

        // Kolom diasumsikan: No | NISN | Nama | L/P
        // Lewati header jika baris 0 teks
        const newRecords = []
        for (let i = 0; i < rawData.length; i++) {
          const row = rawData[i]
          if (!row || row.length === 0) continue
          
          let name = ''
          let nisn = ''
          let gender = 'L'

          // Heuristic deteksi baris
          if (typeof row[0] === 'string' && (row[0].toLowerCase().includes('nama') || row[0].toLowerCase().includes('no'))) {
            continue
          }

          if (row.length === 1) {
            name = String(row[0]).trim()
          } else if (row.length === 2) {
            name = String(row[1]).trim()
          } else if (row.length >= 3) {
            // Bisa berupa [No, Nama, Gender] atau [No, NISN, Nama, Gender]
            if (row.length >= 4) {
              nisn = String(row[1]).trim()
              name = String(row[2]).trim()
              gender = String(row[3]).trim().toUpperCase().startsWith('P') ? 'P' : 'L'
            } else {
              name = String(row[1]).trim()
              gender = String(row[2]).trim().toUpperCase().startsWith('P') ? 'P' : 'L'
            }
          }

          if (name && name !== 'undefined') {
            newRecords.push({
              name: name.replace(/\s*\([LP]\)$/i, ''),
              nisn: nisn || null,
              gender: gender,
              class_id: selectedClassId
            })
          }
        }

        if (newRecords.length === 0) {
          alert('Tidak ditemukan baris data siswa yang valid dalam file Excel.')
          return
        }

        const { data, error } = await supabase.from('students').insert(newRecords).select()
        if (error) throw error

        setStudents([...students, ...data])
        setMessage({ type: 'success', text: `Berhasil mengimpor ${newRecords.length} siswa!` })
      } catch (err) {
        alert('Gagal mengimpor Excel: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Kelola Kelas */}
      <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
        <h3 className="text-lg font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--text)' }}>
          <span>🏢</span> Master Kelas
        </h3>
        <p className="text-xs text-muted mb-3">Tambah atau pilih ruang kelas aktif.</p>

        {message && (
          <div className={`p-3 rounded-xl text-xs font-semibold text-center mb-3 border ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAddClass} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder="Contoh: Kelas 7A, Kelas 1, dll."
            className="input text-sm flex-1"
          />
          <button type="submit" className="btn btn-primary px-4 py-2 text-xs font-bold whitespace-nowrap cursor-pointer">
            <Plus size={16} /> Tambah Kelas
          </button>
        </form>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedClassId === c.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Kelola Murid di Kelas Terpilih */}
      {selectedClassId && (
        <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                <span>👥</span> Daftar Murid ({students.length})
              </h3>
              <p className="text-xs text-muted">Kelola data murid per kelas atau impor massal melalui file Excel.</p>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              <label className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                <Upload size={14} /> Impor Excel
                <input type="file" accept=".xlsx, .xls" onChange={handleImportExcel} className="hidden" />
              </label>

              <button
                onClick={() => setShowAddStudent(!showAddStudent)}
                className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus size={14} /> Tambah Murid
              </button>
            </div>
          </div>

          {/* Form Tambah Murid Single */}
          {showAddStudent && (
            <form onSubmit={handleAddStudent} className="p-3 mb-4 bg-gray-50 rounded-xl border border-gray-200 flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700">Data Murid Baru</span>
                <button type="button" onClick={() => setShowAddStudent(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Nama Lengkap Siswa *"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  className="input text-xs"
                  required
                />
                <input
                  type="text"
                  placeholder="NISN (Opsional)"
                  value={studentForm.nisn}
                  onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })}
                  className="input text-xs"
                />
                <select
                  value={studentForm.gender}
                  onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                  className="input text-xs font-bold"
                >
                  <option value="L">Laki-laki (L)</option>
                  <option value="P">Perempuan (P)</option>
                </select>
              </div>

              <button type="submit" className="btn btn-primary py-2 text-xs font-bold self-end cursor-pointer">
                Simpan Murid
              </button>
            </form>
          )}

          {/* List Murid */}
          {loading ? (
            <div className="py-8 text-center text-muted text-xs">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
              Memuat data siswa...
            </div>
          ) : students.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs">
              Belum ada data siswa di kelas ini. Klik tombol Impor Excel atau Tambah Murid di atas.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto pr-1">
              {students.map((st, idx) => (
                <div
                  key={st.id}
                  className="flex justify-between items-center p-2 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-gray-400 font-bold">{idx + 1}</span>
                    <span className="font-bold text-gray-800">{st.name}</span>
                    <span className="text-[10px] text-gray-400">({st.gender || '-'})</span>
                    {st.nisn && <span className="text-[10px] text-indigo-500 font-mono">NISN: {st.nisn}</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteStudent(st.id)}
                    className="text-red-400 hover:text-red-600 p-1 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
