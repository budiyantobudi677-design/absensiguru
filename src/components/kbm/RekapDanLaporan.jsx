'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { FileSpreadsheet, Printer, Calendar, BookOpen, Award, CheckCircle, ChevronDown, Check, X } from 'lucide-react'
import { exportAttendanceRecapExcel, exportGradesRecapExcel, exportJournalsRecapExcel } from '../../lib/excelExport'

export default function RekapDanLaporan({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [rekapType, setRekapType] = useState('kehadiran') // 'kehadiran' | 'nilai' | 'jurnal'
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [semester, setSemester] = useState('ganjil')
  const [academicYear, setAcademicYear] = useState('2026/2027')
  const [subject, setSubject] = useState('Matematika')

  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [gradeRecords, setGradeRecords] = useState([])
  const [journalRecords, setJournalRecords] = useState([])
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(false)

  const activeClassName = classes?.find(c => c.id === activeClassId)?.name || 'Kelas'

  // Pastikan activeClassId terisi
  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  // Panggil data saat filter berganti
  useEffect(() => {
    if (activeClassId) {
      loadReportData()
    }
  }, [activeClassId, rekapType, month, semester, academicYear, subject])

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
        const [y, m] = (month || new Date().toISOString().slice(0, 7)).split('-')
        const firstDay = `${y}-${m}-01`
        const lastDateObj = new Date(Number(y), Number(m), 0)
        const lastDay = `${lastDateObj.getFullYear()}-${String(lastDateObj.getMonth() + 1).padStart(2, '0')}-${String(lastDateObj.getDate()).padStart(2, '0')}`

        // Data kehadiran sebulan
        const { data: attList } = await supabase
          .from('student_attendance')
          .select('*')
          .eq('class_id', activeClassId)
          .gte('tanggal', firstDay)
          .lte('tanggal', lastDay)
        setAttendanceRecords(attList || [])

        // Data hari libur sekolah di bulan ini
        const { data: hList } = await supabase
          .from('school_holidays')
          .select('*')
          .gte('tanggal', firstDay)
          .lte('tanggal', lastDay)
        setHolidays(hList || [])

      } else if (rekapType === 'nilai') {
        let q = supabase
          .from('student_grades')
          .select('*')
          .eq('class_id', activeClassId)
          .eq('semester', semester)
          .eq('tahun_ajaran', academicYear)

        if (subject && subject !== 'Semua') {
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
      const dayOfWeek = dateObj.getDay() // 0 = Minggu, 6 = Sabtu
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

  // Mapping kehadiran per siswa dan tanggal: { `${student_id}_${dateStr}`: 'hadir' | 'sakit' | 'izin' | 'alpha' }
  const attendanceLookup = useMemo(() => {
    const map = {}
    attendanceRecords.forEach(att => {
      map[`${att.student_id}_${att.tanggal}`] = att.status
    })
    return map
  }, [attendanceRecords])

  // Statistik akumulasi per siswa
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

  // ===================== LOGIKA REKAP NILAI =====================
  // Deteksi nomor TP dan LM yang ada di dataset (atau fallback default 1..6)
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
    // Jika ada LM tercatat, tampilkan sesuai nomornya. Jika belum ada, default 1..4
    if (lmSet.size === 0) return [1, 2, 3, 4]
    return Array.from(lmSet).sort((a, b) => a - b)
  }, [gradeRecords])

  // Hitung nilai siswa per TP, LM, ASTS, STS/SAS, R.TP, R.Akhir, Predikat
  const studentGradesCalculated = useMemo(() => {
    return students.map(student => {
      const stGrades = gradeRecords.filter(g => g.student_id === student.id)

      // Map TP
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

      // Rata-rata TP (RTP)
      const rtp = tpNumArray.length > 0
        ? (tpNumArray.reduce((acc, val) => acc + val, 0) / tpNumArray.length)
        : null

      // Map LM
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

      // ASTS (Asesmen Sumatif Tengah Semester)
      const astsRow = stGrades.find(g => g.tipe_penilaian === 'asts')
      const astsValue = astsRow && astsRow.nilai !== null ? Number(astsRow.nilai) : '-'

      // STS / SAS (Sumatif Akhir)
      const stsRow = stGrades.find(g => g.tipe_penilaian === 'sts' || g.tipe_penilaian === 'sas')
      const stsValue = stsRow && stsRow.nilai !== null ? Number(stsRow.nilai) : '-'

      // Rata-rata Akhir (Semua komponen yang terisi)
      const allValidScores = []
      if (rtp !== null) allValidScores.push(rtp)
      if (lmNumArray.length > 0) allValidScores.push(...lmNumArray)
      if (astsValue !== '-') allValidScores.push(astsValue)
      if (stsValue !== '-') allValidScores.push(stsValue)

      const finalAverage = allValidScores.length > 0
        ? (allValidScores.reduce((acc, val) => acc + val, 0) / allValidScores.length).toFixed(1)
        : '-'

      // Predikat
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
  }, [students, gradeRecords, tpNumbers, lmNumbers])

  // ===================== EKSPOR EXCEL =====================
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
      const headers = ['No', 'NISN', 'Nama Siswa', ...daysInMonthInfo.map(d => String(d.dayNumber)), 'H', 'S', 'I', 'A']
      const rows = students.map((st, idx) => {
        const stats = getStudentMonthlyStats(st.id)
        const dailyStatuses = daysInMonthInfo.map(d => {
          if (d.isSunday) return 'L'
          const stt = attendanceLookup[`${st.id}_${d.dateStr}`]
          if (stt === 'hadir') return 'H'
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

    } else if (rekapType === 'nilai') {
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

    } else if (rekapType === 'jurnal') {
      const headers = ['No', 'Tanggal', 'Mata Pelajaran', 'Materi/Topik', 'Metode', 'Ringkasan Kegiatan', 'Penilaian']
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
        className: activeClassName,
        teacherName: user?.full_name || 'Guru',
        journals: journalRecords,
        schoolInfo: schoolInfoObj
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Card Filter */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#EA580C', background: '#FFEDD5', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Pusat Pelaporan KBM Digital
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

        {/* Segmented Switcher Modul Rekap */}
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
            Rekap Hadir Bulanan
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
            Rekap Nilai Mata Pelajaran
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
            Rekap Jurnal Mengajar
          </button>
        </div>

        {/* Filter Controls Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
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

          {rekapType === 'kehadiran' && (
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

          {rekapType === 'nilai' && (
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
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="IPA / Sains">IPA / Sains</option>
                  <option value="IPS / Sosial">IPS / Sosial</option>
                  <option value="Pendidikan Agama & Budi Pekerti">Pendidikan Agama</option>
                  <option value="Pendidikan Pancasila / PKn">Pendidikan Pancasila</option>
                  <option value="Seni Budaya & Prakarya">Seni Budaya</option>
                  <option value="Pendidikan Jasmani (PJOK)">PJOK</option>
                  <option value="Informatika / TIK">Informatika</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Semester & Tahun
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
            </>
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
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Inggris">Bahasa Inggris</option>
                  <option value="IPA / Sains">IPA / Sains</option>
                  <option value="IPS / Sosial">IPS / Sosial</option>
                  <option value="Pendidikan Agama & Budi Pekerti">Pendidikan Agama</option>
                  <option value="Pendidikan Pancasila / PKn">Pendidikan Pancasila</option>
                  <option value="Seni Budaya & Prakarya">Seni Budaya</option>
                  <option value="Pendidikan Jasmani (PJOK)">PJOK</option>
                  <option value="Informatika / TIK">Informatika</option>
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
        <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '800', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {rekapType === 'kehadiran' && `Daftar Hadir Bulanan - Kelas ${activeClassName} (${month})`}
              {rekapType === 'nilai' && `Rekap Nilai ${subject} - Kelas ${activeClassName} (${semester.toUpperCase()} ${academicYear})`}
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
        ) : rekapType === 'kehadiran' ? (
          /* ========================================================================= */
          /* 1. REKAP HADIR BULANAN (Format Kolom 1..31, H, S, I, A, NISN)               */
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

                        {/* Status Tanggal 1 s.d. 30/31 */}
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
                              {isHadir && (
                                <span style={{ color: '#10B981', fontWeight: '800' }}>✓</span>
                              )}
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

                        {/* Rekap H, S, I, A */}
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
        ) : rekapType === 'nilai' ? (
          /* ========================================================================= */
          /* 2. REKAP NILAI PER MAPEL (TP 1..N, RTP, LM 1..N, ASTS, STS, R.Akhir, Prdk)*/
          /* ========================================================================= */
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', textAlign: 'center', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: 'var(--text)', fontWeight: 'bold' }}>
                  <th style={{ padding: '11px 8px', width: '38px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '11px 8px', width: '95px', textAlign: 'center', color: 'var(--text-muted)' }}>NISN</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', minWidth: '190px' }}>Nama Siswa</th>

                  {/* Header Kolom TP 1..N */}
                  {tpNumbers.map(n => (
                    <th key={`tp_${n}`} style={{ padding: '11px 8px', width: '52px', color: '#1E293B', fontWeight: '800' }}>
                      TP {n}
                    </th>
                  ))}

                  {/* Header Kolom RTP */}
                  <th style={{ padding: '11px 8px', width: '56px', color: '#2563EB', background: '#EFF6FF', fontWeight: '800' }}>
                    RTP
                  </th>

                  {/* Header Kolom LM 1..N */}
                  {lmNumbers.map(n => (
                    <th key={`lm_${n}`} style={{ padding: '11px 8px', width: '52px', color: '#7C3AED', fontWeight: '800' }}>
                      LM {n}
                    </th>
                  ))}

                  {/* Header Kolom ASTS */}
                  <th style={{ padding: '11px 8px', width: '54px', color: '#D97706', fontWeight: '800' }}>
                    ASTS
                  </th>

                  {/* Header Kolom STS */}
                  <th style={{ padding: '11px 8px', width: '54px', color: '#EA580C', fontWeight: '800' }}>
                    STS
                  </th>

                  {/* Header Kolom R.Akhir */}
                  <th style={{ padding: '11px 8px', width: '62px', color: '#B45309', background: '#FEF3C7', fontWeight: '900' }}>
                    R.Akhir
                  </th>

                  {/* Header Kolom Prdk */}
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

                        {/* Nilai TP 1..N */}
                        {tpNumbers.map(n => (
                          <td key={`val_tp_${n}`} style={{ padding: '9px 4px', color: st.tpValues[n] === '-' ? '#CBD5E1' : '#334155', fontWeight: '600' }}>
                            {st.tpValues[n]}
                          </td>
                        ))}

                        {/* RTP (Rata-rata TP) */}
                        <td style={{ padding: '9px 4px', fontWeight: '800', color: '#1D4ED8', background: '#EFF6FF' }}>
                          {st.rtp}
                        </td>

                        {/* Nilai LM 1..N */}
                        {lmNumbers.map(n => (
                          <td key={`val_lm_${n}`} style={{ padding: '9px 4px', color: st.lmValues[n] === '-' ? '#CBD5E1' : '#5B21B6', fontWeight: '600' }}>
                            {st.lmValues[n]}
                          </td>
                        ))}

                        {/* ASTS */}
                        <td style={{ padding: '9px 4px', color: st.astsValue === '-' ? '#CBD5E1' : '#B45309', fontWeight: '600' }}>
                          {st.astsValue}
                        </td>

                        {/* STS */}
                        <td style={{ padding: '9px 4px', color: st.stsValue === '-' ? '#CBD5E1' : '#C2410C', fontWeight: '600' }}>
                          {st.stsValue}
                        </td>

                        {/* R.Akhir */}
                        <td style={{ padding: '9px 4px', fontWeight: '900', color: '#92400E', background: '#FEF3C7' }}>
                          {st.finalAverage}
                        </td>

                        {/* Predikat */}
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
          /* 3. REKAP JURNAL PEMBELAJARAN (Tabel Rapi & Lengkap)                       */
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
                    <td colSpan="6" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
    </div>
  )
}
