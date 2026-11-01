import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

/**
 * Ekspor Rekap Kehadiran Siswa ke Excel dengan format profesional & kompak mirip preview
 */
export async function exportAttendanceRecapExcel({ title, className, periodText, dataGrid, schoolInfo }) {
  try {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Rekap Kehadiran')

    const headers = (dataGrid && dataGrid.headers) ? dataGrid.headers : ['No', 'Nama Siswa']
    const totalCols = Math.max(headers.length, 10)

    // 1. Kop Dokumen
    worksheet.mergeCells(1, 1, 1, totalCols)
    const titleCell1 = worksheet.getCell(1, 1)
    titleCell1.value = (schoolInfo?.schoolName || 'SEKOLAH').toUpperCase()
    titleCell1.font = { bold: true, size: 13, color: { argb: 'FF1E293B' } }
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(2, 1, 2, totalCols)
    const titleCell2 = worksheet.getCell(2, 1)
    titleCell2.value = `REKAP KEHADIRAN SISWA - KELAS ${className?.toUpperCase() || ''}`
    titleCell2.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
    titleCell2.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(3, 1, 3, totalCols)
    const titleCell3 = worksheet.getCell(3, 1)
    titleCell3.value = `Periode: ${periodText || ''}`
    titleCell3.font = { bold: true, size: 9, color: { argb: 'FF64748B' } }
    titleCell3.alignment = { horizontal: 'left', vertical: 'middle' }

    worksheet.addRow([]) // Baris kosong

    // 2. Baris Header Tabel
    const headerRow = worksheet.addRow(headers)
    headerRow.height = 24

    headerRow.eachCell((cell, colNum) => {
      const colName = String(headers[colNum - 1] || '').trim()
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      }

      // Warna rekap H, S, I, A
      if (colName === 'H') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }
      } else if (colName === 'S') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }
      } else if (colName === 'I') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      } else if (colName === 'A') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
      } else if (colName === '%') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8.5 }
    })

    // Atur lebar kolom: No kecil, Nama lebar, kolom tanggal 1..31 kecil (3.8)
    headers.forEach((h, idx) => {
      const colNum = idx + 1
      const strH = String(h || '').trim()
      const isDayCol = /^\d+$/.test(strH)

      if (strH.toLowerCase() === 'no') {
        worksheet.getColumn(colNum).width = 5
      } else if (strH.toLowerCase().includes('nama')) {
        worksheet.getColumn(colNum).width = 28
      } else if (strH.toLowerCase().includes('nis') || strH.toLowerCase().includes('nisn')) {
        worksheet.getColumn(colNum).width = 14
      } else if (isDayCol) {
        worksheet.getColumn(colNum).width = 3.8 // Kompak ramping!
      } else if (['h', 's', 'i', 'a'].includes(strH.toLowerCase())) {
        worksheet.getColumn(colNum).width = 5.5
      } else if (strH === '%') {
        worksheet.getColumn(colNum).width = 7.5
      } else {
        worksheet.getColumn(colNum).width = 8
      }
    })

    // 3. Baris Data Siswa
    if (dataGrid && dataGrid.rows) {
      dataGrid.rows.forEach(r => {
        const addedRow = worksheet.addRow(r)
        addedRow.height = 20

        addedRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const colName = String(headers[colNum - 1] || '').trim()
          const val = String(cell.value || '').trim()
          const isDayCol = /^\d+$/.test(colName)

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.font = { size: 8 }

          if (colNum === 1) {
            cell.font = { size: 8, color: { argb: 'FF64748B' }, bold: true }
          } else if (colName.toLowerCase().includes('nama')) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
            cell.font = { size: 8.5, bold: true, color: { argb: 'FF1E293B' } }
          } else if (isDayCol) {
            if (val === 'H') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
              cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8 }
            } else if (val === 'S') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
              cell.font = { bold: true, color: { argb: 'FFD97706' }, size: 8 }
            } else if (val === 'I') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
              cell.font = { bold: true, color: { argb: 'FF2563EB' }, size: 8 }
            } else if (val === 'A') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
              cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8 }
            } else if (val === '-') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
              cell.font = { color: { argb: 'FF94A3B8' }, size: 8 }
            }
          } else if (colName === 'H') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
            cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8 }
          } else if (colName === 'S') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
            cell.font = { bold: true, color: { argb: 'FFD97706' }, size: 8 }
          } else if (colName === 'I') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
            cell.font = { bold: true, color: { argb: 'FF2563EB' }, size: 8 }
          } else if (colName === 'A') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
            cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8 }
          } else if (colName === '%') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
            cell.font = { bold: true, color: { argb: 'FF0284C7' }, size: 8 }
          }
        })
      })
    }

    // 4. Baris Summary jika ada
    if (dataGrid && dataGrid.summary) {
      worksheet.addRow([])
      dataGrid.summary.forEach(s => {
        const sumRow = worksheet.addRow(s)
        sumRow.font = { bold: true, size: 8.5 }
      })
    }

    // 5. Lembar Tanda Tangan
    const signRow = worksheet.rowCount + 2
    const targetCol = Math.max(1, totalCols - 5)
    worksheet.getCell(signRow, targetCol).value = schoolInfo?.placeDateText || ('Dicetak pada: ' + new Date().toLocaleDateString('id-ID'))
    worksheet.getCell(signRow, targetCol).font = { size: 9 }
    worksheet.getCell(signRow + 1, targetCol).value = 'Mengetahui, Kepala Sekolah'
    worksheet.getCell(signRow + 1, targetCol).font = { bold: true, size: 9 }
    worksheet.getCell(signRow + 4, targetCol).value = schoolInfo?.principalName || '( ____________________________ )'
    worksheet.getCell(signRow + 4, targetCol).font = { bold: true, size: 9 }
    worksheet.getCell(signRow + 5, targetCol).value = `NIP. ${schoolInfo?.principalNIP || '-'}`
    worksheet.getCell(signRow + 5, targetCol).font = { size: 9 }

    const filename = `Rekap_Kehadiran_${className || 'Kelas'}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), filename)
  } catch (err) {
    console.error('Error exporting student attendance to excel:', err)
  }
}

/**
 * Ekspor Rekap Nilai / Leger Siswa ke Excel dengan format profesional & kompak
 */
export async function exportGradesRecapExcel(props) {
  try {
    const { title, className, subjectName, subject, periodText, semester, academicYear, headers, rows, dataGrid, schoolInfo } = props
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Rekap Nilai')

    const finalHeaders = (dataGrid && dataGrid.headers) ? dataGrid.headers : (headers || [])
    const finalRows = (dataGrid && dataGrid.rows) ? dataGrid.rows : (rows || [])
    const subjectLabel = subjectName || subject || 'Semua Mapel'
    const periodLabel = periodText || `Semester ${semester?.toUpperCase() || ''} ${academicYear || ''}`
    const totalCols = Math.max(finalHeaders.length, 8)

    // Kop
    worksheet.mergeCells(1, 1, 1, totalCols)
    const titleCell1 = worksheet.getCell(1, 1)
    titleCell1.value = (schoolInfo?.schoolName || 'SEKOLAH').toUpperCase()
    titleCell1.font = { bold: true, size: 13, color: { argb: 'FF1E293B' } }
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(2, 1, 2, totalCols)
    const titleCell2 = worksheet.getCell(2, 1)
    titleCell2.value = `REKAPITULASI NILAI SISWA - KELAS ${className?.toUpperCase() || ''}`
    titleCell2.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
    titleCell2.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(3, 1, 3, totalCols)
    const titleCell3 = worksheet.getCell(3, 1)
    titleCell3.value = `Mata Pelajaran: ${subjectLabel} | Periode: ${periodLabel}`
    titleCell3.font = { bold: true, size: 9, color: { argb: 'FF64748B' } }
    titleCell3.alignment = { horizontal: 'left', vertical: 'middle' }

    worksheet.addRow([])

    // Header Tabel
    const headerRow = worksheet.addRow(finalHeaders)
    headerRow.height = 24
    headerRow.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    })

    // Lebar kolom
    finalHeaders.forEach((h, idx) => {
      const colNum = idx + 1
      const strH = String(h || '').trim()
      if (strH.toLowerCase() === 'no') {
        worksheet.getColumn(colNum).width = 5
      } else if (strH.toLowerCase().includes('nama')) {
        worksheet.getColumn(colNum).width = 28
      } else if (strH.toLowerCase().includes('nis') || strH.toLowerCase().includes('nisn')) {
        worksheet.getColumn(colNum).width = 14
      } else {
        worksheet.getColumn(colNum).width = Math.max(strH.length + 3, 7)
      }
    })

    // Baris Data
    finalRows.forEach(r => {
      const addedRow = worksheet.addRow(r)
      addedRow.height = 20
      addedRow.eachCell((cell, colNum) => {
        const colName = String(finalHeaders[colNum - 1] || '').trim()
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.font = { size: 8.5 }

        if (colName.toLowerCase().includes('nama')) {
          cell.alignment = { vertical: 'middle', horizontal: 'left' }
          cell.font = { size: 9, bold: true, color: { argb: 'FF1E293B' } }
        }
      })
    })

    // Tanda tangan
    const signRow = worksheet.rowCount + 2
    const targetCol = Math.max(1, totalCols - 3)
    worksheet.getCell(signRow, targetCol).value = schoolInfo?.placeDateText || ('Dicetak pada: ' + new Date().toLocaleDateString('id-ID'))
    worksheet.getCell(signRow, targetCol).font = { size: 9 }
    worksheet.getCell(signRow + 1, targetCol).value = 'Guru Pengampu'
    worksheet.getCell(signRow + 1, targetCol).font = { bold: true, size: 9 }
    worksheet.getCell(signRow + 4, targetCol).value = schoolInfo?.teacherName || '( ____________________________ )'
    worksheet.getCell(signRow + 4, targetCol).font = { bold: true, size: 9 }
    worksheet.getCell(signRow + 5, targetCol).value = `NIP. ${schoolInfo?.teacherNIP || '-'}`
    worksheet.getCell(signRow + 5, targetCol).font = { size: 9 }

    const filename = `Rekap_Nilai_${className || 'Kelas'}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), filename)
  } catch (err) {
    console.error('Error exporting grades to excel:', err)
  }
}

