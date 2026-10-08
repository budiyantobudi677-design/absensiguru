'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Award, Save, RefreshCw, Layers, Sparkles, Filter, CheckCircle2, TrendingUp, HelpCircle } from 'lucide-react'

export default function InputNilaiSiswa({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [students, setStudents] = useState([])
  const [subject, setSubject] = useState(user?.mata_pelajaran || 'Matematika')
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [assessmentType, setAssessmentType] = useState('tp') // 'tp' | 'sts' | 'sas'
  const [assessmentNumber, setAssessmentNumber] = useState(1) // 1..50
  
  const [gradesMap, setGradesMap] = useState({})
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
      fetchStudentsAndGrades()
    }
  }, [activeClassId, subject, semester, academicYear, assessmentType, assessmentNumber])

  const fetchStudentsAndGrades = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { data: studentList, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })

      if (sErr) throw sErr
      setStudents(studentList || [])

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
      const rowsToUpsert = students.map(st => ({
        student_id: st.id,
        class_id: activeClassId,
        teacher_id: user?.id,
        mata_pelajaran: subject,
        semester: semester,
        tahun_ajaran: academicYear,
        tipe_penilaian: assessmentType,
        nomor_penilaian: Number(assessmentNumber),
        nilai: gradesMap[st.id] !== undefined && gradesMap[st.id] !== '' ? Number(gradesMap[st.id]) : 0
      }))

      const { error } = await supabase
        .from('student_grades')
        .upsert(rowsToUpsert, {
          onConflict: 'student_id,class_id,mata_pelajaran,semester,tahun_ajaran,tipe_penilaian,nomor_penilaian'
        })

      if (error) throw error

      setMessage({ type: 'success', text: `Nilai berhasil disimpan untuk ${students.length} siswa!` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // Calculate live statistics
  const filledGrades = Object.values(gradesMap).filter(v => v !== '' && v !== undefined && !isNaN(v)).map(Number)
  const averageGrade = filledGrades.length > 0 ? (filledGrades.reduce((a, b) => a + b, 0) / filledGrades.length).toFixed(1) : '-'
  const highestGrade = filledGrades.length > 0 ? Math.max(...filledGrades) : '-'
  const lowestGrade = filledGrades.length > 0 ? Math.min(...filledGrades) : '-'
  const kkmScore = schoolInfo?.kkm || 75
  const tuntasCount = filledGrades.filter(n => n >= kkmScore).length

  return (
    <div className="flex flex-col gap-4">
      {/* Control Configuration Panel */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
          <div>
            <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider bg-purple-50 px-2.5 py-0.5 rounded-full inline-block mb-1">
              Buku Nilai Digital
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Input Nilai Formatif & Sumatif</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
              KKM Acuan: {kkmScore}
            </span>
          </div>
        </div>

        {/* Filters Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Kelas / Rombel</label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Mata Pelajaran</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
            >
              {standardSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Kategori Penilaian</label>
            <div className="flex gap-1.5">
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value)}
                className="flex-1 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
              >
                <option value="tp">Tugas / UH (Formatif)</option>
                <option value="sts">STS (Tengah Semester)</option>
                <option value="sas">SAS (Akhir Semester)</option>
              </select>
              {assessmentType === 'tp' && (
                <select
                  value={assessmentNumber}
                  onChange={(e) => setAssessmentNumber(Number(e.target.value))}
                  className="w-16 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2 py-2 text-xs sm:text-sm font-bold text-slate-800 transition-all focus:outline-none text-center cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>Ke-{n}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Semester & Tahun</label>
            <div className="flex gap-1.5">
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="flex-1 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
              >
                <option value="ganjil">Ganjil</option>
                <option value="genap">Genap</option>
              </select>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="flex-1 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-2 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
              >
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-[11px] underline opacity-75">Tutup</button>
        </div>
      )}

      {/* Analytics Mini Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rata-rata Nilai</div>
          <div className="text-xl font-black text-purple-700 mt-1">{averageGrade}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Seluruh siswa aktif</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tuntas KKM</div>
          <div className="text-xl font-black text-emerald-600 mt-1">{tuntasCount} / {students.length}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Nilai &ge; {kkmScore}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nilai Tertinggi</div>
          <div className="text-xl font-black text-blue-600 mt-1">{highestGrade}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Skor maksimal</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nilai Terendah</div>
          <div className="text-xl font-black text-rose-600 mt-1">{lowestGrade}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Skor minimal</div>
        </div>
      </div>

      {/* Grade Entry Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-purple-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Input Nilai Siswa ({students.length} Siswa)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Rentang skor: 0 - 100</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat daftar siswa & nilai...
          </div>
        ) : students.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            Belum ada siswa di kelas ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {students.map((student, idx) => {
              const currentScore = gradesMap[student.id] !== undefined ? gradesMap[student.id] : ''
              const isTuntas = currentScore !== '' && Number(currentScore) >= kkmScore
              const predikat = currentScore === '' ? '-' : currentScore >= 90 ? 'A' : currentScore >= 80 ? 'B' : currentScore >= 70 ? 'C' : 'D'

              return (
                <div
                  key={student.id}
                  className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-bold text-slate-300">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/60">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900">{student.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        NISN: {student.nisn || '-'} • L/P: {student.gender || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Badge Predikat */}
                    <div className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center ${
                      predikat === 'A' ? 'bg-emerald-100 text-emerald-700' :
                      predikat === 'B' ? 'bg-blue-100 text-blue-700' :
                      predikat === 'C' ? 'bg-amber-100 text-amber-700' :
                      predikat === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {predikat}
                    </div>

                    {/* Numeric Input */}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentScore}
                      onChange={(e) => handleGradeChange(student.id, e.target.value)}
                      placeholder="0"
                      className={`w-16 sm:w-20 px-3 py-1.5 rounded-xl text-center text-xs sm:text-sm font-bold border transition-all focus:outline-none focus:ring-2 ${
                        currentScore === ''
                          ? 'border-slate-200 bg-white text-slate-700'
                          : isTuntas
                          ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800 focus:ring-emerald-500/20'
                          : 'border-rose-200 bg-rose-50/50 text-rose-800 focus:ring-rose-500/20'
                      }`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Nilai tersimpan akan otomatis terintegrasi ke rekap rapor & leger.
          </span>
          <button
            onClick={handleSaveGrades}
            disabled={saving || students.length === 0}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Semua Nilai'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
