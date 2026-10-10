'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Award, Save, RefreshCw, Layers, Sparkles, Filter, CheckCircle2, TrendingUp, HelpCircle, ShieldAlert } from 'lucide-react'
import { getCustomSubjects } from '../../lib/subjectsManager'

export default function InputNilaiSiswa({ selectedClass, classes, user, profile, schoolInfo }) {
  const activeProfile = profile || user || {}
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [students, setStudents] = useState([])
  const [availableSubjects, setAvailableSubjects] = useState(getCustomSubjects())
  const [subject, setSubject] = useState(activeProfile?.mata_pelajaran || getCustomSubjects()[0] || 'Matematika')
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [assessmentType, setAssessmentType] = useState('tp') // 'tp' | 'sts' | 'sas'
  const [assessmentNumber, setAssessmentNumber] = useState(1) // 1..10
  
  const [gradesMap, setGradesMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const onSubjectsUpdated = () => {
      const subs = getCustomSubjects()
      setAvailableSubjects(subs)
      if (!subs.includes(subject)) {
        setSubject(subs[0] || 'Matematika')
      }
    }
    window.addEventListener('kbm_subjects_updated', onSubjectsUpdated)
    return () => window.removeEventListener('kbm_subjects_updated', onSubjectsUpdated)
  }, [subject])

  const standardSubjects = availableSubjects

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
      const { data: stList, error: stErr } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })

      if (stErr) throw stErr
      setStudents(stList || [])

      const { data: grList, error: grErr } = await supabase
        .from('student_grades')
        .select('*')
        .eq('class_id', activeClassId)
        .eq('mata_pelajaran', subject)
        .eq('semester', semester)
        .eq('tahun_ajaran', academicYear)
        .eq('tipe_penilaian', assessmentType)
        .eq('nomor_penilaian', assessmentNumber)

      if (grErr) throw grErr

      const map = {}
      if (grList) {
        grList.forEach(g => {
          map[g.student_id] = g.nilai !== null ? g.nilai : ''
        })
      }
      setGradesMap(map)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal memuat data nilai: ' + err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleGradeChange = (studentId, value) => {
    if (value !== '' && (isNaN(value) || Number(value) < 0 || Number(value) > 100)) {
      return
    }
    setGradesMap(prev => ({
      ...prev,
      [studentId]: value
    }))
  }

  const handleSaveGrades = async () => {
    if (!students || students.length === 0) return
    setSaving(true)
    setMessage(null)

    try {
      const recordsToUpsert = students
        .filter(st => gradesMap[st.id] !== undefined && gradesMap[st.id] !== '')
        .map(st => ({
          student_id: st.id,
          class_id: activeClassId,
          teacher_id: user?.id,
          mata_pelajaran: subject,
          semester: semester,
          tahun_ajaran: academicYear,
          tipe_penilaian: assessmentType,
          nomor_penilaian: assessmentNumber,
          nilai: Number(gradesMap[st.id])
        }))

      if (recordsToUpsert.length > 0) {
        const { error } = await supabase
          .from('student_grades')
          .upsert(recordsToUpsert, {
            onConflict: 'student_id,mata_pelajaran,semester,tahun_ajaran,tipe_penilaian,nomor_penilaian'
          })

        if (error) throw error
      }

      setMessage({ type: 'success', text: `Nilai berhasil disimpan untuk ${recordsToUpsert.length} siswa!` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  // Live Statistics
  const filledGrades = Object.values(gradesMap).filter(v => v !== '' && v !== undefined && !isNaN(v)).map(Number)
  const averageGrade = filledGrades.length > 0 ? (filledGrades.reduce((a, b) => a + b, 0) / filledGrades.length).toFixed(1) : '-'
  const highestGrade = filledGrades.length > 0 ? Math.max(...filledGrades) : '-'
  const lowestGrade = filledGrades.length > 0 ? Math.min(...filledGrades) : '-'
  const kkmScore = schoolInfo?.kkm || 75
  const tuntasCount = filledGrades.filter(n => n >= kkmScore).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Panel: Filters */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#9333EA', background: '#F3E8FF', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Leger & Buku Nilai Digital
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
              Input Nilai Akademik Siswa
            </h3>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6B21A8', background: '#FAF5FF', padding: '5px 12px', borderRadius: '12px', border: '1px solid #E9D5FF' }}>
            KKM Acuan: {kkmScore}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Kelas / Rombel
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
              Mata Pelajaran
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="input"
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
            >
              {standardSubjects.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Jenis Penilaian
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value)}
                className="input"
                style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              >
                <option value="tp">TP (Tujuan Pembelajaran)</option>
                <option value="lm">LM (Lingkup Materi)</option>
                <option value="asts">ASTS (Asesmen Sumatif Tengah Semester)</option>
                <option value="sts">STS / SAS (Sumatif Akhir)</option>
              </select>
              {(assessmentType === 'tp' || assessmentType === 'lm') && (
                <select
                  value={assessmentNumber}
                  onChange={(e) => setAssessmentNumber(Number(e.target.value))}
                  className="input"
                  style={{ width: '75px', padding: '0.65rem 0.4rem', fontSize: '0.875rem', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold' }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>Ke-{n}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Semester & Periode
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="input"
                style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              >
                <option value="ganjil">Ganjil</option>
                <option value="genap">Genap</option>
              </select>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="input"
                style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              >
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
              </select>
            </div>
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

      {/* KPI Ringkasan Nilai */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #E9D5FF', background: '#FAF5FF' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#7E22CE', lineHeight: 1 }}>{averageGrade}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#7E22CE', marginTop: '4px' }}>RATA-RATA</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #D1FAE5', background: '#F0FDF4' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#059669', lineHeight: 1 }}>{tuntasCount} / {students.length}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>TUNTAS KKM</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #DBEAFE', background: '#EFF6FF' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#2563EB', lineHeight: 1 }}>{highestGrade}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#2563EB', marginTop: '4px' }}>TERTINGGI</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #FEE2E2', background: '#FEF2F2' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#DC2626', lineHeight: 1 }}>{lowestGrade}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#DC2626', marginTop: '4px' }}>TERENDAH</div>
        </div>
      </div>

      {/* Main Student Grades Input List */}
      <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={16} color="#9333EA" />
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Input Nilai ({students.length} Siswa)
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rentang nilai: 0 - 100</span>
        </div>

        {loading ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Memuat data siswa dan nilai...
          </div>
        ) : students.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706' }}>
                <ShieldAlert size={26} />
              </div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
                Daftar Siswa Belum Diatur
              </h4>
              <p style={{ fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4', margin: 0 }}>
                Daftar siswa untuk rombel ini belum diatur oleh <b>Wali Kelas</b> atau <b>Admin</b>. Silakan hubungi Wali Kelas yang bersangkutan untuk menginput data siswa terlebih dahulu di Master KBM.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {students.map((student, idx) => {
              const currentScore = gradesMap[student.id] !== undefined ? gradesMap[student.id] : ''
              const isTuntas = currentScore !== '' && Number(currentScore) >= kkmScore
              const predikat = currentScore === '' ? '-' : currentScore >= 90 ? 'A' : currentScore >= 80 ? 'B' : currentScore >= 70 ? 'C' : 'D'

              return (
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
                      background: '#F1F5F9',
                      color: '#475569',
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: '1px solid #E2E8F0'
                    }}>
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 'bold', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {student.nisn ? `NISN: ${student.nisn} • ` : ''}{student.gender === 'P' ? 'P' : 'L'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {/* Badge Predikat */}
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: '900',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: predikat === 'A' ? '#D1FAE5' : predikat === 'B' ? '#DBEAFE' : predikat === 'C' ? '#FEF3C7' : predikat === 'D' ? '#FEE2E2' : '#F1F5F9',
                      color: predikat === 'A' ? '#065F46' : predikat === 'B' ? '#1E40AF' : predikat === 'C' ? '#92400E' : predikat === 'D' ? '#991B1B' : '#94A3B8'
                    }}>
                      {predikat}
                    </div>

                    {/* Numeric Input Nilai */}
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentScore}
                      onChange={(e) => handleGradeChange(student.id, e.target.value)}
                      placeholder="0"
                      style={{
                        width: '68px',
                        padding: '0.45rem 0.5rem',
                        borderRadius: '10px',
                        textAlign: 'center',
                        fontSize: '0.9rem',
                        fontWeight: '800',
                        border: currentScore === '' ? '1px solid var(--border)' : isTuntas ? '1px solid #10B981' : '1px solid #EF4444',
                        background: currentScore === '' ? 'var(--surface)' : isTuntas ? '#ECFDF5' : '#FEF2F2',
                        color: currentScore === '' ? 'var(--text)' : isTuntas ? '#065F46' : '#991B1B'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer Submit Button */}
        <div style={{ padding: '1rem 1.25rem', background: '#F8FAFC', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Nilai tersimpan akan terintegrasi ke buku nilai dan rekapitulasi.
          </span>
          <button
            onClick={handleSaveGrades}
            disabled={saving || students.length === 0}
            className="btn btn-primary"
            style={{
              width: 'auto',
              padding: '0.65rem 1.5rem',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              background: '#9333EA',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Save size={16} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Semua Nilai'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
