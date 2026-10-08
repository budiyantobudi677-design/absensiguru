'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FileSpreadsheet, Printer, Download, Search, Filter } from 'lucide-react'
import { exportAttendanceRecapExcel, exportGradesRecapExcel, exportJournalsRecapExcel } from '../../lib/excelExport'

export default function RekapDanLaporan({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes[0]?.id || ''))
  const [rekapType, setRekapType] = useState('kehadiran') // 'kehadiran' | 'nilai' | 'jurnal'
  const [month, setMonth] = useState('')
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [subject, setSubject] = useState('Semua')

  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [gradeRecords, setGradeRecords] = useState([])
  const [journalRecords, setJournalRecords] = useState([])
  const [loading, setLoading] = useState(false)

  const activeClassName = classes.find(c => c.id === activeClassId)?.name || 'Kelas'

  useEffect(() => {
    setMonth(new Date().toISOString().slice(0, 7))
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
      // 1. Fetch Students
      const { data: stList } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })
      setStudents(stList || [])

      if (rekapType === 'kehadiran') {
        // Fetch Attendance for the month
        const startDate = `${month}-01`
        const [y, m] = month.split('-').map(Number)
        const lastDay = new Date(y, m, 0).getDate()
        const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

        const { data: attList } = await supabase
          .from('student_attendance')
          .select('*')
          .eq('class_id', activeClassId)
          .gte('tanggal', startDate)
          .lte('tanggal', endDate)
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
        const { data: jList } = await supabase
          .from('learning_journals')
          .select('*, classes(name)')
          .eq('class_id', activeClassId)
          .order('tanggal', { ascending: false })
        setJournalRecords(jList || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Attendance Calculations per student
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
    return { h, s, i, a, total, pct }
  }

  // Handle Excel Export (Matching Absensi Super exactly)
  const handleExportExcel = () => {
    if (rekapType === 'kehadiran') {
      const headers = ['No', 'NISN', 'Nama Siswa', 'L/P', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Total', '% Kehadiran']
      const rows = students.map((st, idx) => {
        const stats = getStudentAttStats(st.id)
        return [
          idx + 1,
          st.nisn || '-',
          st.name,
          st.gender || '-',
          stats.h,
          stats.s,
          stats.i,
          stats.a,
          stats.total,
          `${stats.pct}%`
        ]
      })

      exportAttendanceRecapExcel({
        title: 'Rekap Kehadiran',
        className: activeClassName,
        periodText: month,
        dataGrid: { headers, rows },
        schoolInfo: {
          ...schoolInfo,
          teacherName: user?.full_name || schoolInfo?.teacherName
        }
      })
    } else if (rekapType === 'nilai') {
      const headers = ['No', 'NISN', 'Nama Siswa', 'L/P', 'Rata-rata Nilai', 'Predikat']
      const rows = students.map((st, idx) => {
        const studentGrades = gradeRecords.filter(g => g.student_id === st.id)
        const avg = studentGrades.length > 0
          ? (studentGrades.reduce((sum, g) => sum + Number(g.nilai), 0) / studentGrades.length).toFixed(1)
          : '-'
        const kkm = schoolInfo?.kkm || 75
        let pred = '-'
        if (avg !== '-') {
          const numAvg = parseFloat(avg)
          if (numAvg >= 90) pred = 'A'
          else if (numAvg >= kkm) pred = 'B'
          else if (numAvg >= 60) pred = 'C'
          else pred = 'D'
        }
        return [
          idx + 1,
          st.nisn || '-',
          st.name,
          st.gender || '-',
          avg,
          pred
        ]
      })

      exportGradesRecapExcel({
        title: 'Rekap Nilai Siswa',
        className: activeClassName,
        subject: subject,
        semester: semester,
        academicYear: academicYear,
        headers,
        rows,
        schoolInfo: {
          ...schoolInfo,
          teacherName: user?.full_name || schoolInfo?.teacherName
        }
      })
    } else if (rekapType === 'jurnal') {
      exportJournalsRecapExcel({
        className: activeClassName,
        teacherName: user?.full_name || 'Guru',
        journals: journalRecords,
        schoolInfo
      })
    }
  }

  // Handle Print window (Print template format identical to Absensi Super)
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pilihan Jenis Rekap */}
      <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
        <h3 className="text-lg font-bold flex items-center gap-2 mb-1" style={{ color: 'var(--text)' }}>
          <span>📊</span> Rekapitulasi & Laporan (Cetak & Excel)
        </h3>
        <p className="text-xs text-muted mb-4">Unduh rekap kehadiran, leger nilai, dan jurnal kelas dalam format resmi.</p>

        <div className="flex gap-2 border-b border-gray-200 pb-3 mb-3 overflow-x-auto">
          <button
            onClick={() => setRekapType('kehadiran')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              rekapType === 'kehadiran' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            📅 Rekap Kehadiran
          </button>
          <button
            onClick={() => setRekapType('nilai')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              rekapType === 'nilai' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            🏆 Rekap Nilai Siswa
          </button>
          <button
            onClick={() => setRekapType('jurnal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              rekapType === 'jurnal' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            📓 Rekap Jurnal
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {rekapType === 'kehadiran' && (
            <div>
              <label className="text-xs font-semibold text-muted block mb-1">Bulan</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input text-sm font-semibold"
              />
            </div>
          )}

          {rekapType === 'nilai' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted block mb-1">Semester & Tahun</label>
                <div className="flex gap-2">
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="input text-sm font-semibold"
                  >
                    <option value="ganjil">Ganjil</option>
                    <option value="genap">Genap</option>
                  </select>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="input text-sm font-semibold"
                  >
                    <option value="2026/2027">2026/2027</option>
                    <option value="2025/2026">2025/2026</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={handleExportExcel}
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-2.5 px-3 rounded-xl bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer size={16} /> Cetak
            </button>
          </div>
        </div>
      </div>

      {/* Tabel Preview Rekap */}
      <div className="card overflow-x-auto" style={{ padding: '1rem', borderRadius: '18px' }}>
        <div className="text-xs font-bold text-muted mb-3 uppercase">
          PREVIEW REKAP: {rekapType.toUpperCase()} ({activeClassName})
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat tabel rekapitulasi...
          </div>
        ) : rekapType === 'kehadiran' ? (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                <th className="p-2 text-center w-8">No</th>
                <th className="p-2">Nama Siswa</th>
                <th className="p-2 text-center text-green-700 bg-green-50/50">H</th>
                <th className="p-2 text-center text-yellow-700 bg-yellow-50/50">S</th>
                <th className="p-2 text-center text-blue-700 bg-blue-50/50">I</th>
                <th className="p-2 text-center text-red-700 bg-red-50/50">A</th>
                <th className="p-2 text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => {
                const stats = getStudentAttStats(st.id)
                return (
                  <tr key={st.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-center text-gray-400 font-bold">{idx + 1}</td>
                    <td className="p-2 font-medium text-gray-800">{st.name}</td>
                    <td className="p-2 text-center font-bold text-green-600">{stats.h}</td>
                    <td className="p-2 text-center font-bold text-yellow-600">{stats.s}</td>
                    <td className="p-2 text-center font-bold text-blue-600">{stats.i}</td>
                    <td className="p-2 text-center font-bold text-red-600">{stats.a}</td>
                    <td className="p-2 text-center font-bold text-indigo-600">{stats.pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : rekapType === 'nilai' ? (
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                <th className="p-2 text-center w-8">No</th>
                <th className="p-2">Nama Siswa</th>
                <th className="p-2 text-center">Rata-rata</th>
                <th className="p-2 text-center">Predikat</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => {
                const stGrades = gradeRecords.filter(g => g.student_id === st.id)
                const avg = stGrades.length > 0
                  ? (stGrades.reduce((sum, g) => sum + Number(g.nilai), 0) / stGrades.length).toFixed(1)
                  : '-'
                return (
                  <tr key={st.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2 text-center text-gray-400 font-bold">{idx + 1}</td>
                    <td className="p-2 font-medium text-gray-800">{st.name}</td>
                    <td className="p-2 text-center font-bold text-indigo-700">{avg}</td>
                    <td className="p-2 text-center font-bold text-gray-700">
                      {avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg !== '-' ? 'D' : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col gap-2">
            {journalRecords.map((j, idx) => (
              <div key={j.id} className="p-2.5 rounded-xl border border-gray-100 bg-white">
                <div className="flex justify-between items-start">
                  <div className="font-bold text-gray-800 text-xs">{j.topik}</div>
                  <div className="text-[10px] text-gray-400 font-semibold">{j.tanggal}</div>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">{j.mata_pelajaran} • {j.teknik}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
