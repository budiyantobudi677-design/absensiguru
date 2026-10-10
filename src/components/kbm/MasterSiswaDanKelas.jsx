'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Plus, Upload, Trash2, Edit3, Save, School, X, Sparkles, FileText, CheckCircle2, Search, Download, BookOpen, RotateCcw, Lock, ShieldAlert, Info, Image as ImageIcon, Camera, Loader2, CheckSquare, Square } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getCustomSubjects, saveCustomSubjects, syncCloudSubjects, DEFAULT_SUBJECTS } from '../../lib/subjectsManager'
import { getSavedGeminiKey, fileToBase64, scanStudentsFromImage } from '../../lib/gemini'

export default function MasterSiswaDanKelas({ user, profile, schoolInfo, onRefresh }) {
  const [activeTab, setActiveTab] = useState('siswa_kelas') // 'siswa_kelas' | 'mapel'

  // Peran Guru & Hak Akses
  const activeProfile = profile || user || {}
  const isAdmin = activeProfile.role === 'admin' || 
                  user?.role === 'admin' || 
                  window.location.pathname.startsWith('/admin')
  const guruTipe = localStorage.getItem(`guru_tipe_${activeProfile.id || user?.id}`) || activeProfile.penugasan_tipe || activeProfile.role
  const isGuruMapel = !isAdmin && (guruTipe === 'guru_mapel' || activeProfile.role === 'guru_mapel' || user?.role === 'guru_mapel')
  // Admin & Wali Kelas berhak mengelola siswa; Guru Mapel dibatasi (Read Only)
  const canManageStudents = isAdmin || !isGuruMapel
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

  // State Modal AI Scan Siswa
  const [showAiScanModal, setShowAiScanModal] = useState(false)
  const [aiScanFile, setAiScanFile] = useState(null)
  const [aiScanPreview, setAiScanPreview] = useState(null)
  const [aiScanLoading, setAiScanLoading] = useState(false)
  const [aiScanError, setAiScanError] = useState(null)
  const [aiExtractedStudents, setAiExtractedStudents] = useState([])
  const [aiSaving, setAiSaving] = useState(false)
  const [aiUsedModel, setAiUsedModel] = useState('')

  // State Mata Pelajaran
  const [subjectsList, setSubjectsList] = useState([])
  const [newSubjectName, setNewSubjectName] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editSubjectValue, setEditSubjectValue] = useState('')

  useEffect(() => {
    fetchClasses()
    loadSubjects()

    const onSubjectsUpdated = () => {
      setSubjectsList(getCustomSubjects())
    }
    window.addEventListener('kbm_subjects_updated', onSubjectsUpdated)
    return () => window.removeEventListener('kbm_subjects_updated', onSubjectsUpdated)
  }, [])

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId)
    } else {
      setStudents([])
    }
  }, [selectedClassId])

  const loadSubjects = async () => {
    // Muat dari local storage terlebih dahulu agar instan, lalu sinkronkan dari database Supabase
    setSubjectsList(getCustomSubjects())
    const cloudSubs = await syncCloudSubjects(supabase)
    if (cloudSubs && cloudSubs.length > 0) {
      setSubjectsList(cloudSubs)
    }
  }

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase.from('classes').select('*').order('name', { ascending: true })
      if (error) throw error
      
      let filtered = data || []
      // Jika bukan Admin, saring sesuai penugasan guru
      if (!isAdmin) {
        const uId = activeProfile.id || user?.id
        const assigned = JSON.parse(localStorage.getItem(`guru_assigned_classes_${uId}`) || '[]')
        if (assigned.length > 0) {
          filtered = filtered.filter(c => assigned.includes(c.id))
        }
      }

      setClasses(filtered)
      if (filtered && filtered.length > 0 && !selectedClassId) {
        setSelectedClassId(filtered[0].id)
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

  const [editClassModal, setEditClassModal] = useState(null) // { id, name }
  const [editClassNameInput, setEditClassNameInput] = useState('')

  const handleAddClass = async (e) => {
    e.preventDefault()
    if (!isAdmin) {
      alert('Hanya Admin yang berhak menambahkan kelas / rombel!')
      return
    }
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

  const handleEditClass = async (e) => {
    e.preventDefault()
    if (!isAdmin) return
    const trimmed = editClassNameInput.trim()
    if (!trimmed || !editClassModal) return

    try {
      const { error } = await supabase
        .from('classes')
        .update({ name: trimmed })
        .eq('id', editClassModal.id)
      if (error) throw error

      setClasses(classes.map(c => c.id === editClassModal.id ? { ...c, name: trimmed } : c))
      setMessage({ type: 'success', text: `Nama kelas berhasil diubah menjadi "${trimmed}"!` })
      setEditClassModal(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Gagal mengubah kelas: ' + err.message)
    }
  }

  const handleDeleteClass = async (classId, className) => {
    if (!isAdmin) return
    if (!window.confirm(`Yakin ingin menghapus Rombel "${className}"?\n\nPERINGATAN: Siswa di dalam kelas ini juga akan terhapus!`)) return

    try {
      // Hapus siswa di kelas tsb terlebih dahulu
      await supabase.from('students').delete().eq('class_id', classId)
      // Hapus kelas
      const { error } = await supabase.from('classes').delete().eq('id', classId)
      if (error) throw error

      const remaining = classes.filter(c => c.id !== classId)
      setClasses(remaining)
      if (selectedClassId === classId) {
        setSelectedClassId(remaining.length > 0 ? remaining[0].id : '')
      }
      setMessage({ type: 'success', text: `Rombel "${className}" telah dihapus.` })
      if (onRefresh) onRefresh()
    } catch (err) {
      alert('Gagal menghapus kelas: ' + err.message)
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

  // ===================== AI SCAN SISWA VIA FOTO =====================
  const handleScanStudentsWithAi = async () => {
    setAiScanError(null)
    const uId = activeProfile.id || user?.id
    const apiKey = getSavedGeminiKey(uId)
    if (!apiKey) {
      setAiScanError('API Key Gemini belum diatur! Buka menu Profil / Pengaturan Akun untuk memasukkan API Key.')
      return
    }

    if (!aiScanFile) {
      setAiScanError('Silakan pilih atau ambil foto dokumen daftar siswa terlebih dahulu.')
      return
    }

    setAiScanLoading(true)
    try {
      const { base64Data, mimeType } = await fileToBase64(aiScanFile)
      const res = await scanStudentsFromImage({
        apiKey,
        imageBase64: base64Data,
        imageMimeType: mimeType
      })

      if (!res.students || res.students.length === 0) {
        throw new Error('Tidak ada nama siswa yang terdeteksi dari foto ini. Pastikan foto cukup jelas dan memuat teks daftar siswa.')
      }

      setAiUsedModel(res.usedModel)
      setAiExtractedStudents(
        res.students.map((st, idx) => ({
          tempId: idx,
          name: st.name || '',
          nisn: st.nisn || '',
          gender: (st.gender === 'P' || st.gender === 'p') ? 'P' : 'L',
          selected: true
        }))
      )
    } catch (err) {
      console.error(err)
      setAiScanError(err.message || 'Gagal memindai daftar siswa dengan AI.')
    } finally {
      setAiScanLoading(false)
    }
  }

  const handleToggleSelectStudent = (tempId) => {
    setAiExtractedStudents(prev => prev.map(s => s.tempId === tempId ? { ...s, selected: !s.selected } : s))
  }

  const handleToggleSelectAllStudents = (selectAll) => {
    setAiExtractedStudents(prev => prev.map(s => ({ ...s, selected: selectAll })))
  }

  const handleUpdateExtractedStudent = (tempId, field, value) => {
    setAiExtractedStudents(prev => prev.map(s => s.tempId === tempId ? { ...s, [field]: value } : s))
  }

  const handleSaveAiScannedStudents = async () => {
    if (!selectedClassId) {
      alert('Pilih rombel kelas terlebih dahulu!')
      return
    }

    const studentsToSave = aiExtractedStudents.filter(s => s.selected && s.name.trim())
    if (studentsToSave.length === 0) {
      alert('Tidak ada siswa yang dipilih untuk disimpan!')
      return
    }

    setAiSaving(true)
    try {
      const records = studentsToSave.map(s => ({
        class_id: selectedClassId,
        name: s.name.trim(),
        nisn: s.nisn.trim() || null,
        gender: s.gender
      }))

      const { data, error } = await supabase.from('students').insert(records).select()
      if (error) throw error

      setStudents(prev => [...prev, ...(data || [])])
      setMessage({
        type: 'success',
        text: `✨ Berhasil menambahkan ${records.length} siswa ke kelas melalui AI Scan (${aiUsedModel})!`
      })
      setShowAiScanModal(false)
      setAiScanFile(null)
      setAiScanPreview(null)
      setAiExtractedStudents([])
      fetchStudents(selectedClassId)
    } catch (err) {
      console.error(err)
      setAiScanError('Gagal menyimpan siswa ke database: ' + err.message)
    } finally {
      setAiSaving(false)
    }
  }

  // ===================== PENGATURAN MATA PELAJARAN =====================
  const handleAddSubject = async (e) => {
    e.preventDefault()
    const trimmed = newSubjectName.trim()
    if (!trimmed) return
    if (subjectsList.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      alert('Mata pelajaran tersebut sudah ada dalam daftar!')
      return
    }
    const updated = [...subjectsList, trimmed]
    setSubjectsList(updated)
    await saveCustomSubjects(updated, supabase)
    setNewSubjectName('')
    setMessage({ type: 'success', text: `Mata pelajaran "${trimmed}" berhasil ditambahkan!` })
  }

  const handleDeleteSubject = async (index, name) => {
    if (!window.confirm(`Hapus mata pelajaran "${name}"?`)) return
    const updated = subjectsList.filter((_, idx) => idx !== index)
    setSubjectsList(updated)
    await saveCustomSubjects(updated, supabase)
    setMessage({ type: 'success', text: `Mata pelajaran "${name}" telah dihapus.` })
  }

  const handleStartEditSubject = (index, name) => {
    setEditingIndex(index)
    setEditSubjectValue(name)
  }

  const handleSaveEditSubject = async (index) => {
    const trimmed = editSubjectValue.trim()
    if (!trimmed) return
    const updated = [...subjectsList]
    updated[index] = trimmed
    setSubjectsList(updated)
    await saveCustomSubjects(updated, supabase)
    setEditingIndex(null)
    setMessage({ type: 'success', text: `Mata pelajaran berhasil diperbarui menjadi "${trimmed}".` })
  }

  const handleResetDefaultSubjects = async () => {
    if (!window.confirm('Kembalikan daftar mata pelajaran ke pengaturan bawaan kurikulum standar?')) return
    setSubjectsList(DEFAULT_SUBJECTS)
    await saveCustomSubjects(DEFAULT_SUBJECTS, supabase)
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
                <>
                  <button
                    onClick={() => {
                      if (!selectedClassId) {
                        alert('Pilih rombel kelas terlebih dahulu!')
                        return
                      }
                      setAiScanError(null)
                      setAiExtractedStudents([])
                      setShowAiScanModal(true)
                    }}
                    type="button"
                    className="btn"
                    style={{
                      width: 'auto',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                      color: 'white',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                    }}
                    title="Pindai lembar daftar siswa / absensi kertas via foto AI"
                  >
                    <Sparkles size={15} />
                    <span>Scan Siswa (AI)</span>
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
                </>
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

            {/* Modal / Form Edit Nama Kelas */}
            {editClassModal && (
              <form onSubmit={handleEditClass} style={{ padding: '1rem', background: '#EFF6FF', borderRadius: '14px', border: '1px solid #BFDBFE', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1E40AF', marginBottom: '4px' }}>
                    Edit Nama Rombel: {editClassModal.name}
                  </div>
                  <input
                    type="text"
                    value={editClassNameInput}
                    onChange={(e) => setEditClassNameInput(e.target.value)}
                    required
                    className="input"
                    style={{ padding: '0.55rem 0.85rem', fontSize: '0.85rem', borderRadius: '10px' }}
                  />
                </div>
                <button type="submit" className="btn" style={{ width: 'auto', padding: '0.55rem 1rem', borderRadius: '10px', background: '#2563EB', color: 'white', fontWeight: 'bold', fontSize: '0.8rem', marginTop: '16px' }}>
                  Simpan Perubahan
                </button>
                <button type="button" onClick={() => setEditClassModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', marginTop: '16px' }}>
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
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="input"
                    style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                  >
                    {(classes || []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {isAdmin && selectedClassId && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const cls = classes.find(c => c.id === selectedClassId)
                          if (cls) {
                            setEditClassModal(cls)
                            setEditClassNameInput(cls.name)
                          }
                        }}
                        title="Edit Nama Kelas Ini (Khusus Admin)"
                        style={{
                          background: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          color: '#2563EB',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const cls = classes.find(c => c.id === selectedClassId)
                          if (cls) handleDeleteClass(cls.id, cls.name)
                        }}
                        title="Hapus Kelas Ini (Khusus Admin)"
                        style={{
                          background: '#FEF2F2',
                          border: '1px solid #FECACA',
                          color: '#DC2626',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
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

      {/* MODAL AI: PINDAI & EKSTRAK DAFTAR SISWA DARI FOTO DOKUMEN */}
      {showAiScanModal && (
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
            maxWidth: '680px',
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
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
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
                    Scan Daftar Siswa & NISN (AI)
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                    Target: <strong style={{ color: '#4F46E5' }}>{classes.find(c => c.id === selectedClassId)?.name || 'Pilih Kelas'}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!aiScanLoading && !aiSaving) {
                    setShowAiScanModal(false)
                    setAiScanError(null)
                  }
                }}
                disabled={aiScanLoading || aiSaving}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Message */}
            {aiScanError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>{aiScanError}</span>
              </div>
            )}

            {/* TAHAP 1: UPLOAD / FOTO DOKUMEN (Jika belum diekstrak) */}
            {aiExtractedStudents.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label
                  style={{
                    border: '2px dashed #CBD5E1',
                    borderRadius: '18px',
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    cursor: aiScanLoading ? 'not-allowed' : 'pointer',
                    background: '#F8FAFC',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.6rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    disabled={aiScanLoading}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setAiScanFile(file)
                        const previewUrl = URL.createObjectURL(file)
                        setAiScanPreview(previewUrl)
                        setAiScanError(null)
                      }
                    }}
                  />
                  {aiScanPreview ? (
                    <div style={{ position: 'relative', width: '100%', maxHeight: '220px', display: 'flex', justifyContent: 'center' }}>
                      <img
                        src={aiScanPreview}
                        alt="Preview Dokumen"
                        style={{ maxHeight: '200px', borderRadius: '12px', objectFit: 'contain', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  ) : (
                    <>
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4F46E5' }}>
                        <Camera size={26} />
                      </div>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#1E293B' }}>
                        Ambil Foto atau Pilih Gambar Lembar Siswa
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: '380px' }}>
                        Bisa berupa foto lembar absensi cetak, buku induk, atau daftar tulisan tangan yang rapi.
                      </span>
                    </>
                  )}
                </label>

                {aiScanFile && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', background: '#F1F5F9', padding: '6px 12px', borderRadius: '10px' }}>
                    <span>File terpilih: <strong>{aiScanFile.name}</strong></span>
                    <button
                      type="button"
                      disabled={aiScanLoading}
                      onClick={() => {
                        setAiScanFile(null)
                        setAiScanPreview(null)
                      }}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Ganti Foto
                    </button>
                  </div>
                )}

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={14} color="#6366F1" style={{ flexShrink: 0 }} />
                  <span>Sistem memprioritaskan <strong>Gemini 3.8 Flash</strong>, lalu otomatis beralih ke <strong>2.0 Flash</strong> jika kuota batas tercapai.</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowAiScanModal(false)}
                    disabled={aiScanLoading}
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
                    onClick={handleScanStudentsWithAi}
                    disabled={aiScanLoading || !aiScanFile}
                    style={{
                      flex: 2,
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: 'none',
                      background: (aiScanLoading || !aiScanFile) ? '#94A3B8' : 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.85rem',
                      cursor: (aiScanLoading || !aiScanFile) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: (aiScanLoading || !aiScanFile) ? 'none' : '0 4px 12px rgba(79, 70, 229, 0.35)'
                    }}
                  >
                    {aiScanLoading ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        <span>Mengekstrak Dokumen Siswa...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Mulai Pindai Dokumen</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* TAHAP 2: TABEL PRATINJAU & VERIFIKASI HASIL SCAN */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: '#EEF2FF', padding: '0.65rem 0.85rem', borderRadius: '14px', border: '1px solid #C7D2FE' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={18} color="#4F46E5" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#312E81' }}>
                      Terdeteksi {aiExtractedStudents.length} Siswa
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#4338CA', background: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                      AI: {aiUsedModel}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAiExtractedStudents([])
                      setAiScanFile(null)
                      setAiScanPreview(null)
                    }}
                    style={{ background: 'none', border: 'none', color: '#4F46E5', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', textDecoration: 'underline' }}
                  >
                    Foto Ulang
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                  <span>Silakan periksa nama & NISN sebelum disimpan. Anda bisa mengedit langsung di tabel jika ada koreksi.</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAllStudents(true)}
                      style={{ background: 'none', border: 'none', color: '#4F46E5', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Pilih Semua
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAllStudents(false)}
                      style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      Batal Semua
                    </button>
                  </div>
                </div>

                {/* Tabel List Siswa yang Terdeteksi */}
                <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '14px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                        <th style={{ padding: '8px', width: '36px', textAlign: 'center' }}>Pilih</th>
                        <th style={{ padding: '8px', width: '32px' }}>No</th>
                        <th style={{ padding: '8px' }}>Nama Lengkap Siswa</th>
                        <th style={{ padding: '8px', width: '130px' }}>NISN</th>
                        <th style={{ padding: '8px', width: '65px' }}>L/P</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiExtractedStudents.map((st, index) => (
                        <tr key={st.tempId} style={{ borderBottom: '1px solid #F1F5F9', background: st.selected ? 'white' : '#F8FAFC', opacity: st.selected ? 1 : 0.6 }}>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={st.selected}
                              onChange={() => handleToggleSelectStudent(st.tempId)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px', color: '#94A3B8', fontWeight: 'bold' }}>
                            {index + 1}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type="text"
                              value={st.name}
                              onChange={(e) => handleUpdateExtractedStudent(st.tempId, 'name', e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type="text"
                              value={st.nisn}
                              placeholder="NISN (opsional)"
                              onChange={(e) => handleUpdateExtractedStudent(st.tempId, 'nisn', e.target.value)}
                              style={{ width: '100%', padding: '4px 8px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <select
                              value={st.gender}
                              onChange={(e) => handleUpdateExtractedStudent(st.tempId, 'gender', e.target.value)}
                              style={{ padding: '4px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                            >
                              <option value="L">L</option>
                              <option value="P">P</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer Modal Preview */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 'bold' }}>
                    {aiExtractedStudents.filter(s => s.selected).length} dari {aiExtractedStudents.length} siswa akan disimpan
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAiScanModal(false)}
                      disabled={aiSaving}
                      style={{ padding: '0.65rem 1rem', borderRadius: '12px', border: '1px solid #CBD5E1', background: 'white', color: '#475569', fontWeight: 'bold', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAiScannedStudents}
                      disabled={aiSaving || aiExtractedStudents.filter(s => s.selected).length === 0}
                      style={{
                        padding: '0.65rem 1.25rem',
                        borderRadius: '12px',
                        border: 'none',
                        background: aiSaving ? '#94A3B8' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.82rem',
                        cursor: aiSaving ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      {aiSaving ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          <span>Menyimpan ke Kelas...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} />
                          <span>Simpan Siswa ke Kelas</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
