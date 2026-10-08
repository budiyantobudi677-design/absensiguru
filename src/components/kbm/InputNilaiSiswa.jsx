'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Award, Save, RefreshCw, Layers } from 'lucide-react'

export default function InputNilaiSiswa({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes[0]?.id || ''))
  const [students, setStudents] = useState([])
  const [subject, setSubject] = useState(user?.mata_pelajaran || 'Matematika')
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [assessmentType, setAssessmentType] = useState('tp') // 'tp' | 'sts' | 'sas'
  const [assessmentNumber, setAssessmentNumber] = useState(1) // 1..50
  
  const [gradesMap, setGradesMap] = useState({}) // { studentId: score }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

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
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  useEffect(() => {
    if (activeClassId) {
      fetchStudentsAndGrades()
    }
  }, [activeClassId, subject, semester, academicYear, assessmentType, assessmentNumber])

  const fetchStudentsAndGrades = async () => {
    setLoading(true)
    setMessage(null)
    try {
      // 1. Fetch Students
      const { data: studentList, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })

      if (sErr) throw sErr
      setStudents(studentList || [])

      // 2. Fetch Grades for this specific combination
      const { data: gradeList, error: gErr } = await supabase
        .from('student_grades')
        .select('*')
        .eq('class_id', activeClassId)
        .eq('mata_pelajaran', subject)
        .eq('semester', semester)
        .eq('tahun_ajaran', academicYear)
        .eq('tipe_penilaian', assessmentType)
        .eq('nomor_penilaian', assessmentNumber)

      if (gErr) throw gErr

      const map = {}
      if (gradeList) {
        gradeList.forEach(g => {
          map[g.student_id] = g.nilai
        })
      }
      setGradesMap(map)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal memuat nilai: ' + err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleGradeChange = (studentId, val) => {
    const num = val === '' ? '' : Math.min(100, Math.max(0, Number(val)))
    setGradesMap(prev => ({
      ...prev,
      [studentId]: num
    }))
  }

  const handleSaveGrades = async () => {
    if (!students || students.length === 0) return
    setSaving(true)
    setMessage(null)

    try {
      const recordsToUpsert = []
      students.forEach(st => {
        const val = gradesMap[st.id]
        if (val !== undefined && val !== '') {
          recordsToUpsert.push({
            student_id: st.id,
            class_id: activeClassId,
            teacher_id: user?.id || null,
            mata_pelajaran: subject,
            semester: semester,
            tahun_ajaran: academicYear,
            tipe_penilaian: assessmentType,
            nomor_penilaian: Number(assessmentNumber),
            nilai: Number(val)
          })
        }
      })

      if (recordsToUpsert.length === 0) {
        setMessage({ type: 'error', text: 'Belum ada nilai yang diinputkan.' })
        setSaving(false)
        return
      }

      const { error } = await supabase
        .from('student_grades')
        .upsert(recordsToUpsert, {
          onConflict: 'student_id, mata_pelajaran, semester, tahun_ajaran, tipe_penilaian, nomor_penilaian'
        })

      if (error) throw error

      setMessage({ type: 'success', text: `Nilai ${assessmentType.toUpperCase()} ${assessmentNumber} berhasil disimpan!` })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan nilai: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const getPredicate = (score) => {
    if (score === '' || score === undefined || score === null) return '-'
    const kkm = schoolInfo?.kkm || 75
    if (score >= 90) return 'A (Sangat Baik)'
    if (score >= kkm) return 'B (Baik)'
    if (score >= 60) return 'C (Cukup)'
    return 'D (Perlu Bimbingan)'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Parameter Penilaian */}
      <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
        <h3 className="text-lg font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--text)' }}>
          <span>✍️</span> Input Nilai Siswa (Kurikulum Merdeka)
        </h3>
        <p className="text-xs text-muted mb-4">Input nilai Tujuan Pembelajaran (TP 1-50), STS, dan SAS per mata pelajaran.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
            <label className="text-xs font-semibold text-muted block mb-1">Mata Pelajaran</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input text-sm font-semibold"
            >
              {standardSubjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="input text-sm font-semibold"
            >
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Tahun Ajaran</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="input text-sm font-semibold"
            >
              <option value="2026/2027">2026/2027</option>
              <option value="2025/2026">2025/2026</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Jenis Asesmen</label>
            <select
              value={assessmentType}
              onChange={(e) => setAssessmentType(e.target.value)}
              className="input text-sm font-semibold"
            >
              <option value="tp">TP (Formatif/Lingkup Materi)</option>
              <option value="sts">STS (Sumatif Tengah Sem)</option>
              <option value="sas">SAS (Sumatif Akhir Sem)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Nomor</label>
            {assessmentType === 'tp' ? (
              <select
                value={assessmentNumber}
                onChange={(e) => setAssessmentNumber(Number(e.target.value))}
                className="input text-sm font-semibold"
              >
                {Array.from({ length: 50 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>TP {n}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                disabled
                value={assessmentType.toUpperCase()}
                className="input text-sm font-semibold bg-gray-100 text-gray-500"
              />
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-xs font-semibold text-center border ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tabel Input Nilai */}
      <div className="card" style={{ padding: '1rem', borderRadius: '18px' }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-muted">
            TABEL NILAI: {subject} ({assessmentType.toUpperCase()} {assessmentType === 'tp' ? assessmentNumber : ''})
          </span>
          <span className="text-xs font-bold text-indigo-600">KKM: {schoolInfo?.kkm || 75}</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat daftar nilai...
          </div>
        ) : students.length === 0 ? (
          <div className="py-8 text-center text-muted text-xs">
            Belum ada murid di kelas ini.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {students.map((student, idx) => {
              const currentVal = gradesMap[student.id] !== undefined ? gradesMap[student.id] : ''
              const pred = getPredicate(currentVal)
              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-6 text-center text-xs font-bold text-gray-400 shrink-0">{idx + 1}</span>
                    <div className="truncate">
                      <div className="text-xs font-bold text-gray-800 truncate">{student.name}</div>
                      <div className="text-[10px] text-gray-400">Predikat: <span className="font-semibold text-indigo-600">{pred}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentVal}
                      onChange={(e) => handleGradeChange(student.id, e.target.value)}
                      placeholder="0-100"
                      className="w-20 text-center font-bold text-sm py-1.5 px-2 rounded-lg border border-gray-300 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {students.length > 0 && (
          <button
            onClick={handleSaveGrades}
            disabled={saving}
            className="btn btn-primary mt-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin"></div> : <Save size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Nilai'}
          </button>
        )}
      </div>
    </div>
  )
}
