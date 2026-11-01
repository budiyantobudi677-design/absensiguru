import React, { useState, useMemo, useEffect } from 'react'
import { 
  Calendar, Table, Grid, Users, Clock, FileSpreadsheet, 
  Download, Printer, Search, Briefcase, Eye, X, Check, 
  ChevronLeft, ChevronRight, Award, Activity, AlertCircle, FileText, ImageIcon,
  Trash2, Loader2, ShieldAlert, List
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { supabase } from '../../lib/supabase'
import { recordDeletedAttendance, fetchDeletedAttendanceRegistry, filterActiveAttendance } from '../../lib/deletedAttendanceManager'

/**
 * Pengurutan Hierarkis Pegawai Sesuai Standar Dinas & Aturan Sekolah:
 * Prioritas Utama Murni Berdasarkan Jabatan:
 * 1. Kepala Sekolah (Selalu di urutan teratas #1)
 * 2. Guru Kelas (Urutan Kelas I s/d VI, lalu rombel A, B, C; Guru Kelas tanpa NIP TETAP di posisi kelasnya)
 * 3. Guru Mata Pelajaran (Mapel)
 * 4. Operator / Administrator
 * 5. Tenaga Kependidikan (Tendik / Pustakawan / Satpam / Bujang / Kebersihan)
 */
export function sortPegawaiHierarchical(list) {
  if (!Array.isArray(list)) return []

  const getTier = (p) => {
    const role = (p.role || '').toLowerCase()
    const penugasan = (p.penugasan_tipe || '').toLowerCase()
    const jabatan = (p.jabatan || '').toLowerCase()

    // 1. Kepala Sekolah
    if (role === 'kepsek' || penugasan === 'kepsek' || jabatan.includes('kepala sekolah')) {
      return 1
    }
    // 2. Guru Kelas (Wali Kelas)
    if (penugasan === 'guru_kelas' || jabatan.includes('guru kelas') || jabatan.includes('wali kelas') || jabatan.includes('wali ')) {
      return 2
    }
    // 3. Guru Mata Pelajaran
    if (role === 'guru_mapel' || penugasan === 'guru_mapel' || jabatan.includes('guru mapel') || jabatan.includes('mapel') || (p.mata_pelajaran && p.mata_pelajaran.trim())) {
      return 3
    }
    // 4. Operator / Administrator
    if (role === 'admin' || role === 'operator' || penugasan === 'admin' || jabatan.includes('administrator') || jabatan.includes('operator')) {
      return 4
    }
    // 5. Tendik (Pustakawan, Bujang, Satpam, Penjaga, Kebersihan, Staf)
    return 5
  }

  const getClassGrade = (jabatan) => {
    const text = (jabatan || '').toUpperCase()
    if (text.match(/\bVI([A-Z]|\b)/) || text.match(/KELAS\s*VI/i) || text.match(/\b6([A-Z]|\b)/)) return { grade: 6, key: text }
    if (text.match(/\bIV([A-Z]|\b)/) || text.match(/KELAS\s*IV/i) || text.match(/\b4([A-Z]|\b)/)) return { grade: 4, key: text }
    if (text.match(/\bV([A-Z]|\b)/) || text.match(/KELAS\s*V/i) || text.match(/\b5([A-Z]|\b)/)) return { grade: 5, key: text }
    if (text.match(/\bIII([A-Z]|\b)/) || text.match(/KELAS\s*III/i) || text.match(/\b3([A-Z]|\b)/)) return { grade: 3, key: text }
    if (text.match(/\bII([A-Z]|\b)/) || text.match(/KELAS\s*II/i) || text.match(/\b2([A-Z]|\b)/)) return { grade: 2, key: text }
    if (text.match(/\bI([A-Z]|\b)/) || text.match(/KELAS\s*I/i) || text.match(/\b1([A-Z]|\b)/)) return { grade: 1, key: text }
    return { grade: 99, key: text }
  }

  return [...list].sort((a, b) => {
    const tierA = getTier(a)
    const tierB = getTier(b)

    // 1. Prioritas Utama: Hierarki Jabatan
    if (tierA !== tierB) return tierA - tierB

    // 2. Jika sama-sama Guru Kelas: urutkan Kelas I s/d VI, lalu rombel
    // Guru kelas yang NIP-nya kosong TETAP berada sesuai urutan kelasnya!
    if (tierA === 2) {
      const clsA = getClassGrade(a.jabatan)
      const clsB = getClassGrade(b.jabatan)
      if (clsA.grade !== clsB.grade) return clsA.grade - clsB.grade
      if (clsA.key !== clsB.key) return clsA.key.localeCompare(clsB.key)
    }

    // 3. Nama pegawai alfabetis
    const nameA = a.full_name || a.email || ''
    const nameB = b.full_name || b.email || ''
    return nameA.localeCompare(nameB, 'id-ID', { sensitivity: 'base' })
  })
}

export default function RekapPresensiPegawai({
  role = 'guru', // 'admin' | 'kepsek' | 'guru' | 'tendik'
  mode = 'all',  // 'all' (laporan seluruh pegawai) | 'personal' (riwayat pribadi guru/admin)
  currentUser,
  pegawaiList = [],
  absensiData = [],
  loading = false,
  selectedMonth,
  onMonthChange,
  schoolName = '',
  schoolLogo = '',
  hariKerja = 5,
  onOpenExportModal,
  onExportExcel,
  onExportPdf,
  onRefresh
}) {
  // Hanya akun Admin yang berhak menghapus catatan presensi (baik satu-satu maupun semua)
  const isAdminUser = role === 'admin' || 
                      currentUser?.role === 'admin' || 
                      window.location.pathname.startsWith('/admin')

  // Mode Tampilan: 'tabel' (Tabel Rinci) | 'daftar' (Rekap Daftar) | 'kalender' (Kalender) | 'matriks' (Matriks Dinas)
  const [viewMode, setViewMode] = useState('tabel')
  const [selectedTeacherId, setSelectedTeacherId] = useState(mode === 'personal' ? (currentUser?.id || '') : '')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeDayDetail, setActiveDayDetail] = useState(null) // Modal detail hari
  const [activePhotoModal, setActivePhotoModal] = useState(null) // Modal preview foto surat/bukti
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletedAttendanceReg, setDeletedAttendanceReg] = useState({ deletedIds: [] })

  // Muat registry riwayat presensi yang telah dihapus (sinkron cloud & local)
  useEffect(() => {
    fetchDeletedAttendanceRegistry(supabase).then(reg => {
      if (reg?.deletedIds) setDeletedAttendanceReg(reg)
    })
  }, [])

  // Parse Bulan & Tahun
  const currentMonthStr = selectedMonth || new Date().toISOString().slice(0, 7)
  const [yearNum, monthNum] = currentMonthStr.split('-').map(Number)
  const monthIndex = monthNum - 1
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const periodLabel = `${monthNames[monthIndex]} ${yearNum}`
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate()

  // Helper fungsi tugas luar, foto, & keterangan
  const isTugasLuar = (item) => {
    return Boolean(
      item?.keterangan?.includes('Tugas Luar') || 
      item?.keterangan?.includes('Pelatihan') ||
      item?.status === 'tugas_luar'
    )
  }

  // Cek apakah rekaman presensi terlambat (jam masuk setelah 07.30 atau status terlambat)
  const isLateRecord = (item) => {
    if (!item) return false
    if (isTugasLuar(item)) return false
    if (['izin', 'sakit', 'alpa'].includes(item.status)) return false
    if (item.status === 'terlambat') return true
    if (item.keterangan && item.keterangan.toLowerCase().includes('terlambat')) return true
    if (!item.waktu_masuk) return false
    try {
      const d = new Date(item.waktu_masuk)
      const mins = d.getHours() * 60 + d.getMinutes()
      // 07.00 - 07.30 WITA dipastikan tepat waktu (tidak terlambat)
      if (mins <= 7 * 60 + 30) return false
      return mins > (7 * 60 + 30)
    } catch (e) {
      return false
    }
  }

  const extractPhoto = (item) => {
    if (!item) return null
    if (item.foto || item.foto_masuk) return item.foto || item.foto_masuk
    if (item.keterangan) {
      const matchUrl = item.keterangan.match(/Foto:\s*(https?:\/\/[^\s|]+)/i)
      if (matchUrl && matchUrl[1]) return matchUrl[1]
      const matchWebp = item.keterangan.match(/\[FOTO_WEBP:([^\]]+)\]/i)
      if (matchWebp && matchWebp[1]) return matchWebp[1]
      const matchData = item.keterangan.match(/(data:image\/[a-zA-Z]+;base64,[^\s|]+)/i)
      if (matchData && matchData[1]) return matchData[1]
    }
    const local = localStorage.getItem(`tugas_luar_foto_${item.tanggal}_${item.user_id}`)
    if (local) return local
    return null
  }

  const cleanKeterangan = (ket) => {
    if (!ket) return ''
    return ket
      .replace(/\|?\s*Foto:\s*https?:\/\/[^\s|]+/gi, '')
      .replace(/\[FOTO_WEBP:[^\]]+\]/gi, '')
      .replace(/data:image\/[a-zA-Z]+;base64,[^\s|]+/gi, '')
      .trim()
  }

  const calculateDuration = (inTime, outTime) => {
    if (!inTime || !outTime) return '-'
    const dIn = new Date(inTime)
    const dOut = new Date(outTime)
    const diffMs = dOut - dIn
    if (diffMs <= 0) return '-'
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours} Jam ${mins} Menit`
  }

  // Daftar Absensi yang telah disaring dari registry terhapus
  const activeAbsensiList = useMemo(() => {
    return filterActiveAttendance(absensiData, deletedAttendanceReg)
  }, [absensiData, deletedAttendanceReg])

  // Hitung Hari Kerja Efektif bulan ini (exclude weekend)
  const hariEfektif = useMemo(() => {
    let count = 0
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(yearNum, monthIndex, i)
      const day = d.getDay()
      const isWeekend = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)
      if (!isWeekend) count++
    }
    return count
  }, [daysInMonth, yearNum, monthIndex, hariKerja])

  // Filter Absensi berdasarkan pencarian, pegawai, dan bulan aktif
  const filteredData = useMemo(() => {
    let result = activeAbsensiList

    // Filter tanggal bulan ini
    result = result.filter(a => a.tanggal && a.tanggal.startsWith(currentMonthStr))

    // Filter Pegawai tertentu jika dipilih
    if (selectedTeacherId) {
      result = result.filter(a => a.user_id === selectedTeacherId)
    }

    // Filter Pencarian Nama
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(a => {
        const name = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
        return name.includes(q)
      })
    }

    // Urutkan tanggal menurun (terbaru di atas)
    return result.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
  }, [activeAbsensiList, currentMonthStr, selectedTeacherId, searchTerm])

  // Hitung KPI Metrik Ringkas
  const kpiStats = useMemo(() => {
    let totalHadir = 0
    let totalIzin = 0
    let totalSakit = 0
    let totalTugasLuar = 0
    let totalAlpa = 0

    filteredData.forEach(item => {
      const tl = isTugasLuar(item)
      if (item.status === 'izin') {
        totalIzin++
      } else if (item.status === 'sakit') {
        totalSakit++
      } else if (item.status === 'alpa') {
        totalAlpa++
      } else {
        totalHadir++
        if (tl) totalTugasLuar++
      }
    })

    const persentase = hariEfektif > 0 ? Math.min(100, Math.round((totalHadir / hariEfektif) * 100)) : 100

    return {
      totalHadir,
      totalIzinSakit: totalIzin + totalSakit,
      totalTugasLuar,
      hariEfektif,
      persentase
    }
  }, [filteredData, hariEfektif])

  // Data Map Absensi per Pegawai & per Tanggal (untuk Matriks Dinas, Kalender & Rekap Daftar)
  const attendanceMap = useMemo(() => {
    const map = {}
    activeAbsensiList.forEach(item => {
      if (!item.tanggal || !item.tanggal.startsWith(currentMonthStr)) return
      const dayKey = item.tanggal // 'YYYY-MM-DD'
      if (!map[item.user_id]) map[item.user_id] = {}
      map[item.user_id][dayKey] = item
    })
    return map
  }, [activeAbsensiList, currentMonthStr])

  // Opsi Pegawai Dropdown (Disusun Sesuai Hierarki Murni)
  const sortedPegawaiOptions = useMemo(() => {
    return sortPegawaiHierarchical(pegawaiList)
  }, [pegawaiList])

  // Daftar Pegawai Aktif yang Tampil (Tersaring & Selalu Terurut Hierarki)
  const activePegawaiList = useMemo(() => {
    if (mode === 'personal') {
      const found = pegawaiList.find(p => p.id === currentUser?.id)
      return found ? [found] : [{ id: currentUser?.id, full_name: currentUser?.email?.split('@')[0] || 'Saya' }]
    }
    let list = pegawaiList
    if (selectedTeacherId) {
      list = pegawaiList.filter(p => p.id === selectedTeacherId)
    } else if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = pegawaiList.filter(p => (p.full_name || p.email || '').toLowerCase().includes(q))
    }
    return sortPegawaiHierarchical(list)
  }, [mode, currentUser, selectedTeacherId, pegawaiList, searchTerm])

  // Ringkasan Kehadiran per Pegawai untuk "Rekap Daftar" & Ekspor Terkait
  const staffSummaryList = useMemo(() => {
    return activePegawaiList.map((p, idx) => {
      let countH = 0
      let countS = 0
      let countI = 0
      let countA = 0
      let countLate = 0

      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${currentMonthStr}-${String(i).padStart(2, '0')}`
        const att = attendanceMap[p.id]?.[dateStr]
        if (att) {
          if (isTugasLuar(att)) {
            countH++
          } else if (att.status === 'sakit') {
            countS++
          } else if (att.status === 'izin') {
            countI++
          } else if (att.status === 'alpa') {
            countA++
          } else {
            countH++
            if (isLateRecord(att)) {
              countLate++
            }
          }
        }
      }

      const pct = hariEfektif > 0 ? `${Math.round((countH / hariEfektif) * 100)}%` : '0%'
      const cleanNip = p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' 
        ? String(p.nip).trim() 
        : '-'

      return {
        no: idx + 1,
        pegawai: p,
        name: p.full_name || p.email?.split('@')[0] || 'Pegawai',
        nip: cleanNip,
        jabatan: p.jabatan || p.role || 'Guru',
        hadir: countH,
        sakit: countS,
        izin: countI,
        alpa: countA,
        terlambat: countLate,
        persentase: pct
      }
    })
  }, [activePegawaiList, attendanceMap, currentMonthStr, daysInMonth, hariEfektif])

  // ================= EXPORT HANDLERS =================

  // Helper Cetak PDF Matriks Dinas Resmi (Ada NIP & H Terlambat Merah)
  const handlePrintPdfMatriks = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      
      // Header Kop Dokumen
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text((schoolName || 'SEKOLAH').toUpperCase(), 148, 13, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`REKAPITULASI DAFTAR HADIR BULANAN PEGAWAI - BULAN ${periodLabel.toUpperCase()}`, 148, 19, { align: 'center' })
      doc.setLineWidth(0.4)
      doc.line(14, 22, 283, 22)

      // Kolom Tabel: No, Nama Pegawai, NIP, 1..daysInMonth, H, S, I, A, %
      const headers = ['No', 'Nama Pegawai', 'NIP']
      for (let i = 1; i <= daysInMonth; i++) {
        headers.push(String(i))
      }
      headers.push('H', 'S', 'I', 'A', '%')

      const tableRows = []
      activePegawaiList.forEach((p, idx) => {
        const cleanNip = p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' 
          ? String(p.nip).trim() 
          : '-'
        const row = [String(idx + 1), p.full_name || p.email?.split('@')[0], cleanNip]
        let countH = 0, countS = 0, countI = 0, countA = 0

        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${currentMonthStr}-${String(i).padStart(2, '0')}`
          const dateObj = new Date(yearNum, monthIndex, i)
          const day = dateObj.getDay()
          const isWeekend = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)

          const att = attendanceMap[p.id]?.[dateStr]
          if (att) {
            if (isTugasLuar(att)) {
              row.push('H')
              countH++
            } else if (att.status === 'sakit') {
              row.push('S')
              countS++
            } else if (att.status === 'izin') {
              row.push('I')
              countI++
            } else if (att.status === 'alpa') {
              row.push('A')
              countA++
            } else {
              row.push('H')
              countH++
            }
          } else {
            row.push(isWeekend ? '-' : '')
          }
        }

        const totalHadir = countH
        const pct = hariEfektif > 0 ? `${Math.round((totalHadir / hariEfektif) * 100)}%` : '0%'
        row.push(String(countH), String(countS), String(countI), String(countA), pct)
        tableRows.push(row)
      })

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 25,
        theme: 'grid',
        styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 35, halign: 'left' },
          2: { cellWidth: 25, halign: 'center' }
        },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index >= 3 && data.column.index < 3 + daysInMonth) {
            const dayNum = data.column.index - 2
            const p = activePegawaiList[data.row.index]
            if (p) {
              const dateStr = `${currentMonthStr}-${String(dayNum).padStart(2, '0')}`
              const att = attendanceMap[p.id]?.[dateStr]
              if (att && isLateRecord(att)) {
                data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fillColor = [254, 226, 226]
                data.cell.styles.fontStyle = 'bold'
              }
            }
          }
        }
      })

      // Lembar Tanda Tangan Resmi
      const finalY = doc.lastAutoTable?.finalY || 160
      if (finalY < 175) {
        doc.setFontSize(8)
        doc.text(`Mengetahui,`, 220, finalY + 10)
        doc.text(`Kepala Sekolah`, 220, finalY + 15)
        doc.text(`( ____________________________ )`, 220, finalY + 32)
        doc.text(`NIP. ........................................`, 220, finalY + 36)
      }

      doc.save(`Rekap_Presensi_Dinas_${currentMonthStr}.pdf`)
    } catch (e) {
      alert('Gagal mengekspor PDF Dinas: ' + e.message)
    }
  }

  // Helper Ekspor Excel Matriks Dinas Resmi dengan ExcelJS (Kompak & Berwarna Persis Preview)
  const handleExportExcelMatriks = async () => {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Matriks Dinas')
      const totalCols = 3 + daysInMonth + 5

      // 1. Kop Dokumen
      worksheet.mergeCells(1, 1, 1, totalCols)
      const titleCell1 = worksheet.getCell(1, 1)
      titleCell1.value = (schoolName || 'SEKOLAH').toUpperCase()
      titleCell1.font = { bold: true, size: 13, color: { argb: 'FF1E293B' } }
      titleCell1.alignment = { horizontal: 'center', vertical: 'middle' }

      worksheet.mergeCells(2, 1, 2, totalCols)
      const titleCell2 = worksheet.getCell(2, 1)
      titleCell2.value = `REKAPITULASI DAFTAR HADIR BULANAN PEGAWAI - BULAN ${periodLabel.toUpperCase()}`
      titleCell2.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
      titleCell2.alignment = { horizontal: 'center', vertical: 'middle' }

      worksheet.addRow([])

      // 2. Baris Header Tabel
      const headers = ['No', 'Nama Pegawai', 'NIP']
      for (let i = 1; i <= daysInMonth; i++) {
        headers.push(String(i))
      }
      headers.push('H', 'S', 'I', 'A', '%')

      const headerRow = worksheet.addRow(headers)
      headerRow.height = 24

      headerRow.eachCell((cell, colNum) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        }

        // Cek hari libur
        if (colNum >= 4 && colNum < 4 + daysInMonth) {
          const dayNum = colNum - 3
          const dateObj = new Date(yearNum, monthIndex, dayNum)
          const dayOfWeek = dateObj.getDay()
          const isWeekend = hariKerja === 5 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0)

          if (isWeekend) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } }
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 }
            return
          }
        }

        // Header rekap H, S, I, A, %
        if (colNum >= 4 + daysInMonth) {
          const rekapIndex = colNum - (4 + daysInMonth)
          const bgColors = ['FF059669', 'FFD97706', 'FF2563EB', 'FFDC2626', 'FF0F172A']
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColors[rekapIndex] || 'FF1E293B' } }
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 }
          return
        }

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8.5 }
      })

      // Atur lebar kolom (ramping & pas)
      worksheet.getColumn(1).width = 5   // No
      worksheet.getColumn(2).width = 28  // Nama
      worksheet.getColumn(3).width = 20  // NIP
      for (let i = 4; i < 4 + daysInMonth; i++) {
        worksheet.getColumn(i).width = 3.8 // Kolom tanggal kecil ramping persis preview!
      }
      worksheet.getColumn(4 + daysInMonth).width = 5.5 // H
      worksheet.getColumn(5 + daysInMonth).width = 5.5 // S
      worksheet.getColumn(6 + daysInMonth).width = 5.5 // I
      worksheet.getColumn(7 + daysInMonth).width = 5.5 // A
      worksheet.getColumn(8 + daysInMonth).width = 7.5 // %

      // 3. Data Baris Pegawai
      activePegawaiList.forEach((p, idx) => {
        const cleanNip = p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' 
          ? String(p.nip).trim() 
          : '-'
        const rowData = [idx + 1, p.full_name || p.email?.split('@')[0], cleanNip]
        let countH = 0, countS = 0, countI = 0, countA = 0

        for (let i = 1; i <= daysInMonth; i++) {
          const dateStr = `${currentMonthStr}-${String(i).padStart(2, '0')}`
          const dateObj = new Date(yearNum, monthIndex, i)
          const day = dateObj.getDay()
          const isWeekend = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)

          const att = attendanceMap[p.id]?.[dateStr]
          if (att) {
            if (isTugasLuar(att)) {
              rowData.push('H')
              countH++
            } else if (att.status === 'sakit') {
              rowData.push('S')
              countS++
            } else if (att.status === 'izin') {
              rowData.push('I')
              countI++
            } else if (att.status === 'alpa') {
              rowData.push('A')
              countA++
            } else {
              rowData.push('H')
              countH++
            }
          } else {
            rowData.push(isWeekend ? '-' : '')
          }
        }

        const pct = hariEfektif > 0 ? `${Math.round((countH / hariEfektif) * 100)}%` : '0%'
        rowData.push(countH, countS, countI, countA, pct)

        const addedRow = worksheet.addRow(rowData)
        addedRow.height = 20

        addedRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
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
          } else if (colNum === 2) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
            cell.font = { size: 8.5, bold: true, color: { argb: 'FF1E293B' } }
          } else if (colNum === 3) {
            cell.font = { size: 8, color: { argb: 'FF475569' } }
          } else if (colNum >= 4 && colNum < 4 + daysInMonth) {
            const dayNum = colNum - 3
            const dateStr = `${currentMonthStr}-${String(dayNum).padStart(2, '0')}`
            const dateObj = new Date(yearNum, monthIndex, dayNum)
            const dayOfWeek = dateObj.getDay()
            const isWeekend = hariKerja === 5 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0)

            const att = attendanceMap[p.id]?.[dateStr]
            if (att) {
              if (isTugasLuar(att)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
                cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8 }
              } else if (att.status === 'sakit') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
                cell.font = { bold: true, color: { argb: 'FFD97706' }, size: 8 }
              } else if (att.status === 'izin') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
                cell.font = { bold: true, color: { argb: 'FF2563EB' }, size: 8 }
              } else if (att.status === 'alpa') {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
                cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8 }
              } else {
                const isLate = isLateRecord(att)
                if (isLate) {
                  // H TERLAMBAT: TEKS MERAH TEBAL + BACKGROUND PINK
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
                  cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8 }
                } else {
                  // H TEPAT WAKTU: TEKS HIJAU + BACKGROUND HIJAU MUDA
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
                  cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8 }
                }
              }
            } else if (isWeekend) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
              cell.font = { color: { argb: 'FF94A3B8' }, size: 8 }
            }
          } else if (colNum === 4 + daysInMonth) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
            cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8 }
          } else if (colNum === 5 + daysInMonth) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
            cell.font = { bold: true, color: { argb: 'FFD97706' }, size: 8 }
          } else if (colNum === 6 + daysInMonth) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
            cell.font = { bold: true, color: { argb: 'FF2563EB' }, size: 8 }
          } else if (colNum === 7 + daysInMonth) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
            cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8 }
          } else if (colNum === 8 + daysInMonth) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
            cell.font = { bold: true, color: { argb: 'FF0284C7' }, size: 8 }
          }
        })
      })

      // Lembar tanda tangan di Excel
      const signStartRow = worksheet.rowCount + 2
      const signCol = Math.max(1, totalCols - 5)
      worksheet.getCell(signStartRow, signCol).value = 'Mengetahui,'
      worksheet.getCell(signStartRow, signCol).font = { size: 9 }
      worksheet.getCell(signStartRow + 1, signCol).value = 'Kepala Sekolah'
      worksheet.getCell(signStartRow + 1, signCol).font = { bold: true, size: 9 }
      worksheet.getCell(signStartRow + 4, signCol).value = '( ____________________________ )'
      worksheet.getCell(signStartRow + 4, signCol).font = { bold: true, size: 9 }
      worksheet.getCell(signStartRow + 5, signCol).value = 'NIP. ........................................'
      worksheet.getCell(signStartRow + 5, signCol).font = { size: 9 }

      const buffer = await workbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer]), `Rekap_Presensi_Dinas_${currentMonthStr}.xlsx`)
    } catch (e) {
      alert('Gagal mengekspor Excel Dinas: ' + e.message)
    }
  }

  // Helper Ekspor Excel Rekap Daftar Kehadiran Pegawai dengan ExcelJS (Kompak & Berwarna)
  const handleExportExcelDaftar = async () => {
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Rekap Daftar')
      const totalCols = 10

      // Kop Dokumen
      worksheet.mergeCells(1, 1, 1, totalCols)
      const titleCell1 = worksheet.getCell(1, 1)
      titleCell1.value = (schoolName || 'SEKOLAH').toUpperCase()
      titleCell1.font = { bold: true, size: 13, color: { argb: 'FF1E293B' } }
      titleCell1.alignment = { horizontal: 'center', vertical: 'middle' }

      worksheet.mergeCells(2, 1, 2, totalCols)
      const titleCell2 = worksheet.getCell(2, 1)
      titleCell2.value = `REKAPITULASI DAFTAR KEHADIRAN PEGAWAI - BULAN ${periodLabel.toUpperCase()}`
      titleCell2.font = { bold: true, size: 10, color: { argb: 'FF475569' } }
      titleCell2.alignment = { horizontal: 'center', vertical: 'middle' }

      worksheet.addRow([])

      const headers = ['No', 'Nama Pegawai', 'NIP', 'Jabatan', 'Hadir', 'Sakit', 'Izin', 'Alfa', 'Terlambat', 'Persentase Kehadiran']
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
      worksheet.getColumn(2).width = 28 // Nama
      worksheet.getColumn(3).width = 20 // NIP
      worksheet.getColumn(4).width = 24 // Jabatan
      worksheet.getColumn(5).width = 9  // Hadir
      worksheet.getColumn(6).width = 9  // Sakit
      worksheet.getColumn(7).width = 9  // Izin
      worksheet.getColumn(8).width = 9  // Alfa
      worksheet.getColumn(9).width = 11 // Terlambat
      worksheet.getColumn(10).width = 14 // % Kehadiran

      staffSummaryList.forEach((item) => {
        const rowData = [
          item.no,
          item.name,
          item.nip,
          item.jabatan,
          item.hadir,
          item.sakit,
          item.izin,
          item.alpa,
          item.terlambat,
          item.persentase
        ]
        const addedRow = worksheet.addRow(rowData)
        addedRow.height = 20

        addedRow.eachCell((cell, colNum) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.font = { size: 8.5 }

          if (colNum === 2) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
            cell.font = { size: 9, bold: true, color: { argb: 'FF1E293B' } }
          } else if (colNum === 4) {
            cell.alignment = { vertical: 'middle', horizontal: 'left' }
            cell.font = { size: 8, color: { argb: 'FF64748B' } }
          } else if (colNum === 5) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
            cell.font = { bold: true, color: { argb: 'FF059669' }, size: 8.5 }
          } else if (colNum === 6 && item.sakit > 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
            cell.font = { bold: true, color: { argb: 'FFD97706' }, size: 8.5 }
          } else if (colNum === 7 && item.izin > 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
            cell.font = { bold: true, color: { argb: 'FF2563EB' }, size: 8.5 }
          } else if (colNum === 8 && item.alpa > 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
            cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8.5 }
          } else if (colNum === 9) {
            if (item.terlambat > 0) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
              cell.font = { bold: true, color: { argb: 'FFDC2626' }, size: 8.5 }
            } else {
              cell.font = { color: { argb: 'FF94A3B8' }, size: 8.5 }
            }
          } else if (colNum === 10) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } }
            cell.font = { bold: true, color: { argb: 'FF0284C7' }, size: 8.5 }
          }
        })
      })

      const signStartRow = worksheet.rowCount + 2
      worksheet.getCell(signStartRow, 7).value = 'Mengetahui,'
      worksheet.getCell(signStartRow, 7).font = { size: 9 }
      worksheet.getCell(signStartRow + 1, 7).value = 'Kepala Sekolah'
      worksheet.getCell(signStartRow + 1, 7).font = { bold: true, size: 9 }
      worksheet.getCell(signStartRow + 4, 7).value = '( ____________________________ )'
      worksheet.getCell(signStartRow + 4, 7).font = { bold: true, size: 9 }
      worksheet.getCell(signStartRow + 5, 7).value = 'NIP. ........................................'
      worksheet.getCell(signStartRow + 5, 7).font = { size: 9 }

      const buffer = await workbook.xlsx.writeBuffer()
      saveAs(new Blob([buffer]), `Rekap_Daftar_Presensi_${currentMonthStr}.xlsx`)
    } catch (e) {
      alert('Gagal mengekspor Excel Rekap Daftar: ' + e.message)
    }
  }

  // Helper Cetak PDF Rekap Daftar Kehadiran Pegawai
  const handlePrintPdfDaftar = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      
      // Header Kop Dokumen
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text((schoolName || 'SEKOLAH').toUpperCase(), 105, 14, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`REKAPITULASI DAFTAR KEHADIRAN PEGAWAI - BULAN ${periodLabel.toUpperCase()}`, 105, 20, { align: 'center' })
      doc.setLineWidth(0.4)
      doc.line(14, 23, 196, 23)

      const headers = ['No', 'Nama Pegawai', 'NIP', 'Hadir', 'Sakit', 'Izin', 'Alfa', 'Terlambat', '% Hadir']
      const tableRows = staffSummaryList.map(item => [
        String(item.no),
        item.name,
        item.nip,
        String(item.hadir),
        String(item.sakit),
        String(item.izin),
        String(item.alpa),
        String(item.terlambat),
        item.persentase
      ])

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 48, halign: 'left' },
          2: { cellWidth: 34, halign: 'center' },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 14, halign: 'center' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 18, halign: 'center' }
        },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 7) {
            const val = parseInt(data.cell.raw, 10)
            if (val > 0) {
              data.cell.styles.textColor = [220, 38, 38]
              data.cell.styles.fillColor = [254, 226, 226]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        }
      })

      const finalY = doc.lastAutoTable?.finalY || 160
      if (finalY < 240) {
        doc.setFontSize(9)
        doc.text(`Mengetahui,`, 140, finalY + 12)
        doc.text(`Kepala Sekolah`, 140, finalY + 17)
        doc.text(`( ____________________________ )`, 140, finalY + 35)
        doc.text(`NIP. ........................................`, 140, finalY + 40)
      }

      doc.save(`Rekap_Daftar_Presensi_${currentMonthStr}.pdf`)
    } catch (e) {
      alert('Gagal mengekspor PDF Rekap Daftar: ' + e.message)
    }
  }

  // Handler Hapus 1 Catatan Presensi dengan Pop-up Konfirmasi (HANYA AKUN ADMIN)
  const handleDeleteSingle = async (item) => {
    if (!isAdminUser) {
      alert('Akses ditolak: Hanya akun Administrator yang berhak menghapus data riwayat kehadiran.')
      return
    }
    if (!item?.id) return
    const tgl = item.tanggal 
      ? new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) 
      : 'ini'
    const namaPegawai = item.profiles?.full_name ? ` milik ${item.profiles.full_name}` : ''
    const confirmMsg = `Apakah Anda yakin ingin menghapus data presensi tanggal ${tgl}${namaPegawai}?\n\nPERINGATAN: Tindakan ini permanen dan data presensi ini akan dihapus dari sistem.`
    
    if (!window.confirm(confirmMsg)) return

    try {
      setIsDeleting(true)
      const itemIdStr = String(item.id)

      await recordDeletedAttendance(supabase, [itemIdStr], {
        adminId: currentUser?.id,
        adminName: currentUser?.full_name || 'Admin',
        tanggal: item.tanggal,
        userId: item.user_id
      })

      setDeletedAttendanceReg(prev => ({
        deletedIds: Array.from(new Set([...(prev.deletedIds || []), itemIdStr]))
      }))

      alert(`Data presensi tanggal ${tgl} berhasil dihapus.`)
      if (activeDayDetail?.att?.id === item.id) {
        setActiveDayDetail(null)
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      alert(`Gagal menghapus data presensi: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Handler Hapus Seluruh Riwayat Presensi yang Tampil dengan Pop-up Konfirmasi (HANYA AKUN ADMIN)
  const handleDeleteAll = async () => {
    if (!isAdminUser) {
      alert('Akses ditolak: Hanya akun Administrator yang berhak menghapus seluruh data riwayat kehadiran.')
      return
    }
    if (!filteredData || filteredData.length === 0) {
      alert('Tidak ada catatan presensi untuk dihapus pada periode ini.')
      return
    }

    const count = filteredData.length
    const targetLabel = mode === 'personal' ? 'pribadi Anda' : (selectedTeacherId ? 'pegawai ini' : 'seluruh pegawai')
    const confirmMsg = `PERINGATAN BESAR:\nApakah Anda yakin ingin menghapus SEMUA ${count} catatan presensi ${targetLabel} pada periode ${periodLabel}?\n\nTindakan ini permanen dan seluruh data presensi terpilih akan dihapus dari sistem.`
    
    if (!window.confirm(confirmMsg)) return
    if (!window.confirm(`Konfirmasi Akhir: Klik OK untuk menghapus permanen ${count} data presensi.`)) return

    try {
      setIsDeleting(true)
      const ids = filteredData.map(d => String(d.id)).filter(Boolean)
      if (ids.length === 0) return

      await recordDeletedAttendance(supabase, ids, {
        adminId: currentUser?.id,
        adminName: currentUser?.full_name || 'Admin',
        count: ids.length,
        period: periodLabel,
        deletedItems: filteredData.map(d => ({ id: d.id, userId: d.user_id, tanggal: d.tanggal }))
      })

      setDeletedAttendanceReg(prev => ({
        deletedIds: Array.from(new Set([...(prev.deletedIds || []), ...ids]))
      }))

      alert(`Sebanyak ${count} data riwayat presensi berhasil dihapus.`)
      setActiveDayDetail(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      alert(`Gagal menghapus seluruh riwayat presensi: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fade-in" style={{ width: '100%' }}>
      {/* 1. HEADER KONTROL & VIEW SWITCHER (4 Mode: Tabel Rinci, Rekap Daftar, Kalender, Matriks Dinas) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem',
        background: 'var(--surface, #FFFFFF)',
        padding: '1.25rem',
        borderRadius: '20px',
        border: '1px solid var(--border, #E2E8F0)',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
      }}>
        {/* Sisi Kiri: Filter Bulan & Pegawai */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#F8FAFC', padding: '0.4rem 0.75rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <Calendar size={18} color="#3B82F6" />
            <input
              type="month"
              value={currentMonthStr}
              onChange={(e) => onMonthChange && onMonthChange(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                color: '#1E293B',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {mode === 'all' && (
            <div style={{ minWidth: '180px', flex: 1, maxWidth: '280px' }}>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                  color: '#334155'
                }}
              >
                <option value="">Semua Pegawai ({sortedPegawaiOptions.length})</option>
                {sortedPegawaiOptions.map(p => {
                  const nipLabel = p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' 
                    ? ` • NIP: ${p.nip}` 
                    : ''
                  return (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email?.split('@')[0]} ({p.jabatan || p.role || 'Guru'}{nipLabel})
                    </option>
                  )
                })}
              </select>
            </div>
          )}

          {mode === 'all' && !selectedTeacherId && (
            <div style={{ position: 'relative', minWidth: '160px', flex: 1 }}>
              <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Cari pegawai / NIP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem 0.55rem 2rem',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}
        </div>

        {/* Sisi Kanan: Tombol View Switcher & Ekspor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* View Switcher Pill Bar (4 Mode Lengkap) */}
          <div style={{
            display: 'inline-flex',
            background: '#F1F5F9',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            flexWrap: 'wrap',
            gap: '2px'
          }}>
            <button
              type="button"
              onClick={() => setViewMode('tabel')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                border: 'none',
                background: viewMode === 'tabel' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'tabel' ? '#1E293B' : '#64748B',
                fontWeight: viewMode === 'tabel' ? 800 : 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'tabel' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Table size={15} />
              <span>Tabel Rinci</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('daftar')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                border: 'none',
                background: viewMode === 'daftar' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'daftar' ? '#1E293B' : '#64748B',
                fontWeight: viewMode === 'daftar' ? 800 : 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'daftar' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <List size={15} />
              <span>Rekap Daftar</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('kalender')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                border: 'none',
                background: viewMode === 'kalender' ? '#FFFFFF' : 'transparent',
                color: viewMode === 'kalender' ? '#1E293B' : '#64748B',
                fontWeight: viewMode === 'kalender' ? 800 : 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: viewMode === 'kalender' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Calendar size={15} />
              <span>Kalender</span>
            </button>

            {(role === 'admin' || role === 'kepsek' || mode === 'all') && (
              <button
                type="button"
                onClick={() => setViewMode('matriks')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: viewMode === 'matriks' ? '#FFFFFF' : 'transparent',
                  color: viewMode === 'matriks' ? '#1E293B' : '#64748B',
                  fontWeight: viewMode === 'matriks' ? 800 : 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'matriks' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <Grid size={15} />
                <span>Matriks Dinas</span>
              </button>
            )}
          </div>

          {/* Tombol Ekspor Khusus Sesuai View Mode */}
          {viewMode === 'matriks' ? (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handlePrintPdfMatriks}
                title="Cetak PDF Matriks Dinas Resmi"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Printer size={15} />
                <span>PDF Dinas</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcelMatriks}
                title="Unduh Excel Matriks Dinas Resmi"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <FileSpreadsheet size={15} />
                <span>Excel Dinas</span>
              </button>
            </div>
          ) : viewMode === 'daftar' ? (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handlePrintPdfDaftar}
                title="Cetak PDF Rekap Daftar Kehadiran"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#EF4444',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Printer size={15} />
                <span>PDF Rekap</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcelDaftar}
                title="Unduh Excel Rekap Daftar Kehadiran"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <FileSpreadsheet size={15} />
                <span>Excel Rekap</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {onExportExcel && (
                <button
                  type="button"
                  onClick={onExportExcel}
                  title="Unduh Riwayat Excel (.xlsx)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#10B981',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <FileSpreadsheet size={15} />
                  <span>Excel</span>
                </button>
              )}
              {onExportPdf && (
                <button
                  type="button"
                  onClick={onExportPdf}
                  title="Unduh Riwayat PDF (.pdf)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <FileText size={15} />
                  <span>PDF</span>
                </button>
              )}
              {onOpenExportModal && !onExportExcel && !onExportPdf && (
                <button
                  type="button"
                  onClick={onOpenExportModal}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#10B981',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '0.5rem 0.9rem',
                    borderRadius: '12px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Download size={15} />
                  <span>Ekspor</span>
                </button>
              )}

              {isAdminUser && filteredData.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteAll}
                  disabled={isDeleting}
                  title="Hapus seluruh riwayat presensi yang tampil saat ini (Khusus Admin)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    border: '1px solid #FECACA',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    opacity: isDeleting ? 0.6 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  <Trash2 size={15} />
                  <span>{isDeleting ? 'Menghapus...' : 'Hapus Semua'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. KPI METRIC SUMMARY CARDS (STATISTIK BULANAN) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem'
      }}>
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          padding: '1.15rem 1rem',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Award size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Total Hadir</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', lineHeight: '1.2' }}>{kpiStats.totalHadir} Hari</div>
            <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>Kehadiran: {kpiStats.persentase}%</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface, #FFFFFF)',
          padding: '1.15rem 1rem',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Izin & Sakit</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563EB', lineHeight: '1.2' }}>{kpiStats.totalIzinSakit} Hari</div>
            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Pengajuan Izin</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface, #FFFFFF)',
          padding: '1.15rem 1rem',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#EEF2FF', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Tugas Luar</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4F46E5', lineHeight: '1.2' }}>{kpiStats.totalTugasLuar} Hari</div>
            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Dinas & Pelatihan</div>
          </div>
        </div>

        <div style={{
          background: 'var(--surface, #FFFFFF)',
          padding: '1.15rem 1rem',
          borderRadius: '18px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Hari Efektif</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#334155', lineHeight: '1.2' }}>{kpiStats.hariEfektif} Hari</div>
            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Bulan {monthNames[monthIndex]}</div>
          </div>
        </div>
      </div>

      {/* 3. TAMPILAN SESUAI VIEW MODE */}
      {loading ? (
        <div style={{ padding: '3.5rem 1rem', textAlign: 'center', background: '#FFFFFF', borderRadius: '20px', border: '1px solid #E2E8F0', color: '#64748B' }}>
          <Activity className="animate-spin" size={28} style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Memuat data rekap presensi...</p>
        </div>
      ) : viewMode === 'tabel' ? (
        /* ================= MODE 1: TABEL RINCI ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '720px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', width: '45px', textAlign: 'center' }}>NO</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>HARI & TANGGAL</th>
                  {mode === 'all' && !selectedTeacherId && (
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>NAMA PEGAWAI</th>
                  )}
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>MASUK (IN)</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>PULANG (OUT)</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>DURASI</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>STATUS</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>KETERANGAN</th>
                  {isAdminUser && (
                    <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#EF4444', textAlign: 'center', width: '70px' }}>AKSI</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={mode === 'all' && !selectedTeacherId ? (isAdminUser ? 9 : 8) : (isAdminUser ? 8 : 7)} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
                      Tidak ada catatan presensi pada periode {periodLabel}.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, idx) => {
                    const tl = isTugasLuar(item)
                    const photo = extractPhoto(item)
                    const note = cleanKeterangan(item.keterangan)
                    const isLate = isLateRecord(item)
                    const isHadir = !item.status || item.status === 'hadir' || isLate || tl

                    let statusLabel = 'HADIR'
                    let badgeBg = '#ECFDF5'
                    let badgeColor = '#059669'
                    let badgeBorder = '#A7F3D0'

                    if (item.status === 'izin') {
                      statusLabel = 'IZIN'
                      badgeBg = '#EFF6FF'
                      badgeColor = '#2563EB'
                      badgeBorder = '#BFDBFE'
                    } else if (item.status === 'sakit') {
                      statusLabel = 'SAKIT'
                      badgeBg = '#FEF3C7'
                      badgeColor = '#D97706'
                      badgeBorder = '#FDE68A'
                    } else if (item.status === 'alpa') {
                      statusLabel = 'ALPA'
                      badgeBg = '#FEE2E2'
                      badgeColor = '#DC2626'
                      badgeBorder = '#FECACA'
                    } else if (isLate) {
                      statusLabel = 'TERLAMBAT'
                      badgeBg = '#FEE2E2'
                      badgeColor = '#DC2626'
                      badgeBorder = '#FECACA'
                    } else {
                      statusLabel = 'HADIR'
                      badgeBg = '#ECFDF5'
                      badgeColor = '#059669'
                      badgeBorder = '#A7F3D0'
                    }

                    const inTime = tl ? '07.00' : (item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')
                    const outTime = tl ? '14.00' : (item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')
                    const duration = tl ? '7 Jam' : calculateDuration(item.waktu_masuk, item.waktu_pulang)

                    return (
                      <tr
                        key={item.id}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.2s',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                        }}
                      >
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#64748B', textAlign: 'center', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E293B' }}>
                            {new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </td>

                        {mode === 'all' && !selectedTeacherId && (
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                                {(item.profiles?.full_name || item.profiles?.email || 'P')[0].toUpperCase()}
                              </div>
                              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                                {item.profiles?.full_name || item.profiles?.email?.split('@')[0]}
                              </span>
                            </div>
                          </td>
                        )}

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{ 
                            display: 'inline-block', 
                            background: isLate ? '#FEE2E2' : '#ECFDF5', 
                            color: isLate ? '#DC2626' : '#047857', 
                            padding: '3px 8px', 
                            borderRadius: '8px', 
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            border: isLate ? '1px solid #FECACA' : '1px solid #A7F3D0' 
                          }}>
                            {inTime}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: item.waktu_pulang ? '#FEF3C7' : '#F1F5F9', color: item.waktu_pulang ? '#B45309' : '#94A3B8', padding: '3px 8px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, border: item.waktu_pulang ? '1px solid #FDE68A' : '1px solid #E2E8F0' }}>
                            {outTime}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                          {duration}
                        </td>

                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                            padding: '3px 10px',
                            borderRadius: '8px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            letterSpacing: '0.5px'
                          }}>
                            {statusLabel}
                          </span>
                        </td>

                        {/* Kolom Keterangan */}
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {!tl && isHadir && !note ? (
                            <span style={{ color: '#CBD5E1', fontWeight: 600 }}>-</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.82rem', color: '#334155' }}>
                                {tl ? (note ? `Tugas Luar - ${note}` : 'Tugas Luar') : (note || statusLabel)}
                              </span>
                              {photo && (
                                <button
                                  type="button"
                                  onClick={() => setActivePhotoModal({ photo, title: `Lampiran: ${item.profiles?.full_name || 'Pegawai'}`, note: tl ? (note || 'Tugas Luar') : note })}
                                  title="Lihat foto surat izin / tugas luar"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    color: '#2563EB',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <ImageIcon size={12} />
                                  <span>Lampiran</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Kolom Aksi Hapus Presensi (Khusus Akun Admin) */}
                        {isAdminUser && (
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(item)}
                              disabled={isDeleting}
                              title="Hapus data presensi ini (Khusus Admin)"
                              style={{
                                background: '#FEF2F2',
                                border: '1px solid #FECACA',
                                color: '#EF4444',
                                cursor: isDeleting ? 'not-allowed' : 'pointer',
                                padding: '6px 8px',
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'daftar' ? (
        /* ================= MODE 2: REKAP DAFTAR KEHADIRAN (NO, NAMA, NIP, HADIR, SAKIT, IZIN, ALFA, TERLAMBAT, %) ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '780px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', width: '45px', textAlign: 'center' }}>NO</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569' }}>NAMA PEGAWAI</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>NIP</th>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#059669', textAlign: 'center' }}>HADIR</th>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#D97706', textAlign: 'center' }}>SAKIT</th>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#2563EB', textAlign: 'center' }}>IZIN</th>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#DC2626', textAlign: 'center' }}>ALFA</th>
                  <th style={{ padding: '0.85rem 0.75rem', fontSize: '0.78rem', fontWeight: 800, color: '#B45309', textAlign: 'center' }}>TERLAMBAT</th>
                  <th style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', fontWeight: 800, color: '#0284C7', textAlign: 'center' }}>% KEHADIRAN</th>
                </tr>
              </thead>
              <tbody>
                {staffSummaryList.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
                      Tidak ada data pegawai yang sesuai pada periode {periodLabel}.
                    </td>
                  </tr>
                ) : (
                  staffSummaryList.map((item, idx) => {
                    const isLateCount = item.terlambat > 0
                    return (
                      <tr
                        key={item.pegawai?.id || idx}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          transition: 'background 0.2s',
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)'
                        }}
                      >
                        <td style={{ padding: '0.85rem 0.75rem', fontSize: '0.82rem', color: '#64748B', textAlign: 'center', fontWeight: 600 }}>
                          {item.no}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#EFF6FF', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>
                              {(item.name || 'P')[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1E293B' }}>
                                {item.name}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 500 }}>
                                {item.jabatan}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.82rem', color: item.nip === '-' ? '#94A3B8' : '#334155', fontWeight: 600 }}>
                          {item.nip}
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: '#ECFDF5', color: '#059669', padding: '3px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, border: '1px solid #A7F3D0' }}>
                            {item.hadir}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: item.sakit > 0 ? '#FEF3C7' : '#F8FAFC', color: item.sakit > 0 ? '#D97706' : '#94A3B8', padding: '3px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, border: item.sakit > 0 ? '1px solid #FDE68A' : '1px solid #E2E8F0' }}>
                            {item.sakit}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: item.izin > 0 ? '#EFF6FF' : '#F8FAFC', color: item.izin > 0 ? '#2563EB' : '#94A3B8', padding: '3px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, border: item.izin > 0 ? '1px solid #BFDBFE' : '1px solid #E2E8F0' }}>
                            {item.izin}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: item.alpa > 0 ? '#FEE2E2' : '#F8FAFC', color: item.alpa > 0 ? '#DC2626' : '#94A3B8', padding: '3px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, border: item.alpa > 0 ? '1px solid #FECACA' : '1px solid #E2E8F0' }}>
                            {item.alpa}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 0.75rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: isLateCount ? '#FEE2E2' : '#F8FAFC', color: isLateCount ? '#DC2626' : '#94A3B8', padding: '3px 10px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 800, border: isLateCount ? '1px solid #FECACA' : '1px solid #E2E8F0' }}>
                            {item.terlambat}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', background: '#F0F9FF', color: '#0284C7', padding: '3px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 800, border: '1px solid #BAE6FD' }}>
                            {item.persentase}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'kalender' ? (
        /* ================= MODE 3: KALENDER BULANAN (SEKOLAH & INDIVIDUAL) ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          padding: '1.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          {(() => {
            const isAllStaffCalendar = mode === 'all' && !selectedTeacherId
            const activeUserId = selectedTeacherId || (mode === 'personal' ? currentUser?.id : (activePegawaiList[0]?.id || currentUser?.id))
            const activeTeacherObj = activePegawaiList.find(p => p.id === activeUserId) || activePegawaiList[0]

            return (
              <>
                {isAllStaffCalendar ? (
                  <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                      Kalender Rekap Sekolah: <strong style={{ color: '#1E293B' }}>Seluruh Pegawai ({activePegawaiList.length} Pegawai)</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Klik pada kotak tanggal untuk melihat daftar absensi lengkap semua pegawai</span>
                  </div>
                ) : (
                  <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                      Kalender Kehadiran: <strong style={{ color: '#1E293B' }}>{activeTeacherObj?.full_name || activeTeacherObj?.email?.split('@')[0] || 'Pegawai'}</strong>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Pilih pegawai dari dropdown di atas untuk melihat kalender pegawai lain</span>
                  </div>
                )}

                {/* Header Hari (Senin - Minggu) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '8px', textAlign: 'center' }}>
                  {['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'].map((dayName, dIdx) => (
                    <div key={dayName} style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      color: dIdx >= 5 ? '#EF4444' : '#64748B',
                      padding: '6px 0'
                    }}>
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Grid Tanggal Bulanan */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                  {(() => {
                    const cells = []
                    const firstDayIndex = (new Date(yearNum, monthIndex, 1).getDay() + 6) % 7

                    for (let i = 0; i < firstDayIndex; i++) {
                      cells.push(<div key={`empty-${i}`} style={{ minHeight: '85px', background: 'transparent' }} />)
                    }

                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${currentMonthStr}-${String(d).padStart(2, '0')}`
                      const dateObj = new Date(yearNum, monthIndex, d)
                      const dayOfWeek = dateObj.getDay()
                      const isWeekend = hariKerja === 5 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0)

                      if (isAllStaffCalendar) {
                        let hadirCount = 0
                        let lateCount = 0
                        let izinCount = 0
                        let sakitCount = 0
                        let alpaCount = 0

                        activePegawaiList.forEach(p => {
                          const att = attendanceMap[p.id]?.[dateStr]
                          if (att) {
                            if (isTugasLuar(att)) {
                              hadirCount++
                            } else if (att.status === 'sakit') {
                              sakitCount++
                            } else if (att.status === 'izin') {
                              izinCount++
                            } else if (att.status === 'alpa') {
                              alpaCount++
                            } else {
                              hadirCount++
                              if (isLateRecord(att)) lateCount++
                            }
                          }
                        })

                        const hasData = (hadirCount + izinCount + sakitCount + alpaCount) > 0

                        let bgBox = '#FFFFFF'
                        let borderColor = '#E2E8F0'

                        if (isWeekend) {
                          bgBox = '#F8FAFC'
                          borderColor = '#F1F5F9'
                        } else if (hasData) {
                          bgBox = lateCount > 0 ? '#FFFBEB' : '#ECFDF5'
                          borderColor = lateCount > 0 ? '#FDE68A' : '#A7F3D0'
                        }

                        cells.push(
                          <div
                            key={`day-${d}`}
                            onClick={() => {
                              if (hasData || !isWeekend) {
                                setActiveDayDetail({
                                  dateStr,
                                  isAllStaff: true,
                                  isWeekend,
                                  stats: { hadirCount, lateCount, izinCount, sakitCount, alpaCount, total: activePegawaiList.length }
                                })
                              }
                            }}
                            style={{
                              minHeight: '85px',
                              background: bgBox,
                              border: `1.5px solid ${borderColor}`,
                              borderRadius: '12px',
                              padding: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              cursor: (hasData || !isWeekend) ? 'pointer' : 'default',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isWeekend ? '#EF4444' : '#1E293B' }}>
                                {d}
                              </span>
                              {hasData && (
                                <span style={{ fontSize: '0.62rem', background: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, color: '#475569' }}>
                                  {hadirCount}/{activePegawaiList.length}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                              {isWeekend ? (
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94A3B8' }}>LIBUR</div>
                              ) : hasData ? (
                                <>
                                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#059669', lineHeight: '1.2' }}>
                                    ✓ {hadirCount} Hadir
                                  </div>
                                  {lateCount > 0 && (
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#DC2626', lineHeight: '1.2' }}>
                                      ⚠️ {lateCount} Terlambat
                                    </div>
                                  )}
                                  {(izinCount + sakitCount) > 0 && (
                                    <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#2563EB', lineHeight: '1.2' }}>
                                      📋 {izinCount + sakitCount} Izin/Skt
                                    </div>
                                  )}
                                  {alpaCount > 0 && (
                                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#DC2626', lineHeight: '1.2' }}>
                                      ❌ {alpaCount} Alpa
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div style={{ fontSize: '0.65rem', color: '#CBD5E1', fontWeight: 500 }}>Belum ada data</div>
                              )}
                            </div>
                          </div>
                        )
                      } else {
                        const att = attendanceMap[activeUserId]?.[dateStr]
                        const tl = isTugasLuar(att)
                        const hasPhoto = Boolean(extractPhoto(att))

                        let bgBox = '#FFFFFF'
                        let borderColor = '#E2E8F0'
                        let statusText = ''
                        let badgeColor = '#64748B'

                        if (att) {
                          if (att.status === 'izin') {
                            bgBox = '#EFF6FF'
                            borderColor = '#BFDBFE'
                            statusText = 'IZIN'
                            badgeColor = '#2563EB'
                          } else if (att.status === 'sakit') {
                            bgBox = '#FEF3C7'
                            borderColor = '#FDE68A'
                            statusText = 'SAKIT'
                            badgeColor = '#D97706'
                          } else if (att.status === 'alpa') {
                            bgBox = '#FEE2E2'
                            borderColor = '#FECACA'
                            statusText = 'ALPA'
                            badgeColor = '#DC2626'
                          } else {
                            const isAttLate = isLateRecord(att)
                            bgBox = isAttLate ? '#FEE2E2' : '#ECFDF5'
                            borderColor = isAttLate ? '#FECACA' : '#A7F3D0'
                            badgeColor = isAttLate ? '#DC2626' : '#059669'
                            if (tl) {
                              statusText = '07.00 - 14.00 (TL)'
                            } else {
                              const inStr = att.waktu_masuk ? new Date(att.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
                              const outStr = att.waktu_pulang ? new Date(att.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
                              statusText = inStr ? `${inStr} - ${outStr || '...'}` : 'HADIR'
                            }
                          }
                        } else if (isWeekend) {
                          bgBox = '#F8FAFC'
                          borderColor = '#F1F5F9'
                          statusText = 'LIBUR'
                          badgeColor = '#94A3B8'
                        }

                        cells.push(
                          <div
                            key={`day-${d}`}
                            onClick={() => {
                              if (att) {
                                setActiveDayDetail({ dateStr, att, tl, isWeekend })
                              }
                            }}
                            style={{
                              minHeight: '85px',
                              background: bgBox,
                              border: `1.5px solid ${borderColor}`,
                              borderRadius: '12px',
                              padding: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              cursor: att ? 'pointer' : 'default',
                              transition: 'transform 0.15s, box-shadow 0.15s'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isWeekend ? '#EF4444' : '#1E293B' }}>
                                {d}
                              </span>
                              {hasPhoto && <span style={{ fontSize: '0.65rem' }}>📷</span>}
                            </div>

                            <div style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              color: badgeColor,
                              lineHeight: '1.2',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {statusText}
                            </div>
                          </div>
                        )
                      }
                    }
                    return cells
                  })()}
                </div>
              </>
            )
          })()}
        </div>
      ) : (
        /* ================= MODE 4: MATRIKS DINAS 1-31 (KOLOM NIP & H TERLAMBAT MERAH) ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ overflowX: 'auto', maxHeight: '580px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1E293B', color: '#FFFFFF' }}>
                <tr>
                  <th style={{ padding: '0.75rem 0.5rem', width: '35px', borderRight: '1px solid #334155' }}>No</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '180px', borderRight: '1px solid #334155' }}>Nama Pegawai</th>
                  <th style={{ padding: '0.75rem 0.6rem', textAlign: 'center', minWidth: '110px', borderRight: '1px solid #334155' }}>NIP</th>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = i + 1
                    const dateObj = new Date(yearNum, monthIndex, d)
                    const day = dateObj.getDay()
                    const isRed = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)
                    return (
                      <th key={d} style={{ padding: '0.5rem 2px', minWidth: '24px', background: isRed ? '#EF4444' : 'transparent', color: '#FFFFFF', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                        {d}
                      </th>
                    )
                  })}
                  <th style={{ padding: '0.75rem 0.4rem', background: '#059669', color: '#FFFFFF', minWidth: '32px' }}>H</th>
                  <th style={{ padding: '0.75rem 0.4rem', background: '#D97706', color: '#FFFFFF', minWidth: '32px' }}>S</th>
                  <th style={{ padding: '0.75rem 0.4rem', background: '#2563EB', color: '#FFFFFF', minWidth: '32px' }}>I</th>
                  <th style={{ padding: '0.75rem 0.4rem', background: '#DC2626', color: '#FFFFFF', minWidth: '32px' }}>A</th>
                  <th style={{ padding: '0.75rem 0.5rem', background: '#0F172A', color: '#38BDF8', minWidth: '45px', fontWeight: 800 }}>%</th>
                </tr>
              </thead>
              <tbody>
                {activePegawaiList.map((p, idx) => {
                  let countH = 0, countS = 0, countI = 0, countA = 0
                  const cleanNip = p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' 
                    ? String(p.nip).trim() 
                    : '-'

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid #E2E8F0',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
                      }}
                    >
                      <td style={{ padding: '0.5rem', color: '#64748B', fontWeight: 600, borderRight: '1px solid #E2E8F0' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 700, color: '#1E293B', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                        {p.full_name || p.email?.split('@')[0]}
                        <div style={{ fontSize: '0.675rem', color: '#64748B', fontWeight: 400 }}>{p.jabatan || p.role || 'Guru'}</div>
                      </td>
                      <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', color: cleanNip === '-' ? '#94A3B8' : '#334155', fontSize: '0.72rem', fontWeight: 600, borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                        {cleanNip}
                      </td>

                      {/* Kolom Tanggal 1 s.d. 31 */}
                      {Array.from({ length: daysInMonth }, (_, dIdx) => {
                        const d = dIdx + 1
                        const dateStr = `${currentMonthStr}-${String(d).padStart(2, '0')}`
                        const dateObj = new Date(yearNum, monthIndex, d)
                        const day = dateObj.getDay()
                        const isWeekend = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)

                        const att = attendanceMap[p.id]?.[dateStr]
                        let symbol = ''
                        let cellBg = isWeekend ? '#F1F5F9' : 'transparent'
                        let cellColor = '#64748B'

                        if (att) {
                          if (isTugasLuar(att)) {
                            symbol = 'H'
                            cellBg = '#ECFDF5'
                            cellColor = '#059669'
                            countH++
                          } else if (att.status === 'sakit') {
                            symbol = 'S'
                            cellBg = '#FEF3C7'
                            cellColor = '#D97706'
                            countS++
                          } else if (att.status === 'izin') {
                            symbol = 'I'
                            cellBg = '#EFF6FF'
                            cellColor = '#2563EB'
                            countI++
                          } else if (att.status === 'alpa') {
                            symbol = 'A'
                            cellBg = '#FEE2E2'
                            cellColor = '#DC2626'
                            countA++
                          } else {
                            const isLate = isLateRecord(att)
                            symbol = 'H'
                            if (isLate) {
                              cellBg = '#FEE2E2'
                              cellColor = '#DC2626'
                            } else {
                              cellBg = '#ECFDF5'
                              cellColor = '#059669'
                            }
                            countH++
                          }
                        } else if (isWeekend) {
                          symbol = '-'
                          cellColor = '#94A3B8'
                        }

                        return (
                          <td
                            key={d}
                            style={{
                              padding: '4px 1px',
                              background: cellBg,
                              color: cellColor,
                              fontWeight: 800,
                              fontSize: '0.72rem',
                              borderRight: '1px solid #E2E8F0'
                            }}
                          >
                            {symbol}
                          </td>
                        )
                      })}

                      {/* Rekapitulasi Baris */}
                      <td style={{ padding: '4px', fontWeight: 800, color: '#059669', background: '#ECFDF5' }}>{countH}</td>
                      <td style={{ padding: '4px', fontWeight: 800, color: '#D97706', background: '#FEF3C7' }}>{countS}</td>
                      <td style={{ padding: '4px', fontWeight: 800, color: '#2563EB', background: '#EFF6FF' }}>{countI}</td>
                      <td style={{ padding: '4px', fontWeight: 800, color: '#DC2626', background: '#FEE2E2' }}>{countA}</td>
                      <td style={{ padding: '4px', fontWeight: 800, color: '#0284C7', background: '#F0F9FF' }}>
                        {hariEfektif > 0 ? `${Math.round((countH / hariEfektif) * 100)}%` : '0%'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MODAL DETAIL POPUP HARI (DARI KALENDER - SEKOLAH ATAU INDIVIDUAL) */}
      {activeDayDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', maxWidth: activeDayDetail.isAllStaff ? '580px' : '440px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                {activeDayDetail.isAllStaff ? 'Daftar Hadir Sekolah: ' : 'Detail Presensi: '}
                {new Date(activeDayDetail.dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h4>
              <button onClick={() => setActiveDayDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            {activeDayDetail.isAllStaff ? (
              /* REKAP DETAIL SELURUH PEGAWAI DI KALENDER */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px',
                  background: '#F8FAFC',
                  padding: '0.65rem',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>HADIR</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#059669' }}>{activeDayDetail.stats?.hadirCount || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>TERLAMBAT</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: (activeDayDetail.stats?.lateCount || 0) > 0 ? '#DC2626' : '#64748B' }}>{activeDayDetail.stats?.lateCount || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>IZIN / SKT</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563EB' }}>{(activeDayDetail.stats?.izinCount || 0) + (activeDayDetail.stats?.sakitCount || 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>ALFA</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: (activeDayDetail.stats?.alpaCount || 0) > 0 ? '#DC2626' : '#64748B' }}>{activeDayDetail.stats?.alpaCount || 0}</div>
                  </div>
                </div>

                <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                  {activePegawaiList.map((p, idx) => {
                    const att = attendanceMap[p.id]?.[activeDayDetail.dateStr]
                    const tl = isTugasLuar(att)
                    const isLate = isLateRecord(att)
                    const photo = extractPhoto(att)

                    let statusBadge = { label: 'BELUM ABSEN', bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' }
                    if (att) {
                      if (tl) {
                        statusBadge = { label: 'TUGAS LUAR', bg: '#EEF2FF', color: '#4F46E5', border: '#C7D2FE' }
                      } else if (att.status === 'sakit') {
                        statusBadge = { label: 'SAKIT', bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' }
                      } else if (att.status === 'izin') {
                        statusBadge = { label: 'IZIN', bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' }
                      } else if (att.status === 'alpa') {
                        statusBadge = { label: 'ALPA', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' }
                      } else if (isLate) {
                        statusBadge = { label: 'TERLAMBAT', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' }
                      } else {
                        statusBadge = { label: 'HADIR', bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' }
                      }
                    }

                    const inTime = tl ? '07.00' : (att?.waktu_masuk ? new Date(att.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')
                    const outTime = tl ? '14.00' : (att?.waktu_pulang ? new Date(att.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')

                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.55rem 0.75rem',
                          borderRadius: '10px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          gap: '8px'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {idx + 1}. {p.full_name || p.email?.split('@')[0]}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                            {p.nip && String(p.nip).trim() && String(p.nip).trim() !== '.' && String(p.nip).trim() !== '-' ? `NIP: ${p.nip}` : 'Non-NIP'} • {p.jabatan || p.role || 'Guru'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {att && !['izin', 'sakit', 'alpa'].includes(att.status) && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}>
                              {inTime} - {outTime}
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: statusBadge.bg,
                            color: statusBadge.color,
                            border: `1px solid ${statusBadge.border}`
                          }}>
                            {statusBadge.label}
                          </span>
                          {photo && (
                            <button
                              type="button"
                              onClick={() => setActivePhotoModal({ photo, title: `Lampiran: ${p.full_name}`, note: cleanKeterangan(att?.keterangan) })}
                              title="Lihat Foto Lampiran"
                              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.68rem' }}
                            >
                              📷
                            </button>
                          )}
                          {isAdminUser && att && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(att)}
                              disabled={isDeleting}
                              title="Hapus presensi pegawai ini"
                              style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', padding: '3px 6px', borderRadius: '4px', cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : activeDayDetail.att ? (() => {
              const isDetailLate = isLateRecord(activeDayDetail.att)

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Status Kehadiran:</span>
                    <span style={{ 
                      fontWeight: 800, 
                      textTransform: 'uppercase', 
                      color: activeDayDetail.tl ? '#059669' : (
                        isDetailLate ? '#DC2626' : (
                          activeDayDetail.att.status === 'sakit' ? '#D97706' : (
                            activeDayDetail.att.status === 'izin' ? '#2563EB' : (
                              activeDayDetail.att.status === 'alpa' ? '#DC2626' : '#059669'
                            )
                          )
                        )
                      )
                    }}>
                      {activeDayDetail.tl ? 'HADIR (TUGAS LUAR)' : (isDetailLate ? 'TERLAMBAT' : (['izin', 'sakit', 'alpa'].includes(activeDayDetail.att.status) ? activeDayDetail.att.status.toUpperCase() : 'HADIR'))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Jam Masuk (IN):</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>
                      {activeDayDetail.tl ? '07.00' : (activeDayDetail.att.waktu_masuk ? new Date(activeDayDetail.att.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Jam Pulang (OUT):</span>
                    <span style={{ fontWeight: 700, color: '#D97706' }}>
                      {activeDayDetail.tl ? '14.00' : (activeDayDetail.att.waktu_pulang ? new Date(activeDayDetail.att.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Durasi Kerja:</span>
                    <span style={{ fontWeight: 700, color: '#1E293B' }}>
                      {activeDayDetail.tl ? '7 Jam 00 Menit' : calculateDuration(activeDayDetail.att.waktu_masuk, activeDayDetail.att.waktu_pulang)}
                    </span>
                  </div>

                  {activeDayDetail.att.keterangan && (
                    <div style={{ background: '#F8FAFC', padding: '0.75rem', borderRadius: '10px', border: '1px solid #E2E8F0', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Keterangan / Alasan:</div>
                      <div style={{ color: '#334155' }}>{cleanKeterangan(activeDayDetail.att.keterangan)}</div>
                    </div>
                  )}

                  {extractPhoto(activeDayDetail.att) && (
                    <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                      <img
                        src={extractPhoto(activeDayDetail.att)}
                        alt="Lampiran Surat / Bukti"
                        style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #CBD5E1' }}
                      />
                    </div>
                  )}

                  {isAdminUser && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSingle(activeDayDetail.att)}
                      disabled={isDeleting}
                      style={{
                        marginTop: '0.75rem',
                        width: '100%',
                        padding: '0.65rem 1rem',
                        borderRadius: '12px',
                        background: '#FEF2F2',
                        color: '#DC2626',
                        border: '1px solid #FECACA',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Hapus Presensi Tanggal Ini (Khusus Admin)</span>
                    </button>
                  )}
                </div>
              )
            })() : (
              <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.85rem' }}>Tidak ada rekaman presensi pada hari ini.</p>
            )}
          </div>
        </div>
      )}

      {/* 5. MODAL ZOOM FOTO LAMPIRAN */}
      {activePhotoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', maxWidth: '520px', width: '100%', padding: '1.25rem', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>{activePhotoModal.title}</h4>
                {activePhotoModal.note && <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>{activePhotoModal.note}</p>}
              </div>
              <button onClick={() => setActivePhotoModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <img
                src={activePhotoModal.photo}
                alt="Dokumentasi Lampiran"
                style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '14px', border: '1px solid #E2E8F0' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
