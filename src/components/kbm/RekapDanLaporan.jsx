'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FileSpreadsheet, Printer, Download, Search, Filter, Sparkles, Calendar, BookOpen, Award, CheckCircle } from 'lucide-react'
import { exportAttendanceRecapExcel, exportGradesRecapExcel, exportJournalsRecapExcel } from '../../lib/excelExport'

export default function RekapDanLaporan({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [rekapType, setRekapType] = useState('kehadiran')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [subject, setSubject] = useState('Semua')

  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [gradeRecords, setGradeRecords] = useState([])
  const [journalRecords, setJournalRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const activeClassName = classes?.find(c => c.id === activeClassId)?.name || 'Kelas'

  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  useEffect(() => {
    if (activeClassId) {
      loadReportData()
    }
  }, [activeClassId, rekapType, month, semester, academicYear, subject])

  const loadReportData = async () => {
    setLoading(true)
    try {
      const { data: stList } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })
      setStudents(stList || [])

      if (rekapType === 'kehadiran') {
        const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-')
        const firstDay = `${y}-${m}-01`
        const lastDateObj = new Date(Number(y), Number(m), 0)
        const lastDay = `${lastDateObj.getFullYear()}-${String(lastDateObj.getMonth() + 1).padStart(2, '0')}-${String(lastDateObj.getDate()).padStart(2, '0')}`

        const { data: attList } = await supabase
          .from('student_attendance')
          .select('*')
          .eq('class_id', activeClassId)
          .gte('tanggal', firstDay)
          .lte('tanggal', lastDay)
        setAttendanceRecords(attList || [])
      } else if (rekapType === 'nilai') {
        let q = supabase
          .from('student_grades')
          .select('*')
          .eq('class_id', activeClassId)
          .eq('semester', semester)
          .eq('tahun_ajaran', academicYear)

        if (subject !== 'Semua') {
          q = q.eq('mata_pelajaran', subject)
        }
        const { data: grList } = await q
        setGradeRecords(grList || [])
      } else if (rekapType === 'jurnal') {
        const { data: jrList } = await supabase
          .from('learning_journals')
          .select('*')
          .eq('class_id', activeClassId)
          .order('tanggal', { ascending: false })
        setJournalRecords(jrList || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getStudentAttStats = (studentId) => {
    let h = 0, s = 0, i = 0, a = 0
    attendanceRecords.forEach(att => {
      if (att.student_id === studentId) {
        if (att.status === 'hadir') h++
        else if (att.status === 'sakit') s++
        else if (att.status === 'izin') i++
        else if (att.status === 'alpha') a++
      }
    })
    const total = h + s + i + a
    const pct = total > 0 ? ((h / total) * 100).toFixed(1) : '100.0'
    return { h, s, i, a, pct, total }
  }

  const handleExportExcel = () => {
    const schoolInfoObj = {
      schoolName: schoolInfo?.schoolName || 'Presensia',
      principalName: schoolInfo?.principalName || '',
      principalNIP: schoolInfo?.principalNIP || '',
      teacherName: user?.full_name || user?.email || 'Guru',
      teacherNIP: user?.nip || '',
      appMode: schoolInfo?.appMode || 'SD'
    }

    if (rekapType === 'kehadiran') {
      const rows = students.map((st, idx) => {
        const stats = getStudentAttStats(st.id)
        return [idx + 1, st.nisn || '-', st.name, st.gender || '-', stats.h, stats.s, stats.i, stats.a, `${stats.pct}%`]
      })
      exportAttendanceRecapExcel({
        title: 'REKAPITULASI PRESENSI SISWA',
        className: activeClassName,
        periodText: month,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'NISN', 'Nama Siswa', 'L/P', 'Hadir', 'Sakit', 'Izin', 'Alpha', '% Hadir'],
          rows
        }
      })
    } else if (rekapType === 'nilai') {
      const rows = students.map((st, idx) => {
        const stGrades = gradeRecords.filter(g => g.student_id === st.id)
        const avg = stGrades.length > 0 ? (stGrades.reduce((a, b) => a + Number(b.nilai), 0) / stGrades.length).toFixed(1) : '-'
        const predikat = avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg !== '-' ? 'D' : '-'
        return [idx + 1, st.nisn || '-', st.name, st.gender || '-', avg, predikat]
      })
      exportGradesRecapExcel({
        title: 'REKAPITULASI NILAI SISWA',
        className: activeClassName,
        subjectName: subject,
        periodText: `Semester ${semester} ${academicYear}`,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'NISN', 'Nama Siswa', 'L/P', 'Rata-rata Nilai', 'Predikat'],
          rows
        }
      })
    } else if (rekapType === 'jurnal') {
      const rows = journalRecords.map((j, idx) => [
        idx + 1,
        j.tanggal,
        j.mata_pelajaran,
        j.topik,
        j.teknik || 'Luring',
        j.kegiatan || '-',
        j.penilaian || '-'
      ])
      exportJournalsRecapExcel({
        title: 'REKAPITULASI JURNAL PEMBELAJARAN',
        className: activeClassName,
        periodText: `Tahun Ajaran ${academicYear}`,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'Tanggal', 'Mata Pelajaran', 'Materi/Topik', 'Metode', 'Ringkasan Kegiatan', 'Penilaian'],
          rows
        }
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Card */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#EA580C', background: '#FFEDD5', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pusat Pelaporan KBM
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>
              Rekapitulasi, Ekspor Excel & Cetak PDF
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleExportExcel}
              type="button"
              className="btn"
              style={{
                width: 'auto',
                padding: '0.55rem 1rem',
                borderRadius: '12px',
                background: '#10B981',
                color: 'white',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileSpreadsheet size={15} />
              <span>Unduh Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              type="button"
              className="btn"
              style={{
                width: 'auto',
                padding: '0.55rem 1rem',
                borderRadius: '12px',
                background: '#1E293B',
                color: 'white',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Printer size={15} />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>

        {/* Segmented Switcher Modul Rekap */}
        <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '14px', marginBottom: '1rem' }}>
          <button
            onClick={() => setRekapType('kehadiran')}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              background: rekapType === 'kehadiran' ? 'white' : 'transparent',
              color: rekapType === 'kehadiran' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'kehadiran' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Presensi Siswa
          </button>
          <button
            onClick={() => setRekapType('nilai')}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              background: rekapType === 'nilai' ? 'white' : 'transparent',
              color: rekapType === 'nilai' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'nilai' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Nilai Siswa
          </button>
          <button
            onClick={() => setRekapType('jurnal')}
            style={{
              flex: 1,
              padding: '7px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              background: rekapType === 'jurnal' ? 'white' : 'transparent',
              color: rekapType === 'jurnal' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'jurnal' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Jurnal Mengajar
          </button>
        </div>

        {/* Filter Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Pilih Rombel / Kelas
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

          {rekapType === 'kehadiran' && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Periode Bulan
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              />
            </div>
          )}

          {rekapType === 'nilai' && (
            <>
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
                  <option value="Semua">-- Semua Mata Pelajaran --</option>
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="IPA / Sains">IPA / Sains</option>
                  <option value="IPS / Sosial">IPS / Sosial</option>
                  <option value="Pendidikan Agama & Budi Pekerti">Pendidikan Agama</option>
                  <option value="Pendidikan Pancasila / PKn">Pancasila / PKn</option>
                  <option value="Seni Budaya & Prakarya">Seni Budaya</option>
                  <option value="Pendidikan Jasmani (PJOK)">PJOK</option>
                  <option value="Informatika / TIK">Informatika</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Semester & Tahun
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
            </>
          )}

          {rekapType === 'jurnal' && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Tahun Ajaran
              </label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
              >
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Table Data Preview */}
      <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Pratinjau Data Laporan ({rekapType.toUpperCase()})
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {rekapType === 'jurnal' ? `${journalRecords.length} Jurnal` : `${students.length} Siswa`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Menyusun data laporan...
          </div>
        ) : rekapType === 'kehadiran' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'center', width: '45px' }}>No</th>
                  <th style={{ padding: '10px 14px' }}>Nama Siswa</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#10B981' }}>Hadir (H)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#F59E0B' }}>Sakit (S)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#3B82F6' }}>Izin (I)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#EF4444' }}>Alpha (A)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', color: '#4F46E5' }}>% Hadir</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stats = getStudentAttStats(st.id)
                    return (
                      <tr key={st.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.4)' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text)' }}>
                          <div>{st.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{st.nisn ? `NISN: ${st.nisn}` : ''}</div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#10B981', background: 'rgba(16, 185, 129, 0.05)' }}>{stats.h}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#F59E0B' }}>{stats.s}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#3B82F6' }}>{stats.i}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#EF4444' }}>{stats.a}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#4F46E5' }}>{stats.pct}%</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'nilai' ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'center', width: '45px' }}>No</th>
                  <th style={{ padding: '10px 14px' }}>Nama Siswa</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Rata-rata Nilai</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Predikat Kelulusan</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stGr = gradeRecords.filter(g => g.student_id === st.id)
                    const avg = stGr.length > 0 ? (stGr.reduce((a, b) => a + Number(b.nilai), 0) / stGr.length).toFixed(1) : '-'
                    const predikat = avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg !== '-' ? 'D' : '-'
                    return (
                      <tr key={st.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.4)' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text)' }}>
                          <div>{st.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{st.nisn ? `NISN: ${st.nisn}` : ''}</div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#7C3AED' }}>{avg}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            background: predikat === 'A' ? '#D1FAE5' : predikat === 'B' ? '#DBEAFE' : predikat === 'C' ? '#FEF3C7' : predikat === 'D' ? '#FEE2E2' : '#F1F5F9',
                            color: predikat === 'A' ? '#065F46' : predikat === 'B' ? '#1E40AF' : predikat === 'C' ? '#92400E' : predikat === 'D' ? '#991B1B' : '#64748B'
                          }}>
                            {predikat}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {journalRecords.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Belum ada jurnal yang tercatat.
              </div>
            ) : (
              journalRecords.map((j) => (
                <div key={j.id} style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: 'var(--text)', fontSize: '0.9rem' }}>{j.topik}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{j.tanggal}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Mata Pelajaran: <strong style={{ color: '#4F46E5' }}>{j.mata_pelajaran}</strong> • Metode: {j.teknik || 'Luring'}
                  </div>
                  {j.kegiatan && <p style={{ fontSize: '0.8rem', color: '#475569', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', margin: '4px 0 0 0' }}>{j.kegiatan}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
