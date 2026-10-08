'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Upload, Trash2, Edit3, Save, School, X, Sparkles, FileText, CheckCircle2, Search, Download } from 'lucide-react'
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
      setMessage({ type: 'success', text: `Kelas ${data[0].name} berhasil ditambahkan!` })
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
      setMessage({ type: 'success', text: `Siswa ${data[0].name} berhasil didaftarkan!` })
    } catch (err) {
      setMessage({ type: 'error', text: 'Gagal menambah siswa: ' + err.message })
    }
  }

  const handleDeleteStudent = async (id, name) => {
    if (!window.confirm(`Yakin ingin menghapus siswa ${name}?`)) return
    try {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
      setStudents(students.filter(s => s.id !== id))
      setMessage({ type: 'success', text: `Siswa ${name} telah dihapus.` })
    } catch (err) {
      alert('Gagal menghapus siswa: ' + err.message)
    }
  }

  const handleDownloadTemplate = () => {
    const templateData = [
      ['No', 'Nama Siswa', 'NISN', 'Jenis Kelamin (L/P)'],
      [1, 'Ahmad Fauzi', '0081234567', 'L'],
      [2, 'Siti Nurhaliza', '0089876543', 'P'],
      [3, 'Budi Santoso', '0081122334', 'L']
    ]
    const ws = XLSX.utils.aoa_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template Siswa')
    XLSX.writeFile(wb, 'Template_Impor_Siswa.xlsx')
  }

  const handleExcelImport = (e) => {
    const file = e.target.files[0]
    if (!file || !selectedClassId) {
      alert('Pilih rombel kelas terlebih dahulu!')
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
          alert('Tidak ada data siswa yang valid di file Excel ini!')
          return
        }

        const { error } = await supabase.from('students').insert(newStudents)
        if (error) throw error

        setMessage({ type: 'success', text: `Berhasil mengimpor ${newStudents.length} siswa baru!` })
        fetchStudents(selectedClassId)
      } catch (err) {
        alert('Gagal membaca file: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.nisn && s.nisn.includes(searchTerm))
  )

  const activeClassName = classes.find(c => c.id === selectedClassId)?.name || 'Kelas'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Card */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1E293B', background: '#F1F5F9', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Basis Data Sekolah
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
              Master Siswa & Rombongan Belajar
            </h3>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setShowAddClass(!showAddClass)}
              type="button"
              className="btn"
              style={{
                width: 'auto',
                padding: '0.5rem 0.85rem',
                borderRadius: '12px',
                background: '#F1F5F9',
                color: '#1E293B',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Plus size={15} />
              <span>Tambah Kelas</span>
            </button>
            <button
              onClick={() => setShowAddStudent(!showAddStudent)}
              type="button"
              className="btn"
              style={{
                width: 'auto',
                padding: '0.5rem 0.85rem',
                borderRadius: '12px',
                background: '#4F46E5',
                color: 'white',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Plus size={15} />
              <span>Tambah Siswa</span>
            </button>
          </div>
        </div>

        {/* Modal / Form Tambah Kelas Baru */}
        {showAddClass && (
          <form onSubmit={handleAddClass} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <input
                type="text"
                placeholder="Nama Kelas (contoh: 1-A, 4-B, 6)..."
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                required
                className="input"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0.55rem 1rem', borderRadius: '10px', fontSize: '0.8rem' }}>
              Simpan Kelas
            </button>
            <button type="button" onClick={() => setShowAddClass(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem' }}>
              <X size={18} />
            </button>
          </form>
        )}

        {/* Modal / Form Tambah Siswa Baru */}
        {showAddStudent && (
          <form onSubmit={handleAddStudent} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>
              Daftarkan Siswa ke Kelas {activeClassName}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Nama Lengkap Siswa *"
                value={studentForm.name}
                onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                required
                className="input"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
              />
              <input
                type="text"
                placeholder="NISN (Opsional)"
                value={studentForm.nisn}
                onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })}
                className="input"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
              />
              <select
                value={studentForm.gender}
                onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                className="input"
                style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
              >
                <option value="L">Laki-laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddStudent(false)} className="btn" style={{ width: 'auto', background: '#E2E8F0', color: '#475569', padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.8rem' }}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1.25rem', borderRadius: '10px', fontSize: '0.8rem' }}>
                Simpan Siswa
              </button>
            </div>
          </form>
        )}

        {/* Pilihan Rombel Kelas Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', padding: '4px 0', marginBottom: '0.85rem' }}>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              type="button"
              style={{
                padding: '6px 14px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: 'none',
                background: selectedClassId === c.id ? '#4F46E5' : '#F1F5F9',
                color: selectedClassId === c.id ? 'white' : 'var(--text-muted)',
                boxShadow: selectedClassId === c.id ? '0 2px 6px rgba(79, 70, 229, 0.3)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              Kelas {c.name}
            </button>
          ))}
        </div>

        {/* Action Row: Import Excel & Template */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '300px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Cari siswa atau NISN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              style={{ padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.8rem', borderRadius: '10px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handleDownloadTemplate}
              type="button"
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                background: '#F1F5F9',
                color: '#475569',
                border: '1px solid #E2E8F0',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Download size={13} />
              <span>Format Excel</span>
            </button>
            <label
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                background: '#10B981',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Upload size={13} />
              <span>Impor Excel</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
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

      {/* Daftar Siswa Card */}
      <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Siswa Kelas {activeClassName} ({filteredStudents.length} Siswa)
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            L: {students.filter(s => s.gender === 'L').length} • P: {students.filter(s => s.gender === 'P').length}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Memuat daftar siswa...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {students.length === 0
              ? 'Belum ada siswa terdaftar di kelas ini. Klik tombol Tambah Siswa atau Impor Excel di atas.'
              : 'Tidak ditemukan siswa yang cocok dengan pencarian.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredStudents.map((student, idx) => (
              <div
                key={student.id}
                style={{
                  padding: '0.85rem 1.25rem',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.4)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', width: '22px', textAlign: 'center', flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: student.gender === 'P' ? '#FCE7F3' : '#E0E7FF',
                    color: student.gender === 'P' ? '#BE185D' : '#4338CA',
                    fontWeight: 'bold',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {student.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {student.nisn ? `NISN: ${student.nisn} • ` : ''}
                      <span style={{ fontWeight: 'bold', color: student.gender === 'P' ? '#BE185D' : '#2563EB' }}>
                        {student.gender === 'P' ? 'Perempuan' : 'Laki-laki'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteStudent(student.id, student.name)}
                  style={{
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#EF4444',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                  title="Hapus Siswa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
