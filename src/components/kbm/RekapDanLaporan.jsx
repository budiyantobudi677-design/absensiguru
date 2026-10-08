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
      schoolName: schoolInfo?.schoolName || 'SEKOLAH',
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
    <div className="flex flex-col gap-4">
      {/* Control Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-4">
          <div>
            <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider bg-orange-50 px-2.5 py-0.5 rounded-full inline-block mb-1">
              Pusat Pelaporan KBM
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Rekapitulasi, Ekspor Excel & Cetak PDF</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>Ekspor Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={15} />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>

        {/* Tab Selection Segments */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4 max-w-md">
          <button
            onClick={() => setRekapType('kehadiran')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              rekapType === 'kehadiran' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Presensi Siswa
          </button>
          <button
            onClick={() => setRekapType('nilai')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              rekapType === 'nilai' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nilai Siswa
          </button>
          <button
            onClick={() => setRekapType('jurnal')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              rekapType === 'jurnal' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Jurnal KBM
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Pilih Kelas</label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {rekapType === 'kehadiran' && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Pilih Bulan</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
              />
            </div>
          )}

          {rekapType === 'nilai' && (
            <>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Mata Pelajaran</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
                >
                  <option value="Semua">Semua Mapel</option>
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="IPA">IPA</option>
                  <option value="IPS">IPS</option>
                  <option value="Pendidikan Agama">Pendidikan Agama</option>
                  <option value="Pendidikan Pancasila">Pendidikan Pancasila</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Semester</label>
                <div className="flex gap-2">
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 cursor-pointer"
                  >
                    <option value="ganjil">Ganjil</option>
                    <option value="genap">Genap</option>
                  </select>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs sm:text-sm font-semibold text-slate-800 cursor-pointer"
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
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Tahun Ajaran</label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none cursor-pointer"
              >
                <option value="2026/2027">2026/2027</option>
                <option value="2025/2026">2025/2026</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Preview Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Preview Laporan {rekapType.toUpperCase()} ({activeClassName})
          </span>
          <span className="text-[11px] text-slate-400">Total data: {students.length} record</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Menyiapkan laporan rekapitulasi...
          </div>
        ) : rekapType === 'kehadiran' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold uppercase text-[10px]">
                  <th className="p-3 text-center w-12">No</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3 text-center">L/P</th>
                  <th className="p-3 text-center text-emerald-600">H</th>
                  <th className="p-3 text-center text-amber-600">S</th>
                  <th className="p-3 text-center text-blue-600">I</th>
                  <th className="p-3 text-center text-rose-600">A</th>
                  <th className="p-3 text-center">% Kehadiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st, idx) => {
                  const stats = getStudentAttStats(st.id)
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 text-center text-slate-300 font-bold">{idx + 1}</td>
                      <td className="p-3 font-semibold text-slate-800">{st.name}</td>
                      <td className="p-3 text-center text-slate-400">{st.gender || '-'}</td>
                      <td className="p-3 text-center font-bold text-emerald-600 bg-emerald-50/30">{stats.h}</td>
                      <td className="p-3 text-center font-bold text-amber-600">{stats.s}</td>
                      <td className="p-3 text-center font-bold text-blue-600">{stats.i}</td>
                      <td className="p-3 text-center font-bold text-rose-600">{stats.a}</td>
                      <td className="p-3 text-center font-bold text-indigo-600">{stats.pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'nilai' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-bold uppercase text-[10px]">
                  <th className="p-3 text-center w-12">No</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3 text-center">L/P</th>
                  <th className="p-3 text-center">Rata-rata Nilai</th>
                  <th className="p-3 text-center">Predikat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st, idx) => {
                  const stGrades = gradeRecords.filter(g => g.student_id === st.id)
                  const avg = stGrades.length > 0 ? (stGrades.reduce((a, b) => a + Number(b.nilai), 0) / stGrades.length).toFixed(1) : '-'
                  const predikat = avg >= 90 ? 'A' : avg >= 80 ? 'B' : avg >= 70 ? 'C' : avg !== '-' ? 'D' : '-'
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 text-center text-slate-300 font-bold">{idx + 1}</td>
                      <td className="p-3 font-semibold text-slate-800">{st.name}</td>
                      <td className="p-3 text-center text-slate-400">{st.gender || '-'}</td>
                      <td className="p-3 text-center font-bold text-purple-700">{avg}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          predikat === 'A' ? 'bg-emerald-100 text-emerald-800' :
                          predikat === 'B' ? 'bg-blue-100 text-blue-800' :
                          predikat === 'C' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {predikat}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {journalRecords.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">Belum ada jurnal pembelajaran pada kelas ini.</div>
            ) : (
              journalRecords.map(j => (
                <div key={j.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">{j.topik}</span>
                    <span className="text-[11px] text-slate-400">{j.tanggal}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Mapel: <strong className="text-slate-700">{j.mata_pelajaran}</strong> • Metode: {j.teknik || 'Luring'}
                  </div>
                  {j.kegiatan && <p className="text-xs text-slate-600 mt-1">{j.kegiatan}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
