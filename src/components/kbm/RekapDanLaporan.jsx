'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { FileSpreadsheet, Printer, Calendar, BookOpen, Award, CheckCircle, ChevronDown, Check, X, Filter, School } from 'lucide-react'
import { exportAttendanceRecapExcel, exportGradesRecapExcel, exportJournalsRecapExcel } from '../../lib/excelExport'
import { getCustomSubjects } from '../../lib/subjectsManager'

export default function RekapDanLaporan({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [rekapType, setRekapType] = useState('kehadiran') // 'kehadiran' | 'nilai' | 'jurnal'

  // Sub-tipe Kehadiran: 'bulanan' | 'harian' | 'semester'
  const [attendanceViewMode, setAttendanceViewMode] = useState('bulanan')
  const [selectedDayDate, setSelectedDayDate] = useState(new Date().toLocaleDateString('en-CA')) // YYYY-MM-DD
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

  // Sub-tipe Nilai: 'per_mapel' | 'legger_semua'
  const [gradesViewMode, setGradesViewMode] = useState('per_mapel')
  const [availableSubjects, setAvailableSubjects] = useState(getCustomSubjects())
  const [subject, setSubject] = useState(getCustomSubjects()[0] || 'Matematika')
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')

  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [gradeRecords, setGradeRecords] = useState([])
  const [journalRecords, setJournalRecords] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(false)

  const activeClassName = classes?.find(c => c.id === activeClassId)?.name || 'Semua Kelas'

  // Pastikan activeClassId terisi atau default ke kelas pertama
  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  // Sinkronisasi daftar mata pelajaran jika diperbarui di Master KBM
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

  // Panggil data saat filter berganti
  useEffect(() => {
    if (activeClassId) {
      loadReportData()
    }
  }, [activeClassId, rekapType, attendanceViewMode, selectedDayDate, month, gradesViewMode, semester, academicYear, subject])

  const loadReportData = async () => {
    setLoading(true)
    try {
      // 1. Ambil daftar siswa kelas aktif
      const { data: stList } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })
      setStudents(stList || [])

      if (rekapType === 'kehadiran') {
        if (attendanceViewMode === 'harian') {
          // Rekap Harian
          const { data: attList } = await supabase
            .from('student_attendance')
            .select('*')
            .eq('class_id', activeClassId)
            .eq('tanggal', selectedDayDate)
          setAttendanceRecords(attList || [])
        } else if (attendanceViewMode === 'semester') {
          // Rekap 1 Semester Penuh (Ganjil: Jul-Des, Genap: Jan-Jun)
          const baseYear = Number(academicYear.split('/')[0]) || new Date().getFullYear()
          const startMonth = semester === 'ganjil' ? `${baseYear}-07-01` : `${baseYear + 1}-01-01`
          const endMonth = semester === 'ganjil' ? `${baseYear}-12-31` : `${baseYear + 1}-06-30`

          const { data: attList } = await supabase
            .from('student_attendance')
            .select('*')
            .eq('class_id', activeClassId)
            .gte('tanggal', startMonth)
            .lte('tanggal', endMonth)
          setAttendanceRecords(attList || [])
        } else {
          // Rekap Bulanan
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

          const { data: hList } = await supabase
            .from('school_holidays')
            .select('*')
            .gte('tanggal', firstDay)
            .lte('tanggal', lastDay)
          setHolidays(hList || [])
        }

      } else if (rekapType === 'nilai') {
        let q = supabase
          .from('student_grades')
          .select('*')
          .eq('class_id', activeClassId)
          .eq('semester', semester)
          .eq('tahun_ajaran', academicYear)

        if (gradesViewMode === 'per_mapel' && subject && subject !== 'Semua') {
          q = q.eq('mata_pelajaran', subject)
        }
        const { data: grList } = await q
        setGradeRecords(grList || [])

      } else if (rekapType === 'jurnal') {
        let q = supabase
          .from('learning_journals')
          .select('*')
          .eq('class_id', activeClassId)
          .order('tanggal', { ascending: false })

        if (subject && subject !== 'Semua') {
          q = q.eq('mata_pelajaran', subject)
        }
        const { data: jrList } = await q
        setJournalRecords(jrList || [])
      }
    } catch (err) {
      console.error('Error loading report:', err)
    } finally {
      setLoading(false)
    }
  }

  // ===================== LOGIKA BULANAN PRESENSI =====================
  const daysInMonthInfo = useMemo(() => {
    const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-').map(Number)
    const daysCount = new Date(y, m, 0).getDate()
    const daysArr = []
    const holidayDateSet = new Set((holidays || []).map(h => h.tanggal))

    for (let day = 1; day <= daysCount; day++) {
      const dateObj = new Date(y, m - 1, day)
      const dayOfWeek = dateObj.getDay()
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const isSunday = dayOfWeek === 0
      const isHoliday = isSunday || holidayDateSet.has(dateStr)

      daysArr.push({
        dayNumber: day,
        dateStr,
        dayOfWeek,
        isSunday,
        isHoliday
      })
    }
    return daysArr
  }, [month, holidays])

  // Mapping kehadiran { `${student_id}_${dateStr}`: 'hadir' | 'sakit' | 'izin' | 'alpha' }
  const attendanceLookup = useMemo(() => {
    const map = {}
    attendanceRecords.forEach(att => {
      map[`${att.student_id}_${att.tanggal}`] = att.status
    })
    return map
  }, [attendanceRecords])

  const getStudentMonthlyStats = (studentId) => {
    let h = 0, s = 0, i = 0, a = 0
    daysInMonthInfo.forEach(d => {
      const status = attendanceLookup[`${studentId}_${d.dateStr}`]
      if (status === 'hadir') h++
      else if (status === 'sakit') s++
      else if (status === 'izin') i++
      else if (status === 'alpha') a++
    })
    return { h, s, i, a }
  }

  // Akumulasi semester per siswa
  const getStudentSemesterStats = (studentId) => {
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

  // ===================== LOGIKA NILAI PER MAPEL =====================
  const tpNumbers = useMemo(() => {
    const tpSet = new Set([1, 2, 3, 4, 5, 6])
    gradeRecords.forEach(g => {
      if (g.tipe_penilaian === 'tp' && g.nomor_penilaian) {
        tpSet.add(Number(g.nomor_penilaian))
      }
    })
    return Array.from(tpSet).sort((a, b) => a - b)
  }, [gradeRecords])

  const lmNumbers = useMemo(() => {
    const lmSet = new Set()
    gradeRecords.forEach(g => {
      if (g.tipe_penilaian === 'lm' && g.nomor_penilaian) {
        lmSet.add(Number(g.nomor_penilaian))
      }
    })
    if (lmSet.size === 0) return [1, 2, 3, 4]
    return Array.from(lmSet).sort((a, b) => a - b)
  }, [gradeRecords])

  const studentGradesCalculated = useMemo(() => {
    return students.map(student => {
      const stGrades = gradeRecords.filter(g => g.student_id === student.id && (gradesViewMode === 'legger_semua' || g.mata_pelajaran === subject))

      const tpValues = {}
      const tpNumArray = []
      tpNumbers.forEach(n => {
        const row = stGrades.find(g => g.tipe_penilaian === 'tp' && Number(g.nomor_penilaian) === n)
        if (row && row.nilai !== null && row.nilai !== undefined) {
          tpValues[n] = Number(row.nilai)
          tpNumArray.push(Number(row.nilai))
        } else {
          tpValues[n] = '-'
        }
      })

      const rtp = tpNumArray.length > 0
        ? (tpNumArray.reduce((acc, val) => acc + val, 0) / tpNumArray.length)
        : null

      const lmValues = {}
      const lmNumArray = []
      lmNumbers.forEach(n => {
        const row = stGrades.find(g => g.tipe_penilaian === 'lm' && Number(g.nomor_penilaian) === n)
        if (row && row.nilai !== null && row.nilai !== undefined) {
          lmValues[n] = Number(row.nilai)
          lmNumArray.push(Number(row.nilai))
        } else {
          lmValues[n] = '-'
        }
      })

      const astsRow = stGrades.find(g => g.tipe_penilaian === 'asts')
      const astsValue = astsRow && astsRow.nilai !== null ? Number(astsRow.nilai) : '-'

      const stsRow = stGrades.find(g => g.tipe_penilaian === 'sts' || g.tipe_penilaian === 'sas')
      const stsValue = stsRow && stsRow.nilai !== null ? Number(stsRow.nilai) : '-'

      const allValidScores = []
      if (rtp !== null) allValidScores.push(rtp)
      if (lmNumArray.length > 0) allValidScores.push(...lmNumArray)
      if (astsValue !== '-') allValidScores.push(astsValue)
      if (stsValue !== '-') allValidScores.push(stsValue)

      const finalAverage = allValidScores.length > 0
        ? (allValidScores.reduce((acc, val) => acc + val, 0) / allValidScores.length).toFixed(1)
        : '-'

      let predikat = '-'
      if (finalAverage !== '-') {
        const num = Number(finalAverage)
        if (num >= 85) predikat = 'A'
        else if (num >= 75) predikat = 'B'
        else if (num >= 65) predikat = 'C'
        else predikat = 'D'
      }

      return {
        ...student,
        tpValues,
        rtp: rtp !== null ? rtp.toFixed(1) : '-',
        lmValues,
        astsValue,
        stsValue,
        finalAverage,
        predikat
      }
    })
  }, [students, gradeRecords, tpNumbers, lmNumbers, gradesViewMode, subject])

  // ===================== LOGIKA LEGGER NILAI LENGKAP =====================
  const activeLeggerSubjects = useMemo(() => {
    return availableSubjects
  }, [availableSubjects])

  const leggerDataCalculated = useMemo(() => {
    const rawList = students.map(student => {
      const subjectAverages = {}
      let totalScore = 0
      let countWithScore = 0

      activeLeggerSubjects.forEach(sub => {
        const subGrades = gradeRecords.filter(g => g.student_id === student.id && g.mata_pelajaran === sub && g.nilai !== null)
        if (subGrades.length > 0) {
          const avg = subGrades.reduce((sum, g) => sum + Number(g.nilai), 0) / subGrades.length
          subjectAverages[sub] = avg.toFixed(1)
          totalScore += avg
          countWithScore++
        } else {
          subjectAverages[sub] = '-'
        }
      })

      const overallAverage = countWithScore > 0 ? (totalScore / countWithScore).toFixed(1) : '-'
      const overallAvgNum = countWithScore > 0 ? (totalScore / countWithScore) : -1

      return {
        ...student,
        subjectAverages,
        overallAverage,
        overallAvgNum
      }
    })

    const sorted = [...rawList].sort((a, b) => b.overallAvgNum - a.overallAvgNum)
    const rankMap = {}
    sorted.forEach((item, index) => {
      rankMap[item.id] = item.overallAvgNum > 0 ? index + 1 : '-'
    })

    return rawList.map(item => ({
      ...item,
      rank: rankMap[item.id]
    }))
  }, [students, gradeRecords, activeLeggerSubjects])

  // ===================== EKSPOR EXCEL DENGAN CENTANG ✓ IDENTIK =====================
  const handleExportExcel = () => {
    const schoolInfoObj = {
      schoolName: schoolInfo?.schoolName || 'Presensia SD/SMP',
      principalName: schoolInfo?.principalName || '',
      principalNIP: schoolInfo?.principalNIP || '',
      teacherName: user?.full_name || user?.email || 'Guru',
      teacherNIP: user?.nip || '',
      appMode: schoolInfo?.appMode || 'SD'
    }

    if (rekapType === 'kehadiran') {
      if (attendanceViewMode === 'harian') {
        const headers = ['No', 'NISN', 'Nama Siswa', 'Tanggal', 'Status Kehadiran']
        const rows = students.map((st, idx) => {
          const stt = attendanceLookup[`${st.id}_${selectedDayDate}`] || '-'
          return [idx + 1, st.nisn || '-', st.name, selectedDayDate, stt.toUpperCase()]
        })
        exportAttendanceRecapExcel({
          title: 'REKAP PRESENSI HARIAN',
          className: activeClassName,
          periodText: `Tanggal ${selectedDayDate}`,
          schoolInfo: schoolInfoObj,
          dataGrid: { headers, rows }
        })
      } else if (attendanceViewMode === 'semester') {
        const headers = ['No', 'NISN', 'Nama Siswa', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Total', '% Hadir']
        const rows = students.map((st, idx) => {
          const stats = getStudentSemesterStats(st.id)
          return [idx + 1, st.nisn || '-', st.name, stats.h, stats.s, stats.i, stats.a, stats.total, `${stats.pct}%`]
        })
        exportAttendanceRecapExcel({
          title: 'REKAPITULASI PRESENSI SEMESTER',
          className: activeClassName,
          periodText: `Semester ${semester.toUpperCase()} ${academicYear}`,
          schoolInfo: schoolInfoObj,
          dataGrid: { headers, rows }
        })
      } else {
        // Bulanan: gunakan tanda centang "✓" persis tinjauan
        const headers = ['No', 'NISN', 'Nama Siswa', ...daysInMonthInfo.map(d => String(d.dayNumber)), 'H', 'S', 'I', 'A']
        const rows = students.map((st, idx) => {
          const stats = getStudentMonthlyStats(st.id)
          const dailyStatuses = daysInMonthInfo.map(d => {
            if (d.isSunday) return 'L'
            const stt = attendanceLookup[`${st.id}_${d.dateStr}`]
            if (stt === 'hadir') return '✓'
            if (stt === 'sakit') return 'S'
            if (stt === 'izin') return 'I'
            if (stt === 'alpha') return 'A'
            return '-'
          })
          return [idx + 1, st.nisn || '-', st.name, ...dailyStatuses, stats.h, stats.s, stats.i, stats.a]
        })

        exportAttendanceRecapExcel({
          title: 'REKAPITULASI PRESENSI BULANAN',
          className: activeClassName,
          periodText: month,
          schoolInfo: schoolInfoObj,
          dataGrid: { headers, rows }
        })
      }

    } else if (rekapType === 'nilai') {
      if (gradesViewMode === 'legger_semua') {
        const headers = ['No', 'NISN', 'Nama Siswa', ...activeLeggerSubjects, 'Rata-rata', 'Rank']
        const rows = leggerDataCalculated.map((st, idx) => [
          idx + 1,
          st.nisn || '-',
          st.name,
          ...activeLeggerSubjects.map(sub => st.subjectAverages[sub]),
          st.overallAverage,
          st.rank
        ])
        exportGradesRecapExcel({
          title: 'LEGGER NILAI KELAS (SEMUA MATA PELAJARAN)',
          className: activeClassName,
          subjectName: 'Semua Mata Pelajaran',
          periodText: `Semester ${semester.toUpperCase()} ${academicYear}`,
          schoolInfo: schoolInfoObj,
          dataGrid: { headers, rows }
        })
      } else {
        const headers = [
          'No',
          'NISN',
          'Nama Siswa',
          ...tpNumbers.map(n => `TP ${n}`),
          'RTP',
          ...lmNumbers.map(n => `LM ${n}`),
          'ASTS',
          'STS',
          'R.Akhir',
          'Prdk'
        ]
        const rows = studentGradesCalculated.map((st, idx) => [
          idx + 1,
          st.nisn || '-',
          st.name,
          ...tpNumbers.map(n => st.tpValues[n]),
          st.rtp,
          ...lmNumbers.map(n => st.lmValues[n]),
          st.astsValue,
          st.stsValue,
          st.finalAverage,
          st.predikat
        ])

        exportGradesRecapExcel({
          title: 'REKAPITULASI NILAI MAPEL',
          className: activeClassName,
          subjectName: subject,
          periodText: `Semester ${semester.toUpperCase()} ${academicYear}`,
          schoolInfo: schoolInfoObj,
          dataGrid: { headers, rows }
        })
      }

    } else if (rekapType === 'jurnal') {
      exportJournalsRecapExcel({
        className: activeClassName,
        teacherName: user?.full_name || 'Guru',
        journals: journalRecords,
        schoolInfo: schoolInfoObj
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* ===================== KOP LAPORAN UNTUK CETAK PDF ===================== */}
      <div className="print-header-area" style={{ display: 'none', textAlign: 'center', borderBottom: '2px double #000', paddingBottom: '8px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '14pt', margin: 0, textTransform: 'uppercase', fontWeight: 'bold' }}>
          {schoolInfo?.schoolName || 'PANRITA EDU APPLICATION'}
        </h2>
        <h3 style={{ fontSize: '11pt', margin: '3px 0', textTransform: 'uppercase' }}>
          {rekapType === 'kehadiran' && attendanceViewMode === 'bulanan' && `REKAPITULASI PRESENSI BULANAN SISWA - KELAS ${activeClassName?.toUpperCase()}`}
          {rekapType === 'kehadiran' && attendanceViewMode === 'semester' && `REKAPITULASI PRESENSI SEMESTER SISWA - KELAS ${activeClassName?.toUpperCase()}`}
          {rekapType === 'kehadiran' && attendanceViewMode === 'harian' && `PRESENSI HARIAN SISWA - KELAS ${activeClassName?.toUpperCase()}`}
          {rekapType === 'nilai' && gradesViewMode === 'legger_semua' && `LEGGER NILAI KELAS (SEMUA MATA PELAJARAN) - KELAS ${activeClassName?.toUpperCase()}`}
          {rekapType === 'nilai' && gradesViewMode === 'per_mapel' && `REKAPITULASI NILAI ${subject?.toUpperCase()} - KELAS ${activeClassName?.toUpperCase()}`}
          {rekapType === 'jurnal' && `REKAPITULASI JURNAL PEMBELAJARAN GURU - KELAS ${activeClassName?.toUpperCase()}`}
        </h3>
        <p style={{ fontSize: '9pt', margin: 0 }}>
          {rekapType === 'kehadiran' && attendanceViewMode === 'bulanan' && `Periode: Bulan ${month}`}
          {rekapType === 'kehadiran' && attendanceViewMode === 'semester' && `Periode: Semester ${semester?.toUpperCase()} ${academicYear}`}
          {rekapType === 'kehadiran' && attendanceViewMode === 'harian' && `Tanggal: ${selectedDayDate}`}
          {rekapType === 'nilai' && `Semester: ${semester?.toUpperCase()} ${academicYear}`}
          {rekapType === 'jurnal' && `Tahun Ajaran: ${academicYear}`}
        </p>
      </div>

      {/* Control Card Filter (Non-Cetak) */}
      <div className="card no-print" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#EA580C', background: '#FFEDD5', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pusat Rekapitulasi & Unduh Berkas
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
                gap: '6px',
                cursor: 'pointer'
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
                gap: '6px',
                cursor: 'pointer'
              }}
            >
              <Printer size={15} />
              <span>Cetak / PDF</span>
            </button>
          </div>
        </div>

        {/* Segmented Switcher Modul Rekap Utama */}
        <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '14px', marginBottom: '1rem' }}>
          <button
            onClick={() => setRekapType('kehadiran')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: rekapType === 'kehadiran' ? 'white' : 'transparent',
              color: rekapType === 'kehadiran' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'kehadiran' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            📋 Rekap Kehadiran
          </button>
          <button
            onClick={() => setRekapType('nilai')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: rekapType === 'nilai' ? 'white' : 'transparent',
              color: rekapType === 'nilai' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'nilai' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            📊 Rekap Nilai & Legger
          </button>
          <button
            onClick={() => setRekapType('jurnal')}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              background: rekapType === 'jurnal' ? 'white' : 'transparent',
              color: rekapType === 'jurnal' ? '#4F46E5' : '#64748B',
              boxShadow: rekapType === 'jurnal' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s'
            }}
          >
            📓 Rekap Jurnal Mengajar
          </button>
        </div>

        {/* Sub-Switcher untuk Kehadiran (Harian, Bulanan, Semester) */}
        {rekapType === 'kehadiran' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 'bold', color: 'var(--text-muted)', marginRight: '4px' }}>
              Mode Tinjauan:
            </span>
            <button
              type="button"
              onClick={() => setAttendanceViewMode('harian')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: attendanceViewMode === 'harian' ? '#4F46E5' : '#FFFFFF',
                color: attendanceViewMode === 'harian' ? 'white' : '#475569',
                boxShadow: attendanceViewMode === 'harian' ? '0 2px 5px rgba(79, 70, 229, 0.25)' : 'none'
              }}
            >
              🗓️ Rekap Harian
            </button>
            <button
              type="button"
              onClick={() => setAttendanceViewMode('bulanan')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: attendanceViewMode === 'bulanan' ? '#4F46E5' : '#FFFFFF',
                color: attendanceViewMode === 'bulanan' ? 'white' : '#475569',
                boxShadow: attendanceViewMode === 'bulanan' ? '0 2px 5px rgba(79, 70, 229, 0.25)' : 'none'
              }}
            >
              📅 Rekap Bulanan
            </button>
            <button
              type="button"
              onClick={() => setAttendanceViewMode('semester')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: attendanceViewMode === 'semester' ? '#4F46E5' : '#FFFFFF',
                color: attendanceViewMode === 'semester' ? 'white' : '#475569',
                boxShadow: attendanceViewMode === 'semester' ? '0 2px 5px rgba(79, 70, 229, 0.25)' : 'none'
              }}
            >
              🎓 Rekap Semester
            </button>
          </div>
        )}

        {/* Sub-Switcher untuk Nilai (Per Mata Pelajaran vs Legger Semua Mapel) */}
        {rekapType === 'nilai' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 0.75rem', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 'bold', color: 'var(--text-muted)', marginRight: '4px' }}>
              Format Nilai:
            </span>
            <button
              type="button"
              onClick={() => setGradesViewMode('per_mapel')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: gradesViewMode === 'per_mapel' ? '#9333EA' : '#FFFFFF',
                color: gradesViewMode === 'per_mapel' ? 'white' : '#475569',
                boxShadow: gradesViewMode === 'per_mapel' ? '0 2px 5px rgba(147, 51, 234, 0.25)' : 'none'
              }}
            >
              📖 Per Mata Pelajaran (TP, LM, ASTS, STS)
            </button>
            <button
              type="button"
              onClick={() => setGradesViewMode('legger_semua')}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.76rem',
                fontWeight: '700',
                cursor: 'pointer',
                background: gradesViewMode === 'legger_semua' ? '#9333EA' : '#FFFFFF',
                color: gradesViewMode === 'legger_semua' ? 'white' : '#475569',
                boxShadow: gradesViewMode === 'legger_semua' ? '0 2px 5px rgba(147, 51, 234, 0.25)' : 'none'
              }}
            >
              🏆 Legger Nilai (Semua Mapel + Ranking)
            </button>
          </div>
        )}

        {/* Filter Controls Row: Pilihan Kelas dari Semua Akun */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Pilih Rombel / Kelas
            </label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="input"
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {rekapType === 'kehadiran' && attendanceViewMode === 'bulanan' && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Periode Bulan
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
              />
            </div>
          )}

          {rekapType === 'kehadiran' && attendanceViewMode === 'harian' && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Tanggal Presensi
              </label>
              <input
                type="date"
                value={selectedDayDate}
                onChange={(e) => setSelectedDayDate(e.target.value)}
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
              />
            </div>
          )}

          {(rekapType === 'nilai' || (rekapType === 'kehadiran' && attendanceViewMode === 'semester')) && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Semester & Tahun Ajaran
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  className="input"
                  style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                >
                  <option value="ganjil">Ganjil</option>
                  <option value="genap">Genap</option>
                </select>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="input"
                  style={{ flex: 1, padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                >
                  <option value="2026/2027">2026/2027</option>
                  <option value="2025/2026">2025/2026</option>
                </select>
              </div>
            </div>
          )}

          {rekapType === 'nilai' && gradesViewMode === 'per_mapel' && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Mata Pelajaran
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input"
                style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
              >
                {availableSubjects.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}

          {rekapType === 'jurnal' && (
            <>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Mata Pelajaran
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                >
                  <option value="Semua">-- Semua Mata Pelajaran --</option>
                  {availableSubjects.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Tahun Ajaran
                </label>
                <select
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="input"
                  style={{ padding: '0.65rem 0.85rem', fontSize: '0.85rem', borderRadius: '12px' }}
                >
                  <option value="2026/2027">2026/2027</option>
                  <option value="2025/2026">2025/2026</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Table Preview Container */}
      <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div className="no-print" style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {rekapType === 'kehadiran' && attendanceViewMode === 'bulanan' && `Daftar Hadir Bulanan - Kelas ${activeClassName} (${month})`}
              {rekapType === 'kehadiran' && attendanceViewMode === 'semester' && `Daftar Hadir Semester - Kelas ${activeClassName} (${semester.toUpperCase()} ${academicYear})`}
              {rekapType === 'kehadiran' && attendanceViewMode === 'harian' && `Presensi Harian - Kelas ${activeClassName} (${selectedDayDate})`}
              {rekapType === 'nilai' && gradesViewMode === 'per_mapel' && `Rekap Nilai ${subject} - Kelas ${activeClassName} (${semester.toUpperCase()} ${academicYear})`}
              {rekapType === 'nilai' && gradesViewMode === 'legger_semua' && `Legger Nilai Lengkap (Semua Mapel) - Kelas ${activeClassName} (${semester.toUpperCase()} ${academicYear})`}
              {rekapType === 'jurnal' && `Rekap Jurnal Pembelajaran - Kelas ${activeClassName}`}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>
            {rekapType === 'jurnal' ? `${journalRecords.length} Jurnal` : `${students.length} Siswa`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Menyiapkan dan mengolah data laporan...
          </div>
        ) : rekapType === 'kehadiran' && attendanceViewMode === 'harian' ? (
          /* ========================================================================= */
          /* 1A. REKAP HADIR HARIAN                                                    */
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 12px', width: '120px', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '10px 14px' }}>Nama Siswa</th>
                  <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center' }}>L/P</th>
                  <th style={{ padding: '10px 14px', width: '140px', textAlign: 'center' }}>Status Kehadiran</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada data siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stt = attendanceLookup[`${st.id}_${selectedDayDate}`] || 'belum'
                    return (
                      <tr
                        key={st.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.45)'
                        }}
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {st.nisn || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--text)' }}>
                          {st.name}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {st.gender === 'P' ? 'Perempuan' : 'Laki-laki'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            background:
                              stt === 'hadir' ? '#D1FAE5' :
                              stt === 'sakit' ? '#FEF3C7' :
                              stt === 'izin' ? '#DBEAFE' :
                              stt === 'alpha' ? '#FEE2E2' : '#F1F5F9',
                            color:
                              stt === 'hadir' ? '#065F46' :
                              stt === 'sakit' ? '#B45309' :
                              stt === 'izin' ? '#1D4ED8' :
                              stt === 'alpha' ? '#B91C1C' : '#64748B'
                          }}>
                            {stt === 'belum' ? 'Belum Diisi' : stt}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'kehadiran' && attendanceViewMode === 'semester' ? (
          /* ========================================================================= */
          /* 1C. REKAP HADIR SEMESTER                                                  */
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 12px', width: '120px', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '10px 14px' }}>Nama Siswa</th>
                  <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center', color: '#059669', background: '#F0FDF4' }}>Hadir</th>
                  <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center', color: '#D97706', background: '#FFFBEB' }}>Sakit</th>
                  <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center', color: '#2563EB', background: '#EFF6FF' }}>Izin</th>
                  <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center', color: '#DC2626', background: '#FEF2F2' }}>Alpha</th>
                  <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center', fontWeight: 'bold' }}>Total</th>
                  <th style={{ padding: '10px 12px', width: '90px', textAlign: 'center', fontWeight: 'bold', color: '#4F46E5' }}>% Hadir</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stats = getStudentSemesterStats(st.id)
                    return (
                      <tr
                        key={st.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.45)'
                        }}
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {st.nisn || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: 'var(--text)' }}>
                          {st.name}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#059669', background: '#F0FDF4' }}>
                          {stats.h}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#D97706', background: '#FFFBEB' }}>
                          {stats.s}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#2563EB', background: '#EFF6FF' }}>
                          {stats.i}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#DC2626', background: '#FEF2F2' }}>
                          {stats.a}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                          {stats.total}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#4F46E5' }}>
                          {stats.pct}%
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'kehadiran' ? (
          /* ========================================================================= */
          /* 1B. REKAP HADIR BULANAN (Matriks 1..31, H, S, I, A, NISN)                  */
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', textAlign: 'center', minWidth: '850px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '10px 8px', width: '36px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 8px', width: '90px', textAlign: 'center', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '180px' }}>Nama Siswa</th>
                  {daysInMonthInfo.map(d => (
                    <th
                      key={d.dayNumber}
                      style={{
                        padding: '8px 4px',
                        width: '26px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        color: d.isHoliday ? '#EF4444' : 'var(--text)',
                        background: d.isHoliday ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                        borderLeft: '1px solid #F1F5F9'
                      }}
                      title={d.dateStr}
                    >
                      {d.dayNumber}
                    </th>
                  ))}
                  <th style={{ padding: '10px 6px', width: '32px', color: '#059669', background: '#F0FDF4', borderLeft: '1px solid #E2E8F0' }}>H</th>
                  <th style={{ padding: '10px 6px', width: '32px', color: '#D97706', background: '#FFFBEB' }}>S</th>
                  <th style={{ padding: '10px 6px', width: '32px', color: '#2563EB', background: '#EFF6FF' }}>I</th>
                  <th style={{ padding: '10px 6px', width: '32px', color: '#DC2626', background: '#FEF2F2' }}>A</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={daysInMonthInfo.length + 7} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  students.map((st, idx) => {
                    const stats = getStudentMonthlyStats(st.id)
                    return (
                      <tr
                        key={st.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                        }}
                      >
                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {st.nisn || '-'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {st.name}
                        </td>

                        {daysInMonthInfo.map(d => {
                          const status = attendanceLookup[`${st.id}_${d.dateStr}`]
                          const isHadir = status === 'hadir'
                          const isSakit = status === 'sakit'
                          const isIzin = status === 'izin'
                          const isAlpha = status === 'alpha'

                          return (
                            <td
                              key={d.dayNumber}
                              style={{
                                padding: '6px 2px',
                                textAlign: 'center',
                                borderLeft: '1px solid #F8FAFC',
                                background: d.isHoliday ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                                fontSize: '0.74rem'
                              }}
                            >
                              {isHadir && <span style={{ color: '#10B981', fontWeight: '800' }}>✓</span>}
                              {isSakit && (
                                <span style={{
                                  display: 'inline-block',
                                  width: '18px',
                                  height: '18px',
                                  lineHeight: '18px',
                                  borderRadius: '4px',
                                  background: '#FEF3C7',
                                  color: '#B45309',
                                  fontWeight: '800',
                                  fontSize: '0.7rem'
                                }}>S</span>
                              )}
                              {isIzin && (
                                <span style={{
                                  display: 'inline-block',
                                  width: '18px',
                                  height: '18px',
                                  lineHeight: '18px',
                                  borderRadius: '4px',
                                  background: '#DBEAFE',
                                  color: '#1D4ED8',
                                  fontWeight: '800',
                                  fontSize: '0.7rem'
                                }}>I</span>
                              )}
                              {isAlpha && (
                                <span style={{
                                  display: 'inline-block',
                                  width: '18px',
                                  height: '18px',
                                  lineHeight: '18px',
                                  borderRadius: '4px',
                                  background: '#FEE2E2',
                                  color: '#B91C1C',
                                  fontWeight: '800',
                                  fontSize: '0.7rem'
                                }}>A</span>
                              )}
                              {!status && (
                                <span style={{ color: d.isHoliday ? '#FCA5A5' : '#CBD5E1', fontSize: '0.7rem' }}>-</span>
                              )}
                            </td>
                          )
                        })}

                        <td style={{ padding: '8px 4px', fontWeight: '800', color: '#059669', background: '#F0FDF4', borderLeft: '1px solid #E2E8F0' }}>
                          {stats.h}
                        </td>
                        <td style={{ padding: '8px 4px', fontWeight: '800', color: '#D97706', background: '#FFFBEB' }}>
                          {stats.s}
                        </td>
                        <td style={{ padding: '8px 4px', fontWeight: '800', color: '#2563EB', background: '#EFF6FF' }}>
                          {stats.i}
                        </td>
                        <td style={{ padding: '8px 4px', fontWeight: '800', color: '#DC2626', background: '#FEF2F2' }}>
                          {stats.a}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'nilai' && gradesViewMode === 'legger_semua' ? (
          /* ========================================================================= */
          /* 2B. LEGGER NILAI LENGKAP (SEMUA MAPEL + RATA-RATA + RANK KELAS)             */
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'center', minWidth: '850px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '11px 8px', width: '38px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '11px 8px', width: '95px', textAlign: 'center', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', minWidth: '190px' }}>Nama Siswa</th>

                  {activeLeggerSubjects.map(sub => (
                    <th key={sub} style={{ padding: '11px 8px', minWidth: '95px', color: 'var(--text)', fontWeight: '800' }}>
                      {sub}
                    </th>
                  ))}

                  <th style={{ padding: '11px 10px', width: '85px', color: '#B45309', background: '#FEF3C7', fontWeight: '900' }}>
                    Rata-rata
                  </th>

                  <th style={{ padding: '11px 10px', width: '65px', color: '#047857', background: '#ECFDF5', fontWeight: '900' }}>
                    Rank
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={activeLeggerSubjects.length + 5} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  leggerDataCalculated.map((st, idx) => (
                    <tr
                      key={st.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                      }}
                    >
                      <td style={{ padding: '9px 4px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {st.nisn || '-'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {st.name}
                      </td>

                      {activeLeggerSubjects.map(sub => {
                        const val = st.subjectAverages[sub]
                        return (
                          <td key={sub} style={{ padding: '9px 6px', color: val === '-' ? '#CBD5E1' : '#334155', fontWeight: '600' }}>
                            {val}
                          </td>
                        )
                      })}

                      <td style={{ padding: '9px 6px', fontWeight: '900', color: '#92400E', background: '#FEF3C7' }}>
                        {st.overallAverage}
                      </td>

                      <td style={{ padding: '9px 6px', fontWeight: '900', color: '#047857', background: '#ECFDF5', fontSize: '0.88rem' }}>
                        {st.rank}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : rekapType === 'nilai' ? (
          /* ========================================================================= */
          /* 2A. REKAP NILAI PER MAPEL (TP 1..N, RTP, LM 1..N, ASTS, STS, R.Akhir, Prdk)*/
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'center', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '11px 8px', width: '38px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '11px 8px', width: '95px', textAlign: 'center', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', minWidth: '190px' }}>Nama Siswa</th>

                  {tpNumbers.map(n => (
                    <th key={`tp_${n}`} style={{ padding: '11px 8px', width: '52px', color: '#1E293B', fontWeight: '800' }}>
                      TP {n}
                    </th>
                  ))}

                  <th style={{ padding: '11px 8px', width: '56px', color: '#2563EB', background: '#EFF6FF', fontWeight: '800' }}>
                    RTP
                  </th>

                  {lmNumbers.map(n => (
                    <th key={`lm_${n}`} style={{ padding: '11px 8px', width: '52px', color: '#7C3AED', fontWeight: '800' }}>
                      LM {n}
                    </th>
                  ))}

                  <th style={{ padding: '11px 8px', width: '54px', color: '#D97706', fontWeight: '800' }}>
                    ASTS
                  </th>

                  <th style={{ padding: '11px 8px', width: '54px', color: '#EA580C', fontWeight: '800' }}>
                    STS
                  </th>

                  <th style={{ padding: '11px 8px', width: '62px', color: '#B45309', background: '#FEF3C7', fontWeight: '900' }}>
                    R.Akhir
                  </th>

                  <th style={{ padding: '11px 8px', width: '48px', color: '#DC2626', background: '#FFFBEB', fontWeight: '900' }}>
                    Prdk
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={tpNumbers.length + lmNumbers.length + 8} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada siswa di kelas ini.
                    </td>
                  </tr>
                ) : (
                  studentGradesCalculated.map((st, idx) => {
                    const prdk = st.predikat
                    const prdkColor =
                      prdk === 'A' ? '#059669' :
                      prdk === 'B' ? '#2563EB' :
                      prdk === 'C' ? '#D97706' :
                      prdk === 'D' ? '#DC2626' : '#94A3B8'

                    return (
                      <tr
                        key={st.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                        }}
                      >
                        <td style={{ padding: '9px 4px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                          {st.nisn || '-'}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                          {st.name}
                        </td>

                        {tpNumbers.map(n => (
                          <td key={`val_tp_${n}`} style={{ padding: '9px 4px', color: st.tpValues[n] === '-' ? '#CBD5E1' : '#334155', fontWeight: '600' }}>
                            {st.tpValues[n]}
                          </td>
                        ))}

                        <td style={{ padding: '9px 4px', fontWeight: '800', color: '#1D4ED8', background: '#EFF6FF' }}>
                          {st.rtp}
                        </td>

                        {lmNumbers.map(n => (
                          <td key={`val_lm_${n}`} style={{ padding: '9px 4px', color: st.lmValues[n] === '-' ? '#CBD5E1' : '#5B21B6', fontWeight: '600' }}>
                            {st.lmValues[n]}
                          </td>
                        ))}

                        <td style={{ padding: '9px 4px', color: st.astsValue === '-' ? '#CBD5E1' : '#B45309', fontWeight: '600' }}>
                          {st.astsValue}
                        </td>

                        <td style={{ padding: '9px 4px', color: st.stsValue === '-' ? '#CBD5E1' : '#C2410C', fontWeight: '600' }}>
                          {st.stsValue}
                        </td>

                        <td style={{ padding: '9px 4px', fontWeight: '900', color: '#92400E', background: '#FEF3C7' }}>
                          {st.finalAverage}
                        </td>

                        <td style={{ padding: '9px 4px', fontWeight: '900', color: prdkColor, background: '#FFFBEB' }}>
                          {prdk}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* ========================================================================= */
          /* 3. REKAP JURNAL PEMBELAJARAN                                              */
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '11px 10px', width: '40px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '11px 12px', width: '105px' }}>Tanggal</th>
                  <th style={{ padding: '11px 12px', width: '140px' }}>Mata Pelajaran</th>
                  <th style={{ padding: '11px 12px', minWidth: '160px' }}>Topik / Materi</th>
                  <th style={{ padding: '11px 10px', width: '85px', textAlign: 'center' }}>Metode</th>
                  <th style={{ padding: '11px 14px' }}>Ringkasan Kegiatan & Penilaian</th>
                </tr>
              </thead>
              <tbody>
                {journalRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Belum ada catatan jurnal pembelajaran untuk kelas ini.
                    </td>
                  </tr>
                ) : (
                  journalRecords.map((j, idx) => (
                    <tr
                      key={j.id}
                      style={{
                        borderBottom: '1px solid #F1F5F9',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                      }}
                    >
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text)' }}>
                        {j.tanggal}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '700', color: '#4F46E5' }}>
                        {j.mata_pelajaran}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text)' }}>
                        {j.topik}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: j.teknik === 'Daring' ? '#EFF6FF' : j.teknik === 'Hybrid' ? '#FAF5FF' : '#F1F5F9',
                          color: j.teknik === 'Daring' ? '#2563EB' : j.teknik === 'Hybrid' ? '#7C3AED' : '#475569'
                        }}>
                          {j.teknik || 'Luring'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569', fontSize: '0.78rem' }}>
                        {j.kegiatan && <div>{j.kegiatan}</div>}
                        {j.penilaian && <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '2px' }}>Penilaian: {j.penilaian}</div>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================== AREA TANDA TANGAN (HANYA MUNCUL DI PRINT/PDF) ===================== */}
      <div className="print-signature-area" style={{ display: 'none' }}>
        <div style={{ textAlign: 'center', width: '220px' }}>
          <div>Mengetahui,</div>
          <div style={{ fontWeight: 'bold' }}>Kepala Sekolah</div>
          <div style={{ height: '55px' }}></div>
          <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{schoolInfo?.principalName || '...........................................'}</div>
          <div>NIP. {schoolInfo?.principalNIP || '...........................................'}</div>
        </div>
        <div style={{ textAlign: 'center', width: '220px' }}>
          <div>Dicetak: {new Date().toLocaleDateString('id-ID')}</div>
          <div style={{ fontWeight: 'bold' }}>{schoolInfo?.appMode === 'SMP' ? 'Guru Mata Pelajaran' : 'Guru Kelas'}</div>
          <div style={{ height: '55px' }}></div>
          <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{user?.full_name || schoolInfo?.teacherName || '...........................................'}</div>
          <div>NIP. {user?.nip || schoolInfo?.teacherNIP || '...........................................'}</div>
        </div>
      </div>
    </div>
  )
}
