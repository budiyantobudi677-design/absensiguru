'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Upload, Trash2, Edit3, Save, School, X, Sparkles, FileText, CheckCircle2, Search, Download, BookOpen, RotateCcw, Lock, ShieldAlert, Info } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getCustomSubjects, saveCustomSubjects, DEFAULT_SUBJECTS } from '../../lib/subjectsManager'

export default function MasterSiswaDanKelas({ user, profile, schoolInfo, onRefresh }) {
  const [activeTab, setActiveTab] = useState('siswa_kelas') // 'siswa_kelas' | 'mapel'

  // Peran Guru & Hak Akses
  const activeProfile = profile || user || {}
  const isAdmin = activeProfile.role === 'admin'
  const isGuruMapel = activeProfile.role === 'guru_mapel'
  // Admin & Wali Kelas berhak mengelola siswa; Guru Mapel dibatasi (Read Only)
  const canManageStudents = !isGuruMapel
  // Hanya Admin yang berhak merubah struktur mapel kurikulum secara global
  const canManageSubjects = isAdmin

  // State Kelas & Siswa
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

  // State Mata Pelajaran
  const [subjectsList, setSubjectsList] = useState([])
  const [newSubjectName, setNewSubjectName] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editSubjectValue, setEditSubjectValue] = useState('')

  useEffect(() => {
    fetchClasses()
    loadSubjects()
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId)
    } else {
      setStudents([])
    }
  }, [selectedClassId])

  const loadSubjects = () => {
    setSubjectsList(getCustomSubjects())
  }

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

  // ===================== PENGATURAN MATA PELAJARAN =====================
  const handleAddSubject = (e) => {
    e.preventDefault()
    const trimmed = newSubjectName.trim()
    if (!trimmed) return
    if (subjectsList.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      alert('Mata pelajaran tersebut sudah ada dalam daftar!')
      return
    }
    const updated = [...subjectsList, trimmed]
    setSubjectsList(updated)
    saveCustomSubjects(updated)
    setNewSubjectName('')
    setMessage({ type: 'success', text: `Mata pelajaran "${trimmed}" berhasil ditambahkan!` })
  }

  const handleDeleteSubject = (index, name) => {
    if (!window.confirm(`Hapus mata pelajaran "${name}"?`)) return
    const updated = subjectsList.filter((_, idx) => idx !== index)
    setSubjectsList(updated)
    saveCustomSubjects(updated)
    setMessage({ type: 'success', text: `Mata pelajaran "${name}" telah dihapus.` })
  }

  const handleStartEditSubject = (index, name) => {
    setEditingIndex(index)
    setEditSubjectValue(name)
  }

  const handleSaveEditSubject = (index) => {
    const trimmed = editSubjectValue.trim()
    if (!trimmed) return
    const updated = [...subjectsList]
    updated[index] = trimmed
    setSubjectsList(updated)
    saveCustomSubjects(updated)
    setEditingIndex(null)
    setMessage({ type: 'success', text: `Mata pelajaran berhasil diperbarui menjadi "${trimmed}".` })
  }

  const handleResetDefaultSubjects = () => {
    if (!window.confirm('Kembalikan daftar mata pelajaran ke pengaturan bawaan kurikulum standar?')) return
    setSubjectsList(DEFAULT_SUBJECTS)
    saveCustomSubjects(DEFAULT_SUBJECTS)
    setMessage({ type: 'success', text: 'Mata pelajaran berhasil di-reset ke standar kurikulum!' })
  }

  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.nisn && s.nisn.includes(searchTerm))
  )

  const activeClassName = classes.find(c => c.id === selectedClassId)?.name || 'Kelas'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Card Header */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1E293B', background: '#F1F5F9', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Basis Data KBM
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
              Master KBM (Siswa, Rombel & Mata Pelajaran)
            </h3>
          </div>

          {activeTab === 'siswa_kelas' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {isAdmin && (
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
              )}
              {canManageStudents ? (
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
              ) : (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '12px',
                  background: '#FEF3C7',
                  color: '#92400E',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  <Lock size={13} />
                  <span>Mode Guru Mapel (Hanya Lihat)</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'mapel' && canManageSubjects && (
            <button
              onClick={handleResetDefaultSubjects}
              type="button"
              className="btn"
              style={{
                width: 'auto',
                padding: '0.5rem 0.85rem',
                borderRadius: '12px',
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RotateCcw size={14} />
              <span>Reset Standar Kurikulum</span>
            </button>
          )}
        </div>

        {/* Tab Switcher: Siswa & Rombel vs Mata Pelajaran */}
        <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '14px', marginBottom: '1rem' }}>
          <button
            onClick={() => setActiveTab('siswa_kelas')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: activeTab === 'siswa_kelas' ? 'white' : 'transparent',
              color: activeTab === 'siswa_kelas' ? '#4F46E5' : '#64748B',
              boxShadow: activeTab === 'siswa_kelas' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Users size={16} />
            <span>Siswa & Rombongan Belajar</span>
          </button>
          <button
            onClick={() => setActiveTab('mapel')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: activeTab === 'mapel' ? 'white' : 'transparent',
              color: activeTab === 'mapel' ? '#4F46E5' : '#64748B',
              boxShadow: activeTab === 'mapel' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <BookOpen size={16} />
            <span>Pengaturan Mata Pelajaran ({subjectsList.length})</span>
          </button>
        </div>

        {/* Notifikasi Alert */}
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
            border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
            marginBottom: '1rem'
          }}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
              Tutup
            </button>
          </div>
        )}

        {/* ===================== TAB 1: SISWA & KELAS ===================== */}
        {activeTab === 'siswa_kelas' && (
          <>
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
                <button type="submit" className="btn" style={{ width: 'auto', padding: '0.55rem 1rem', borderRadius: '10px', background: '#10B981', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                  Simpan Rombel
                </button>
                <button type="button" onClick={() => setShowAddClass(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Batal
                </button>
              </form>
            )}

            {/* Modal / Form Tambah Siswa Baru */}
            {showAddStudent && (
              <form onSubmit={handleAddStudent} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'var(--text)' }}>
                  Tambah Siswa ke Kelas: <span style={{ color: '#4F46E5' }}>{activeClassName}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Nama Lengkap Siswa *"
                    value={studentForm.name}
                    onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                    required
                    className="input"
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', borderRadius: '10px' }}
                  />
                  <input
                    type="text"
                    placeholder="NISN (Opsional)"
                    value={studentForm.nisn}
                    onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })}
                    className="input"
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', borderRadius: '10px' }}
                  />
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="input"
                    style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', borderRadius: '10px' }}
                  >
                    <option value="L">Laki-laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="submit" className="btn" style={{ width: 'auto', padding: '0.55rem 1rem', borderRadius: '10px', background: '#4F46E5', color: 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    Daftarkan Siswa
                  </button>
                  <button type="button" onClick={() => setShowAddStudent(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.5rem' }}>
                    Batal
                  </button>
                </div>
              </form>
            )}

            {/* Filter Pilih Kelas & Upload Excel Siswa */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Pilih Rombel / Kelas
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                >
                  {(classes || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {canManageStudents ? (
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Impor Siswa Massal (Excel)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <label
                      style={{
                        flex: 1,
                        padding: '0.6rem 0.75rem',
                        background: '#F1F5F9',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        border: '1px dashed #CBD5E1'
                      }}
                    >
                      <Upload size={14} />
                      <span>Pilih Excel</span>
                      <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} style={{ display: 'none' }} />
                    </label>
                    <button
                      onClick={handleDownloadTemplate}
                      type="button"
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '12px',
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        color: '#64748B',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Unduh Format Template Excel"
                    >
                      <Download size={14} />
                      <span>Format</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '0.6rem 0.85rem', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldAlert size={18} color="#D97706" />
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Guru Mapel tidak memiliki akses mengubah rombel siswa.
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===================== TAB 2: PENGATURAN MATA PELAJARAN ===================== */}
        {activeTab === 'mapel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!canManageSubjects && (
              <div style={{ padding: '0.75rem 1rem', background: '#EFF6FF', borderRadius: '12px', border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={18} color="#2563EB" />
                <span style={{ fontSize: '0.78rem', color: '#1E40AF', fontWeight: '500' }}>
                  Daftar mata pelajaran di bawah ini diatur terpusat oleh Admin Sekolah. Guru dapat melihat mata pelajaran yang tersedia.
                </span>
              </div>
            )}

            {/* Form Tambah Mata Pelajaran Baru (Hanya Admin) */}
            {canManageSubjects && (
              <form onSubmit={handleAddSubject} style={{ padding: '1rem', background: '#F8FAFC', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <input
                    type="text"
                    placeholder="Ketik nama mata pelajaran baru (misal: IPAS, Bahasa Sunda, Robotik)..."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="input"
                  style={{ padding: '0.6rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
                />
              </div>
              <button
                type="submit"
                className="btn"
                style={{
                  width: 'auto',
                  padding: '0.6rem 1.15rem',
                  borderRadius: '10px',
                  background: '#4F46E5',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.82rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={15} />
                <span>Tambah Mapel</span>
              </button>
            </form>
          )}

            {/* List Mata Pelajaran */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
              {subjectsList.map((subj, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  {editingIndex === idx ? (
                    <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                      <input
                        type="text"
                        value={editSubjectValue}
                        onChange={(e) => setEditSubjectValue(e.target.value)}
                        className="input"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem', borderRadius: '8px', flex: 1 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEditSubject(idx)}
                        style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', background: '#10B981', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' }}
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        style={{ padding: '0.4rem 0.65rem', borderRadius: '8px', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', width: '20px' }}>
                          {idx + 1}.
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {subj}
                        </span>
                      </div>
                      {canManageSubjects && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEditSubject(idx, subj)}
                            style={{ padding: '5px', borderRadius: '6px', border: 'none', background: '#F1F5F9', color: '#475569', cursor: 'pointer' }}
                            title="Ubah Nama"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubject(idx, subj)}
                            style={{ padding: '5px', borderRadius: '6px', border: 'none', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}
                            title="Hapus Mapel"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===================== LIST SISWA TABLE (HANYA MUNCUL DI TAB SISWA) ===================== */}
      {activeTab === 'siswa_kelas' && (
        <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="var(--text-muted)" />
              <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Daftar Siswa Kelas {activeClassName} ({filteredStudents.length} Siswa)
              </span>
            </div>

            <div style={{ width: '100%', maxWidth: '280px', position: 'relative' }}>
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
          </div>

          {loading ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Memuat data siswa...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {students.length === 0
                ? 'Belum ada data siswa di rombel kelas ini. Tambahkan siswa atau impor via Excel.'
                : 'Tidak ditemukan siswa yang cocok dengan kata kunci pencarian.'}
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

                  {canManageStudents && (
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
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
