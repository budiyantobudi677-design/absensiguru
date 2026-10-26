import React, { useState, useMemo, useEffect } from 'react'
import { 
  Calendar, Table, Grid, Users, Clock, FileSpreadsheet, 
  Download, Printer, Search, Briefcase, Eye, X, Check, 
  ChevronLeft, ChevronRight, Award, Activity, AlertCircle, FileText, ImageIcon,
  Trash2, Loader2, ShieldAlert
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { recordDeletedAttendance, fetchDeletedAttendanceRegistry, filterActiveAttendance } from '../../lib/deletedAttendanceManager'

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

  // Mode Tampilan: 'tabel' (Tabel Rinci) | 'kalender' (Kalender Bulanan) | 'matriks' (Matriks Dinas 1-31)
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

  // Helper fungsi foto & keterangan
  const isTugasLuar = (item) => {
    return Boolean(
      item?.keterangan?.includes('Tugas Luar') || 
      item?.keterangan?.includes('Pelatihan') ||
      item?.status === 'tugas_luar'
    )
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
        // Hadir normal maupun Tugas Luar dihitung HADIR
        totalHadir++
        if (tl) totalTugasLuar++
      }
    })

    // Hitung Hari Kerja Efektif bulan ini (exclude weekend)
    let hariEfektif = 0
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(yearNum, monthIndex, i)
      const day = d.getDay()
      const isWeekend = hariKerja === 5 ? (day === 0 || day === 6) : (day === 0)
      if (!isWeekend) hariEfektif++
    }

    const persentase = hariEfektif > 0 ? Math.min(100, Math.round((totalHadir / hariEfektif) * 100)) : 100

    return {
      totalHadir,
      totalIzinSakit: totalIzin + totalSakit,
      totalTugasLuar,
      hariEfektif,
      persentase
    }
  }, [filteredData, daysInMonth, yearNum, monthIndex, hariKerja])

  // Data Map Absensi per Pegawai & per Tanggal (untuk Matriks Dinas & Kalender)
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

  // Daftar Pegawai Aktif yang Tampil
  const activePegawaiList = useMemo(() => {
    if (mode === 'personal') {
      const found = pegawaiList.find(p => p.id === currentUser?.id)
      return found ? [found] : [{ id: currentUser?.id, full_name: currentUser?.email?.split('@')[0] || 'Saya' }]
    }
    if (selectedTeacherId) {
      return pegawaiList.filter(p => p.id === selectedTeacherId)
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      return pegawaiList.filter(p => (p.full_name || p.email || '').toLowerCase().includes(q))
    }
    return pegawaiList
  }, [mode, currentUser, selectedTeacherId, pegawaiList, searchTerm])

  // Helper Cetak PDF Matriks Dinas Resmi
  const handlePrintPdfMatriks = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      
      // Header Kop Dokumen
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text((schoolName || 'SEKOLAH').toUpperCase(), 148, 14, { align: 'center' })
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`REKAPITULASI DAFTAR HADIR BULANAN PEGAWAI - BULAN ${periodLabel.toUpperCase()}`, 148, 20, { align: 'center' })
      doc.setLineWidth(0.4)
      doc.line(14, 23, 283, 23)

      // Kolom Tabel: No, Nama, 1..daysInMonth, H, S, I, A, %
      const headers = ['No', 'Nama Pegawai']
      for (let i = 1; i <= daysInMonth; i++) {
        headers.push(String(i))
      }
      headers.push('H', 'S', 'I', 'A', '%')

      const tableRows = []
      activePegawaiList.forEach((p, idx) => {
        const row = [String(idx + 1), p.full_name || p.email?.split('@')[0]]
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
        const pct = kpiStats.hariEfektif > 0 ? `${Math.round((totalHadir / kpiStats.hariEfektif) * 100)}%` : '0%'
        row.push(String(countH), String(countS), String(countI), String(countA), pct)
        tableRows.push(row)
      })

      autoTable(doc, {
        head: [headers],
        body: tableRows,
        startY: 26,
        theme: 'grid',
        styles: { fontSize: 6.5, cellPadding: 1, halign: 'center' },
        columnStyles: {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 38, halign: 'left' }
        },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' }
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

      doc.save(`Rekap_Absensi_${currentMonthStr}.pdf`)
    } catch (e) {
      alert('Gagal mengekspor PDF: ' + e.message)
    }
  }

  // Helper Ekspor Excel Matriks Dinas Resmi
  const handleExportExcelMatriks = () => {
    try {
      const data = []
      data.push([(schoolName || 'SEKOLAH').toUpperCase()])
      data.push([`REKAP DAFTAR HADIR PEGAWAI - ${periodLabel.toUpperCase()}`])
      data.push([])

      const headers = ['No', 'Nama Pegawai', 'NIP', 'Jabatan']
      for (let i = 1; i <= daysInMonth; i++) {
        headers.push(String(i))
      }
      headers.push('Total H', 'Total S', 'Total I', 'Total A', '% Kehadiran')
      data.push(headers)

      activePegawaiList.forEach((p, idx) => {
        const row = [idx + 1, p.full_name || p.email?.split('@')[0], p.nip || '-', p.jabatan || p.role || 'Guru']
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
        const pct = kpiStats.hariEfektif > 0 ? `${Math.round((totalHadir / kpiStats.hariEfektif) * 100)}%` : '0%'
        row.push(countH, countS, countI, countA, pct)
        data.push(row)
      })

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, 'Rekap Dinas')
      XLSX.writeFile(wb, `Rekap_Presensi_Dinas_${currentMonthStr}.xlsx`)
    } catch (e) {
      alert('Gagal mengekspor Excel: ' + e.message)
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

      // Catat ke cloud registry & coba physical delete di Supabase
      await recordDeletedAttendance(supabase, [itemIdStr], {
        adminId: currentUser?.id,
        adminName: currentUser?.full_name || 'Admin',
        tanggal: item.tanggal,
        userId: item.user_id
      })

      // Update registry lokal agar seketika hilang dari tabel tanpa menunggu refresh
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

      // Catat ke cloud registry & coba physical delete di Supabase
      await recordDeletedAttendance(supabase, ids, {
        adminId: currentUser?.id,
        adminName: currentUser?.full_name || 'Admin',
        count: ids.length,
        period: periodLabel,
        deletedItems: filteredData.map(d => ({ id: d.id, userId: d.user_id, tanggal: d.tanggal }))
      })

      // Update registry lokal seketika agar langsung lenyap dari tabel
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
      {/* 1. HEADER KONTROL & VIEW SWITCHER (IDE 4) */}
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
                <option value="">Semua Pegawai ({pegawaiList.length})</option>
                {pegawaiList.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email?.split('@')[0]} ({p.jabatan || p.role || 'Guru'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'all' && !selectedTeacherId && (
            <div style={{ position: 'relative', minWidth: '160px', flex: 1 }}>
              <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Cari pegawai..."
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
          {/* View Switcher Pill Bar (3 Mode) */}
          <div style={{
            display: 'inline-flex',
            background: '#F1F5F9',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid #E2E8F0'
          }}>
            <button
              type="button"
              onClick={() => setViewMode('tabel')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.45rem 0.85rem',
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
              onClick={() => setViewMode('kalender')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.45rem 0.85rem',
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
                  padding: '0.45rem 0.85rem',
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

          {/* Tombol Ekspor Khusus Matriks atau Umum */}
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
                    const isLate = !tl && (
                      item.status === 'terlambat' || 
                      ((!item.status || item.status === 'hadir') && item.waktu_masuk && (() => {
                        try {
                          const d = new Date(item.waktu_masuk)
                          return (d.getHours() * 60 + d.getMinutes()) > (7 * 60 + 15)
                        } catch (e) {
                          return false
                        }
                      })())
                    )
                    const isHadir = !item.status || item.status === 'hadir' || isLate || tl

                    // Warna badge status: Tugas Luar statusnya tetap HADIR
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
                      badgeBg = '#FEF3C7'
                      badgeColor = '#B45309'
                      badgeBorder = '#FDE68A'
                    } else {
                      // Hadir biasa atau Tugas Luar -> Status tetap HADIR
                      statusLabel = 'HADIR'
                      badgeBg = '#ECFDF5'
                      badgeColor = '#059669'
                      badgeBorder = '#A7F3D0'
                    }

                    const inTime = item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'
                    const outTime = item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'
                    const duration = calculateDuration(item.waktu_masuk, item.waktu_pulang)

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
                            background: isLate ? '#FEF3C7' : '#ECFDF5', 
                            color: isLate ? '#B45309' : '#047857', 
                            padding: '3px 8px', 
                            borderRadius: '8px', 
                            fontSize: '0.8rem', 
                            fontWeight: 700, 
                            border: isLate ? '1px solid #FDE68A' : '1px solid #A7F3D0' 
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

                        {/* Kolom Keterangan: Bersih (-) jika Hadir normal tanpa TL & note, Teks + Tombol Foto jika Izin/Sakit/TL */}
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
      ) : viewMode === 'kalender' ? (
        /* ================= MODE 2: KALENDER BULANAN ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          padding: '1.5rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          {(() => {
            const activeUserId = selectedTeacherId || (mode === 'personal' ? currentUser?.id : (activePegawaiList[0]?.id || currentUser?.id))
            const activeTeacherObj = activePegawaiList.find(p => p.id === activeUserId) || activePegawaiList[0]

            return (
              <>
                {mode === 'all' && (
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
                    // Hari pertama bulan (0 = Minggu, konversi ke 0 = Senin)
                    const firstDayIndex = (new Date(yearNum, monthIndex, 1).getDay() + 6) % 7

                    // Kotak kosong awal bulan
                    for (let i = 0; i < firstDayIndex; i++) {
                      cells.push(<div key={`empty-${i}`} style={{ height: '78px', background: 'transparent' }} />)
                    }

                    // Kotak Tanggal 1 s.d. daysInMonth
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dateStr = `${currentMonthStr}-${String(d).padStart(2, '0')}`
                      const dateObj = new Date(yearNum, monthIndex, d)
                      const dayOfWeek = dateObj.getDay()
                      const isWeekend = hariKerja === 5 ? (dayOfWeek === 0 || dayOfWeek === 6) : (dayOfWeek === 0)
                      
                      // Cari data absensi tanggal ini
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
                    const isAttLate = !tl && (
                      att.status === 'terlambat' || 
                      ((!att.status || att.status === 'hadir') && att.waktu_masuk && (() => {
                        try {
                          const d = new Date(att.waktu_masuk)
                          return (d.getHours() * 60 + d.getMinutes()) > (7 * 60 + 15)
                        } catch (e) {
                          return false
                        }
                      })())
                    )
                    bgBox = isAttLate ? '#FEF3C7' : '#ECFDF5'
                    borderColor = isAttLate ? '#FDE68A' : '#A7F3D0'
                    badgeColor = isAttLate ? '#B45309' : '#059669'
                    if (tl) {
                      statusText = 'HADIR (TL)'
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
                      height: '78px',
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
                    return cells
                  })()}
                </div>
              </>
            )
          })()}
        </div>
      ) : (
        /* ================= MODE 3: MATRIKS DINAS 1-31 ================= */
        <div style={{
          background: 'var(--surface, #FFFFFF)',
          borderRadius: '20px',
          border: '1px solid var(--border, #E2E8F0)',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
        }}>
          <div style={{ overflowX: 'auto', maxHeight: '560px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1E293B', color: '#FFFFFF' }}>
                <tr>
                  <th style={{ padding: '0.75rem 0.5rem', width: '35px', borderRight: '1px solid #334155' }}>No</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '180px', borderRight: '1px solid #334155' }}>Nama Pegawai</th>
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
                            symbol = 'H'
                            cellBg = '#ECFDF5'
                            cellColor = '#059669'
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
                        {kpiStats.hariEfektif > 0 ? `${Math.round((countH / kpiStats.hariEfektif) * 100)}%` : '0%'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. MODAL DETAIL POPUP HARI (DARI KALENDER) */}
      {activeDayDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', maxWidth: '420px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E293B' }}>
                Detail Presensi: {new Date(activeDayDetail.dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h4>
              <button onClick={() => setActiveDayDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X size={18} />
              </button>
            </div>

            {activeDayDetail.att ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Status Kehadiran:</span>
                  <span style={{ 
                    fontWeight: 800, 
                    textTransform: 'uppercase', 
                    color: activeDayDetail.tl ? '#059669' : (
                      activeDayDetail.att.status === 'terlambat' ? '#D97706' : (
                        activeDayDetail.att.status === 'sakit' ? '#D97706' : (
                          activeDayDetail.att.status === 'izin' ? '#2563EB' : (
                            activeDayDetail.att.status === 'alpa' ? '#DC2626' : '#059669'
                          )
                        )
                      )
                    )
                  }}>
                    {activeDayDetail.tl ? 'HADIR (TUGAS LUAR)' : (activeDayDetail.att.status || 'HADIR')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Jam Masuk (IN):</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>
                    {activeDayDetail.att.waktu_masuk ? new Date(activeDayDetail.att.waktu_masuk).toLocaleTimeString('id-ID') : '-'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Jam Pulang (OUT):</span>
                  <span style={{ fontWeight: 700, color: '#D97706' }}>
                    {activeDayDetail.att.waktu_pulang ? new Date(activeDayDetail.att.waktu_pulang).toLocaleTimeString('id-ID') : '-'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Durasi Kerja:</span>
                  <span style={{ fontWeight: 700, color: '#1E293B' }}>
                    {calculateDuration(activeDayDetail.att.waktu_masuk, activeDayDetail.att.waktu_pulang)}
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
            ) : (
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
