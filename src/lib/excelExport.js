import * as XLSX from 'xlsx'

// Helper function to export attendance recap to Excel matching Absensi Super format
export function exportAttendanceRecapExcel({ title, className, periodText, dataGrid, schoolInfo }) {
  const data = []

  // Header info
  data.push([schoolInfo?.schoolName?.toUpperCase() || 'SEKOLAH'])
  data.push([`REKAP KEHADIRAN SISWA - KELAS ${className?.toUpperCase() || ''}`])
  data.push([`Periode: ${periodText}`])
  data.push([]) // blank row

  // Table header
  if (dataGrid && dataGrid.headers) {
    data.push(dataGrid.headers)
  }

  // Table rows
  if (dataGrid && dataGrid.rows) {
    dataGrid.rows.forEach(r => data.push(r))
  }

  // Summary box / footer
  data.push([])
  if (dataGrid && dataGrid.summary) {
    dataGrid.summary.forEach(s => data.push(s))
  }

  // Signature lines
  data.push([])
  data.push([])
  data.push([
    'Mengetahui,', '', '', '', '', '', '', '', 'Dicetak pada: ' + new Date().toLocaleDateString('id-ID')
  ])
  data.push([
    'Kepala Sekolah', '', '', '', '', '', '', '', schoolInfo?.appMode === 'SMP' ? 'Guru Mata Pelajaran' : 'Guru Kelas'
  ])
  data.push([])
  data.push([])
  data.push([
    schoolInfo?.principalName || '(__________________)', '', '', '', '', '', '', '', schoolInfo?.teacherName || '(__________________)'
  ])
  data.push([
    `NIP. ${schoolInfo?.principalNIP || '-'}`, '', '', '', '', '', '', '', `NIP. ${schoolInfo?.teacherNIP || '-'}`
  ])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Auto calculate column width
  ws['!cols'] = (data[3] || data[4] || []).map((_, i) => {
    let maxLen = 8
    data.forEach(r => {
      if (r[i]) {
        const len = String(r[i]).length
        if (len > maxLen) maxLen = len
      }
    })
    return { wch: Math.min(maxLen + 2, 40) }
  })

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Kehadiran')
  const filename = `Rekap_Kehadiran_${className || 'Kelas'}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

// Helper function to export grades / leger to Excel
export function exportGradesRecapExcel(props) {
  const { title, className, subjectName, subject, periodText, semester, academicYear, headers, rows, dataGrid, schoolInfo } = props
  const data = []

  const finalHeaders = (dataGrid && dataGrid.headers) ? dataGrid.headers : (headers || [])
  const finalRows = (dataGrid && dataGrid.rows) ? dataGrid.rows : (rows || [])
  const subjectLabel = subjectName || subject || 'Semua Mapel'
  const periodLabel = periodText || `Semester ${semester?.toUpperCase() || ''} ${academicYear || ''}`

  data.push([schoolInfo?.schoolName?.toUpperCase() || 'SEKOLAH'])
  data.push([`REKAPITULASI NILAI SISWA - KELAS ${className?.toUpperCase() || ''}`])
  data.push([`Mata Pelajaran: ${subjectLabel} | Periode: ${periodLabel}`])
  data.push([])

  if (finalHeaders.length > 0) data.push(finalHeaders)
  if (finalRows.length > 0) finalRows.forEach(r => data.push(r))

  data.push([])
  data.push([])
  data.push(['Mengetahui,', '', '', '', '', '', 'Dicetak pada: ' + new Date().toLocaleDateString('id-ID')])
  data.push(['Kepala Sekolah', '', '', '', '', '', 'Guru Pengampu'])
  data.push([])
  data.push([])
  data.push([schoolInfo?.principalName || '(__________________)', '', '', '', '', '', schoolInfo?.teacherName || '(__________________)'])
  data.push([`NIP. ${schoolInfo?.principalNIP || '-'}`, '', '', '', '', '', `NIP. ${schoolInfo?.teacherNIP || '-'}`])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = (finalHeaders || []).map((_, i) => {
    let maxLen = 8
    data.forEach(r => {
      if (r[i]) {
        const len = String(r[i]).length
        if (len > maxLen) maxLen = len
      }
    })
    return { wch: Math.min(maxLen + 2, 35) }
  })

  XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai')
  const filename = `Rekap_Nilai_${className || 'Kelas'}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}

// Helper function to export journal to Excel
export function exportJournalsRecapExcel({ className, teacherName, journals, schoolInfo }) {
  const data = []

  data.push([schoolInfo?.schoolName?.toUpperCase() || 'SEKOLAH'])
  data.push(['JURNAL KEGIATAN MENGAJAR GURU'])
  data.push([`Guru: ${teacherName || ''} | Kelas: ${className || 'Semua Kelas'}`])
  data.push([])

  const headers = ['No', 'Tanggal', 'Kelas', 'Mata Pelajaran', 'Materi / Topik', 'Teknik', 'Kegiatan', 'Penilaian', 'Catatan']
  data.push(headers)

  if (journals && journals.length > 0) {
    journals.forEach((j, idx) => {
      data.push([
        idx + 1,
        j.tanggal,
        j.classes?.name || j.className || '-',
        j.mata_pelajaran,
        j.topik,
        j.teknik || 'Luring',
        j.kegiatan || '-',
        j.penilaian || '-',
        j.catatan || '-'
      ])
    })
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal_Mengajar')
  const filename = `Jurnal_Mengajar_${teacherName || 'Guru'}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, filename)
}