/**
 * Ekspor Jurnal Kegiatan Mengajar Guru ke Excel dengan format rapi & proporsional
 */
export async function exportJournalsRecapExcel({ className, teacherName, journals, schoolInfo }) {
  try {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Jurnal Mengajar')

    const totalCols = 9

    worksheet.mergeCells(1, 1, 1, totalCols)
    const titleCell1 = worksheet.getCell(1, 1)
    titleCell1.value = (schoolInfo?.schoolName || 'SEKOLAH').toUpperCase()
    titleCell1.font = { bold: true, size: 13, color: { argb: 'FF1E293B' } }
    titleCell1.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(2, 1, 2, totalCols)
    const titleCell2 = worksheet.getCell(2, 1)
    titleCell2.value = 'JURNAL KEGIATAN MENGAJAR GURU'
    titleCell2.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
    titleCell2.alignment = { horizontal: 'center', vertical: 'middle' }

    worksheet.mergeCells(3, 1, 3, totalCols)
    const titleCell3 = worksheet.getCell(3, 1)
    titleCell3.value = `Guru: ${teacherName || ''} | Kelas: ${className || 'Semua Kelas'}`
    titleCell3.font = { bold: true, size: 9, color: { argb: 'FF64748B' } }
    titleCell3.alignment = { horizontal: 'left', vertical: 'middle' }

    worksheet.addRow([])

    const headers = ['No', 'Tanggal', 'Kelas', 'Mata Pelajaran', 'Materi / Topik', 'Teknik', 'Kegiatan', 'Penilaian', 'Catatan']
    const headerRow = worksheet.addRow(headers)
    headerRow.height = 24

    headerRow.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    })

    worksheet.getColumn(1).width = 5  // No
    worksheet.getColumn(2).width = 14 // Tanggal
    worksheet.getColumn(3).width = 12 // Kelas
    worksheet.getColumn(4).width = 20 // Mapel
    worksheet.getColumn(5).width = 28 // Materi
    worksheet.getColumn(6).width = 12 // Teknik
    worksheet.getColumn(7).width = 30 // Kegiatan
    worksheet.getColumn(8).width = 16 // Penilaian
    worksheet.getColumn(9).width = 20 // Catatan

    if (journals && journals.length > 0) {
      journals.forEach((j, idx) => {
        const addedRow = worksheet.addRow([
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
        addedRow.height = 22

        addedRow.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
          cell.alignment = { vertical: 'middle', horizontal: colNum <= 3 ? 'center' : 'left', wrapText: true }
          cell.font = { size: 8.5 }
        })
      })
    }

    const filename = `Jurnal_Mengajar_${teacherName || 'Guru'}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), filename)
  } catch (err) {
    console.error('Error exporting journals to excel:', err)
  }
}
