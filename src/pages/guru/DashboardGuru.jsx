import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Clock, CheckCircle, CheckCircle2, Users, UserCircle, Calendar, Fingerprint, Check, WifiOff, RefreshCw, Bell, Trash2, Camera, History, Download, FileSpreadsheet, FileText, Sun, Moon, MapPin, BookOpen, Layers, ArrowLeft, Award, ChevronRight, Briefcase, Upload, Image as ImageIcon, X, Sparkles, Key, Eye, EyeOff, Loader2, AlertCircle, Save } from 'lucide-react'
import CameraTimemarkModal from '../../components/CameraTimemarkModal'
import InputPresensiMurid from '../../components/kbm/InputPresensiMurid'
import InputJurnalMengajar from '../../components/kbm/InputJurnalMengajar'
import InputNilaiSiswa from '../../components/kbm/InputNilaiSiswa'
import RekapDanLaporan from '../../components/kbm/RekapDanLaporan'
import MasterSiswaDanKelas from '../../components/kbm/MasterSiswaDanKelas'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getCustomSubjects, syncCloudSubjects } from '../../lib/subjectsManager'
import { getSavedGeminiKey, saveGeminiKey, testGeminiConnection } from '../../lib/gemini'
import { Preferences } from '@capacitor/preferences'

const getLocalPref = async (key, fallback = null) => {
  try {
    const { value } = await Preferences.get({ key })
    if (value !== null && value !== undefined) return value
  } catch {}
  try {
    const val = localStorage.getItem(key)
    if (val !== null && val !== undefined) return val
  } catch {}
  return fallback
}

const setLocalPref = async (key, value) => {
  const strVal = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    await Preferences.set({ key, value: strVal })
  } catch {}
  try {
    localStorage.setItem(key, strVal)
  } catch {}
}

export default function DashboardGuru() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  // State Gemini AI Key
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiTesting, setGeminiTesting] = useState(false)
  const [geminiTestStatus, setGeminiTestStatus] = useState(null)
  const [geminiSavedMessage, setGeminiSavedMessage] = useState(null)
  const [activeTab, setActiveTab] = useState('absensi') 
  const [kbmSubTab, setKbmSubTab] = useState('menu') // 'menu' | 'presensi_siswa' | 'jurnal' | 'nilai' | 'rekap' | 'master_siswa'
  const [classesList, setClassesList] = useState([])
  const [assignedClasses, setAssignedClasses] = useState([])
  const [guruTipeState, setGuruTipeState] = useState('guru_kelas')
  const [guruMapelState, setGuruMapelState] = useState('')
  const [showAssignmentReminder, setShowAssignmentReminder] = useState(false)
  const [schoolInfoData, setSchoolInfoData] = useState({
    schoolName: 'Presensia',
    principalName: '',
    principalNIP: '',
    kkm: 75,
    appMode: 'SD'
  })
  const [hasCheckedIn, setHasCheckedIn] = useState(false)
  const [todayAbsensi, setTodayAbsensi] = useState(null)
  const [izinMode, setIzinMode] = useState(null) // 'sakit' or 'izin'
  const [keterangan, setKeterangan] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // State Tugas Luar / Pelatihan
  const [showTugasLuarModal, setShowTugasLuarModal] = useState(false)
  const [tugasLuarCatatan, setTugasLuarCatatan] = useState('')
  const [tugasLuarFoto, setTugasLuarFoto] = useState(null)
  const [cameraModeForTugasLuar, setCameraModeForTugasLuar] = useState(false)
  
  // Offline State
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  
  const [todayStatus, setTodayStatus] = useState(null)
  const [pengumumanData, setPengumumanData] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  
  const [isHoliday, setIsHoliday] = useState(false)
  const [holidayReason, setHolidayReason] = useState('')
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [schoolName, setSchoolName] = useState('Presensia')
  const [schoolLogo, setSchoolLogo] = useState('')
  const [historyList, setHistoryList] = useState([])
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7))
  const [historyLoading, setHistoryLoading] = useState(false)
  
  // Geofencing settings from DB
  const [geofenceSettings, setGeofenceSettings] = useState({
    enabled: false,
    lat: -5.147665,
    lng: 119.432732,
    radius: 100
  })

  // Theme mode
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme_mode') === 'dark')

  const navigate = useNavigate()

  // Helper untuk mengecek apakah penugasan guru sudah lengkap
  const checkAssignmentConfigured = () => {
    if (!user) return true
    const tipe = localStorage.getItem(`guru_tipe_${user.id}`) || profile?.penugasan_tipe || (profile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
    const mapel = profile?.mata_pelajaran || localStorage.getItem(`guru_mapel_${user.id}`) || ''
    const assigned = assignedClasses.length > 0 
      ? assignedClasses 
      : JSON.parse(localStorage.getItem(`guru_assigned_classes_${user.id}`) || '[]')
    
    if (tipe === 'guru_mapel') {
      return Boolean(mapel) && assigned.length > 0
    }
    return assigned.length > 0
  }

  // Filter daftar kelas yang diampu oleh guru ini
  const userAssignedIds = assignedClasses.length > 0 
    ? assignedClasses 
    : JSON.parse(localStorage.getItem(`guru_assigned_classes_${user?.id}`) || '[]')
  
  const filteredClassesList = userAssignedIds.length > 0
    ? classesList.filter(c => userAssignedIds.includes(c.id))
    : classesList

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme_mode', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('theme_mode', 'light')
    }
  }, [darkMode])

  const toggleTheme = () => {
    setDarkMode(!darkMode)
  }

  useEffect(() => {
    if (activeTab === 'pengumuman' && unreadCount > 0 && user) {
       const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
       const allIds = pengumumanData.map(p => p.id)
       localData.read = [...new Set([...localData.read, ...allIds])]
       localStorage.setItem(`pengumuman_meta_${user.id}`, JSON.stringify(localData))
       setUnreadCount(0)
    }
  }, [activeTab, pengumumanData, unreadCount, user])

  const handleDeletePengumuman = (id) => {
     if (!user) return
     const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
     localData.deleted.push(id)
     localStorage.setItem(`pengumuman_meta_${user.id}`, JSON.stringify(localData))
     setPengumumanData(pengumumanData.filter(p => p.id !== id))
  }

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 11) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }

  const [popup, setPopup] = useState({ show: false, title: '', message: '', type: 'success' })

  useEffect(() => {
    // Check auto logout (1 pekan = 7 hari * 24 jam * 60 menit * 60 detik * 1000 ms)
    const lastActive = localStorage.getItem('lastActive_guru')
    const now = Date.now()
    if (lastActive && now - parseInt(lastActive) > 7 * 24 * 60 * 60 * 1000) {
       localStorage.removeItem('lastActive_guru')
       supabase.auth.signOut().then(() => navigate('/'))
       return
    }
    localStorage.setItem('lastActive_guru', now.toString())

    fetchUser()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    
    // Offline Listeners
    const handleOnline = () => { setIsOffline(false); syncOfflineData(); }
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Initial check for unsynced
    checkUnsynced()

    // Interval 10 Menit (600,000 ms) pengingat penugasan belum diatur
    const reminderTimer = setInterval(() => {
      const stored = localStorage.getItem('lastActive_guru')
      if (stored && user?.id) {
        // Evaluasi apakah penugasan sudah diset
        const savedClasses = JSON.parse(localStorage.getItem(`guru_assigned_classes_${user?.id}`) || '[]')
        const tipe = localStorage.getItem(`guru_tipe_${user.id}`) || profile?.penugasan_tipe || (profile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
        const mapel = profile?.mata_pelajaran || localStorage.getItem(`guru_mapel_${user?.id}`) || ''
        const configured = tipe === 'guru_mapel' 
          ? (Boolean(mapel) && savedClasses.length > 0)
          : (savedClasses.length > 0)

        if (!configured) {
          setShowAssignmentReminder(true)
        }
      }
    }, 10 * 60 * 1000)

    return () => {
      clearInterval(timer)
      clearInterval(reminderTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const checkUnsynced = () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    setUnsyncedCount(offlineData.length)
  }

  const syncOfflineData = async () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    if (offlineData.length === 0) return

    setLoading(true)
    let syncSuccessCount = 0
    
    for (const record of offlineData) {
      if (record.jenis === 'masuk') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: 'hadir' })
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'pulang') {
        const { error } = await supabase.from('absensi').update({ waktu_pulang: record.waktu, lokasi_pulang: record.loc }).eq('user_id', record.user_id).eq('tanggal', record.tanggal)
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'sakit' || record.jenis === 'izin') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: record.jenis, keterangan: record.keterangan })
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'tugas_luar') {
        const { error } = await supabase.from('absensi').insert({
          user_id: record.user_id,
          waktu_masuk: record.waktu_masuk,
          waktu_pulang: record.waktu_pulang,
          tanggal: record.tanggal,
          lokasi_masuk: record.loc,
          lokasi_pulang: record.loc,
          status: 'hadir',
          keterangan: record.keterangan
        })
        if (!error) syncSuccessCount++
      }
    }
    
    localStorage.removeItem('offlineAbsensi')
    setUnsyncedCount(0)
    setLoading(false)
    if (syncSuccessCount > 0) {
      showPopup("Sinkronisasi Selesai", `${syncSuccessCount} data luring telah disinkronkan ke server.`, "success")
      fetchUser() // Refresh UI
    }
  }

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')
      setUser(user)
      setGeminiApiKey(getSavedGeminiKey(user.id))

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (profile) setProfile(profile)
      
      const { data: cls } = await supabase.from('classes').select('*').order('name', { ascending: true })
      if (cls) setClassesList(cls)

      // Sinkronisasi daftar mata pelajaran terbaru dari cloud database
      await syncCloudSubjects(supabase)

      // Ambil data penugasan kelas guru dari penyimpanan permanen
      let storedAssigned = []
      try {
        const rawAssigned = await getLocalPref(`guru_assigned_classes_${user.id}`, null)
        if (rawAssigned) {
          storedAssigned = typeof rawAssigned === 'string' ? JSON.parse(rawAssigned) : rawAssigned
        }
      } catch (err) {
        console.error('Error parsing assigned classes:', err)
      }
      setAssignedClasses(storedAssigned)

      // Cek apakah penugasan sudah diatur
      const userTipe = await getLocalPref(`guru_tipe_${user.id}`, profile?.penugasan_tipe || (profile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas'))
      setGuruTipeState(userTipe)

      const userMapel = profile?.mata_pelajaran || await getLocalPref(`guru_mapel_${user.id}`, '')
      setGuruMapelState(userMapel)

      const isConfigured = userTipe === 'guru_mapel' 
        ? (Boolean(userMapel) && storedAssigned.length > 0)
        : (storedAssigned.length > 0)

      if (!isConfigured) {
        setShowAssignmentReminder(true)
      } else {
        setShowAssignmentReminder(false)
      }

      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      const hariKerja = settings?.hari_kerja || 5
      if (settings?.nama_sekolah) {
        setSchoolName(settings.nama_sekolah)
        setSchoolInfoData(prev => ({ ...prev, schoolName: settings.nama_sekolah }))
      }
      if (settings?.logo_sekolah) {
        setSchoolLogo(settings.logo_sekolah)
      }
      if (settings) {
        setGeofenceSettings({
          enabled: settings.geofence_enabled || false,
          lat: settings.school_lat || -5.147665,
          lng: settings.school_lng || 119.432732,
          radius: settings.school_radius || 100
        })
      }
      
      const dayOfWeek = new Date().getDay()
      let holiday = false
      let reason = ''
      
      if (hariKerja === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) {
         holiday = true
         reason = 'Libur Akhir Pekan (Sabtu / Minggu)'
      } else if (hariKerja === 6 && dayOfWeek === 0) {
         holiday = true
         reason = 'Libur Akhir Pekan (Minggu)'
      }
      
      const today = getLocalDateString()

      if (!holiday) {
         const { data: libur } = await supabase.from('hari_libur').select('*').eq('tanggal', today).maybeSingle()
         if (libur) {
            holiday = true
            reason = libur.keterangan
         }
      }
      
      setIsHoliday(holiday)
      setHolidayReason(reason)

      const { data: absensiList } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).order('waktu_masuk', { ascending: false }).limit(1)
        
      const absensi = absensiList && absensiList.length > 0 ? absensiList[0] : null;

      if (absensi && absensi.waktu_masuk) {
        setHasCheckedIn(true)
        setTodayStatus(absensi.status)
        setTodayAbsensi(absensi)
      } else {
        // Also check if there's offline check-in for today
        const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
        const offlineToday = offlineData.find(d => d.tanggal === today && (d.jenis === 'masuk' || d.jenis === 'sakit' || d.jenis === 'izin' || d.jenis === 'tugas_luar'))
        if (offlineToday) {
           setHasCheckedIn(true)
           setTodayStatus(offlineToday.jenis === 'masuk' || offlineToday.jenis === 'tugas_luar' ? 'hadir' : offlineToday.jenis)
           setTodayAbsensi(offlineToday)
        } else {
           setHasCheckedIn(false)
           setTodayStatus(null)
           setTodayAbsensi(null)
        }
      }

      // Fetch Pengumuman
      const { data: pData } = await supabase.from('pengumuman')
         .select('*')
         .or(`target_type.eq.all,target_users.ilike.%${user.id}%`)
         .order('created_at', { ascending: false })
         .limit(20)
         
      if (pData) {
         const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
         const activePengumuman = pData.filter(p => !localData.deleted.includes(p.id))
         setPengumumanData(activePengumuman)
         
         const unread = activePengumuman.filter(p => !localData.read.includes(p.id)).length
         setUnreadCount(unread)

         // Trigger push notification for new announcement if granted
         if (unread > 0 && 'Notification' in window && Notification.permission === 'granted') {
           const latestMsg = activePengumuman[0]?.pesan || 'Anda memiliki pengumuman baru.'
           try {
             new Notification('Presensia - Pengumuman Sekolah', {
               body: latestMsg,
               icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png'
             })
           } catch (e) {
             console.log(e)
           }
         }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        showPopup('Notifikasi Aktif', 'Izin notifikasi push berhasil diaktifkan.', 'success')
      } else {
        showPopup('Notifikasi Ditolak', 'Izin notifikasi tidak diberikan oleh browser.', 'error')
      }
    } else {
      showPopup('Tidak Didukung', 'Browser ini tidak mendukung notifikasi Web.', 'error')
    }
  }

  const loadHistory = async (targetMonth = historyMonth) => {
    if (!user) return
    setHistoryLoading(true)
    try {
      const [year, month] = targetMonth.split('-')
      const firstDay = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
      const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')

      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', user.id)
        .gte('tanggal', firstDay)
        .lte('tanggal', lastDay)
        .order('tanggal', { ascending: false })

      if (!error && data) {
        setHistoryList(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const downloadHistoryExcel = async () => {
    if (historyList.length === 0) {
      alert('Tidak ada riwayat absensi di bulan ini.')
      return
    }

    const [year, month] = historyMonth.split('-')
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Riwayat Presensi')

    // Header Judul Laporan
    worksheet.mergeCells('A1:F1')
    worksheet.getCell('A1').value = 'REKAPITULASI KEHADIRAN GURU'
    worksheet.getCell('A1').font = { bold: true, size: 14 }
    worksheet.getCell('A1').alignment = { horizontal: 'center' }

    worksheet.mergeCells('A2:F2')
    worksheet.getCell('A2').value = schoolName.toUpperCase()
    worksheet.getCell('A2').font = { bold: true, size: 12 }
    worksheet.getCell('A2').alignment = { horizontal: 'center' }

    worksheet.mergeCells('A3:F3')
    worksheet.getCell('A3').value = `Nama: ${profile?.full_name || 'Guru'} ${profile?.nip ? ' | NIP: ' + profile.nip : ''}`
    worksheet.getCell('A3').font = { size: 11 }
    worksheet.getCell('A3').alignment = { horizontal: 'left' }

    worksheet.mergeCells('A4:F4')
    worksheet.getCell('A4').value = `Periode Bulan: ${monthLabel}`
    worksheet.getCell('A4').font = { size: 11, bold: true }
    worksheet.getCell('A4').alignment = { horizontal: 'left' }

    // Table Headers
    const headers = ['No', 'Tanggal', 'Status', 'Jam Masuk', 'Jam Pulang', 'Keterangan']
    const headerRow = worksheet.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    })

    worksheet.getColumn(1).width = 6
    worksheet.getColumn(2).width = 24
    worksheet.getColumn(3).width = 14
    worksheet.getColumn(4).width = 14
    worksheet.getColumn(5).width = 14
    worksheet.getColumn(6).width = 30

    historyList.forEach((item, index) => {
      const tgl = new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const status = (item.status || 'Hadir').toUpperCase()
      const masuk = item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const pulang = item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const ket = item.keterangan || '-'

      const row = worksheet.addRow([index + 1, tgl, status, masuk, pulang, ket])
      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 || colNumber === 6 ? 'left' : 'center' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

        if (colNumber === 3) {
          if (status === 'HADIR') {
            cell.font = { color: { argb: 'FF059669' }, bold: true }
          } else if (status === 'IZIN') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
            cell.font = { color: { argb: 'FFD97706' }, bold: true }
          } else if (status === 'SAKIT') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
            cell.font = { color: { argb: 'FFDC2626' }, bold: true }
          }
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const sanitizedName = (profile?.full_name || 'Guru').replace(/\s+/g, '_')
    saveAs(new Blob([buffer]), `Riwayat_Presensi_${sanitizedName}_${historyMonth}.xlsx`)
  }

  const downloadHistoryPDF = () => {
    if (historyList.length === 0) {
      alert('Tidak ada riwayat absensi di bulan ini.')
      return
    }

    const [year, month] = historyMonth.split('-')
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`

    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' })
    const docWidth = doc.internal.pageSize.getWidth()

    // Header PDF
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('REKAPITULASI KEHADIRAN GURU', docWidth / 2, 16, { align: 'center' })
    doc.setFontSize(12)
    doc.text(schoolName.toUpperCase(), docWidth / 2, 23, { align: 'center' })

    doc.setLineWidth(0.5)
    doc.line(14, 27, docWidth - 14, 27)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Nama Pegawai : ${profile?.full_name || 'Guru'}`, 14, 34)
    if (profile?.nip) {
      doc.text(`NIP                 : ${profile.nip}`, 14, 40)
    }
    doc.text(`Bulan              : ${monthLabel}`, 14, profile?.nip ? 46 : 40)

    const tableStartY = profile?.nip ? 52 : 46

    const head = [['No', 'Tanggal', 'Status', 'Masuk', 'Pulang', 'Keterangan']]
    const body = historyList.map((item, idx) => {
      const tgl = new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
      const status = (item.status || 'Hadir').toUpperCase()
      const masuk = item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const pulang = item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const ket = item.keterangan || '-'
      return [idx + 1, tgl, status, masuk, pulang, ket]
    })

    autoTable(doc, {
      startY: tableStartY,
      head: head,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 2,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        halign: 'center',
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 35 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'left' }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 2) {
          const val = data.cell.raw
          if (val === 'HADIR') {
            data.cell.styles.textColor = [5, 150, 105]
            data.cell.styles.fontStyle = 'bold'
          } else if (val === 'IZIN') {
            data.cell.styles.fillColor = [254, 243, 199]
            data.cell.styles.textColor = [217, 119, 6]
            data.cell.styles.fontStyle = 'bold'
          } else if (val === 'SAKIT') {
            data.cell.styles.fillColor = [254, 226, 226]
            data.cell.styles.textColor = [220, 38, 38]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    })

    const sanitizedName = (profile?.full_name || 'Guru').replace(/\s+/g, '_')
    doc.save(`Riwayat_Presensi_${sanitizedName}_${historyMonth}.pdf`)
  }

  const showPopup = (title, message, type = 'success') => {
    setPopup({ show: true, title, message, type })
    setTimeout(() => {
      setPopup({ show: false, title: '', message: '', type: 'success' })
    }, 3000)
  }

  const saveOffline = (jenis, loc, now, today, ket = '') => {
    const record = { user_id: user.id, jenis, loc, waktu: now, tanggal: today, keterangan: ket }
    const current = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    current.push(record)
    localStorage.setItem('offlineAbsensi', JSON.stringify(current))
    checkUnsynced()
    
    if (jenis !== 'pulang') {
       setHasCheckedIn(true)
       setIzinMode(null)
    }
    showPopup("Tersimpan Luring (Offline)", "Data disimpan sementara. Akan dikirim otomatis saat internet tersambung.", "success")
    setLoading(false)
  }

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3 // metres
    const φ1 = (lat1 * Math.PI) / 180
    const φ2 = (lat2 * Math.PI) / 180
    const Δφ = ((lat2 - lat1) * Math.PI) / 180
    const Δλ = ((lon2 - lon1) * Math.PI) / 180

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return Math.round(R * c) // distance in meters
  }

  const handleAbsen = async (jenis) => {
    setLoading(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const userLat = position.coords.latitude
        const userLng = position.coords.longitude
        const loc = `${userLat}, ${userLng}`
        const today = getLocalDateString()
        const now = new Date().toISOString()

        // Geofencing Validation (khusus absen masuk & pulang)
        if (geofenceSettings.enabled && (jenis === 'masuk' || jenis === 'pulang')) {
          const distance = calculateDistance(
            userLat,
            userLng,
            geofenceSettings.lat,
            geofenceSettings.lng
          )

          if (distance > geofenceSettings.radius) {
            showPopup(
              "Di Luar Radius Sekolah",
              `Anda berada ${distance}m dari sekolah (maksimal ${geofenceSettings.radius}m). Mohon mendekat ke area sekolah.`,
              "error"
            )
            setLoading(false)
            return
          }
        }
        
        if (isOffline) {
           saveOffline(jenis, loc, now, today, keterangan)
           return
        }

        try {
          if (jenis === 'masuk') {
            const { data: insData, error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' }).select().maybeSingle()
            if (error) throw error
            setHasCheckedIn(true)
            setTodayStatus('hadir')
            setTodayAbsensi(insData || { user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
            showPopup("Absen Berhasil!", "Data jam masuk Anda telah tersimpan ke sistem.", "success")
          } else if (jenis === 'pulang') {
            const { data: updData, error } = await supabase.from('absensi').update({ waktu_pulang: now, lokasi_pulang: loc }).eq('user_id', user.id).eq('tanggal', today).select().maybeSingle()
            if (error) throw error
            setTodayAbsensi(prev => ({ ...prev, waktu_pulang: now, lokasi_pulang: loc }))
            showPopup("Pulang Tercatat!", "Terima kasih atas kerja keras Anda hari ini.", "success")
          } else if (jenis === 'sakit' || jenis === 'izin') {
            const { data: izinData, error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan }).select().maybeSingle()
            if (error) throw error
            setHasCheckedIn(true)
            setTodayStatus(jenis)
            setTodayAbsensi(izinData || { user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan })
            setIzinMode(null)
            showPopup("Data Terkirim!", `Keterangan ${jenis} Anda telah dilaporkan.`, "success")
          }
        } catch (error) {
          // Fallback to offline if supabase fails
          saveOffline(jenis, loc, now, today, keterangan)
        }
        setLoading(false)
      }, () => {
        showPopup("Akses Lokasi Ditolak", "Mohon izinkan akses GPS.", "error")
        setLoading(false)
      }, { timeout: 10000 })
    } else {
      showPopup("GPS Tidak Didukung", "Browser Anda tidak mendukung lokasi.", "error")
      setLoading(false)
    }
  }

  const convertToWebP = (imageSrc, quality = 0.75, maxWidth = 1024) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const webpDataUrl = canvas.toDataURL('image/webp', quality)
        resolve(webpDataUrl)
      }
      img.onerror = () => resolve(imageSrc)
      img.src = imageSrc
    })
  }

  const getStoredPhotoForToday = () => {
    if (tugasLuarFoto) return tugasLuarFoto
    const today = getLocalDateString()
    return localStorage.getItem(`tugas_luar_foto_${today}_${user?.id}`) || null
  }

  const handleTugasLuarSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!tugasLuarCatatan.trim()) {
      showPopup("Catatan Wajib Diisi", "Mohon isi nama pelatihan atau rincian tugas luar.", "error")
      return
    }

    setLoading(true)
    const today = getLocalDateString()
    const [year, month, day] = today.split('-').map(Number)

    // Jam masuk otomatis 07.00, jam pulang otomatis 14.00 waktu lokal
    const jamMasukDate = new Date(year, month - 1, day, 7, 0, 0)
    const jamPulangDate = new Date(year, month - 1, day, 14, 0, 0)
    const waktuMasuk = jamMasukDate.toISOString()
    const waktuPulang = jamPulangDate.toISOString()

    // Ambil koordinat GPS perangkat saat ini jika tersedia (tanpa geofence constraint)
    const getCoordinates = () => new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(`${pos.coords.latitude}, ${pos.coords.longitude}`),
          () => resolve('Lokasi Tugas Luar'),
          { timeout: 7000 }
        )
      } else {
        resolve('Lokasi Tugas Luar')
      }
    })

    const loc = await getCoordinates()
    const finalCatatan = `[Tugas Luar/Pelatihan] ${tugasLuarCatatan.trim()}`

    // Pastikan foto terkonversi ke WebP ringan
    let webpPhoto = tugasLuarFoto
    if (tugasLuarFoto) {
      try {
        webpPhoto = await convertToWebP(tugasLuarFoto, 0.75, 1024)
      } catch (err) {
        console.warn("Convert webp error:", err)
      }
    }

    // Simpan foto dokumentasi WebP ke localStorage agar selalu dapat ditampilkan di kartu absensi
    if (webpPhoto) {
      try {
        localStorage.setItem(`tugas_luar_foto_${today}_${user.id}`, webpPhoto)
      } catch (err) {
        console.warn("Storage quota exceeded for local preview photo:", err)
      }
    }

    // Unggah foto ke storage dalam format WebP yang sangat ringan (30-60 KB)
    let uploadedPhotoUrl = null
    if (webpPhoto && !isOffline) {
      try {
        const res = await fetch(webpPhoto)
        const blob = await res.blob()
        const fileName = `tugas_luar-${user.id}-${Date.now()}.webp`
        const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: 'image/webp' })
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
          uploadedPhotoUrl = publicUrl
        }
      } catch (e) {
        console.warn("Upload storage tugas luar:", e)
      }
    }

    // Jika upload storage sukses, simpan URL. Jika storage dibatasi RLS, simpan data WebP ringkas di keterangan
    const keteranganLengkap = uploadedPhotoUrl 
      ? `${finalCatatan} | Foto: ${uploadedPhotoUrl}` 
      : (webpPhoto ? `${finalCatatan} [FOTO_WEBP:${webpPhoto}]` : finalCatatan)

    if (isOffline) {
      const record = {
        user_id: user.id,
        jenis: 'tugas_luar',
        loc,
        waktu_masuk: waktuMasuk,
        waktu_pulang: waktuPulang,
        waktu: waktuMasuk,
        tanggal: today,
        keterangan: keteranganLengkap
      }
      const current = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
      current.push(record)
      localStorage.setItem('offlineAbsensi', JSON.stringify(current))
      checkUnsynced()
      setHasCheckedIn(true)
      setTodayStatus('hadir')
      setTodayAbsensi({
        user_id: user.id,
        waktu_masuk: waktuMasuk,
        waktu_pulang: waktuPulang,
        tanggal: today,
        lokasi_masuk: loc,
        lokasi_pulang: loc,
        status: 'hadir',
        keterangan: keteranganLengkap
      })
      setShowTugasLuarModal(false)
      showPopup("Tersimpan Luring (Offline)", "Presensi Tugas Luar disimpan. Otomatis Hadir (07:00 - 14:00).", "success")
      setLoading(false)
      return
    }

    try {
      const payload = {
        user_id: user.id,
        waktu_masuk: waktuMasuk,
        waktu_pulang: waktuPulang,
        tanggal: today,
        lokasi_masuk: loc,
        lokasi_pulang: loc,
        status: 'hadir',
        keterangan: keteranganLengkap
      }

      const { data: existing } = await supabase.from('absensi').select('id').eq('user_id', user.id).eq('tanggal', today).maybeSingle()
      let dbError = null
      let inserted = null

      if (existing) {
        const { data: upd, error } = await supabase.from('absensi').update(payload).eq('id', existing.id).select().maybeSingle()
        dbError = error
        inserted = upd
      } else {
        const { data: ins, error } = await supabase.from('absensi').insert(payload).select().maybeSingle()
        dbError = error
        inserted = ins
      }

      if (dbError) throw dbError

      setHasCheckedIn(true)
      setTodayStatus('hadir')
      setTodayAbsensi(inserted || payload)
      setShowTugasLuarModal(false)
      showPopup("Presensi Berhasil!", "Presensi Tugas Luar tersimpan. Anda otomatis tercatat HADIR (07:00 - 14:00).", "success")
      loadHistory()
    } catch (err) {
      console.error("Gagal simpan tugas luar:", err)
      showPopup("Gagal Presensi", err.message || "Gagal menyimpan ke server.", "error")
    } finally {
      setLoading(false)
    }
  }

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_SIZE = 600;
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width; width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height; height = MAX_SIZE;
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  }

  const uploadFoto = async (event) => {
    try {
      if (isOffline) {
         showPopup("Tidak Ada Internet", "Anda harus online untuk mengubah foto profil.", "error")
         return
      }
      setLoading(true)
      const file = event.target.files[0]
      if(!file) return
      const compressedFile = await compressImage(file)
      const fileName = `${user.id}-${Math.random()}.webp`
      
      let { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile, { contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: profileError } = await supabase.from('profiles').update({ foto_profil: publicUrl }).eq('id', user.id)
      if (profileError) throw profileError
      
      setProfile({ ...profile, foto_profil: publicUrl })
      showPopup("Tersimpan!", "Foto profil berhasil diperbarui.", "success")
    } catch (error) {
      showPopup("Gagal", error.message, "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="guru-container" style={{ paddingBottom: '90px' }}>

      {/* Custom Popup Modal */}
      {popup.show && (
        <div className="popup-overlay">
          <div className="popup-content">
             <div style={{ margin: '0 auto 1rem auto', width: '64px', height: '64px', background: popup.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: popup.type === 'success' ? '#059669' : '#DC2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={32} strokeWidth={3} />
             </div>
             <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{popup.title}</h2>
             <p className="text-muted" style={{ fontSize: '0.95rem' }}>{popup.message}</p>
          </div>
        </div>
      )}

      {/* Modal Pengingat Penugasan & Kelas (Muncul Setiap Login & Tiap 10 Menit Jika Belum Diatur) */}
      {showAssignmentReminder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '420px',
              width: '100%',
              background: 'white',
              borderRadius: '24px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              textAlign: 'center',
              border: '1px solid #E2E8F0'
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem auto'
              }}
            >
              <Briefcase size={32} />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1E293B', margin: '0 0 0.5rem 0' }}>
              Atur Penugasan & Kelas Anda
            </h3>

            <p style={{ fontSize: '0.875rem', color: '#64748B', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
              Anda belum mengatur <strong>penugasan kelas / mata pelajaran</strong> yang diampu. Menu Pembelajaran (KBM) tidak dapat diakses hingga penugasan selesai diatur di menu Profil.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setShowAssignmentReminder(false);
                  setActiveTab('pengaturan');
                }}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '14px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>Atur Penugasan Sekarang</span>
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => setShowAssignmentReminder(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                Ingatkan Saya 10 Menit Lagi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header ID Card (Compact & Space-Saving) */}
      <div className="card-gradient" style={{ padding: '1.15rem 1.25rem 0.85rem 1.25rem', borderRadius: '0 0 20px 20px', marginBottom: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.18)', padding: '0.2rem 0.65rem', borderRadius: '9999px', backdropFilter: 'blur(8px)' }}>
          <img src={schoolLogo || "/panrita_logo.webp"} alt="Logo" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'white', letterSpacing: '0.2px' }}>{schoolLogo ? schoolName : 'PanritaEdu'}</span>
        </div>
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex items-center gap-3">
            {profile?.foto_profil ? (
              <img src={profile.foto_profil} alt="Profil" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)', background: 'white', flexShrink: 0 }} />
            ) : (
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserCircle size={28} color="var(--primary)" />
              </div>
            )}
            <div>
              <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.75rem', marginBottom: '0px', lineHeight: 1.2 }}>{getGreeting()},</p>
              <h2 style={{ fontSize: '1.05rem', margin: '2px 0 0 0', fontWeight: '700', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', lineHeight: 1.2 }}>
                {profile?.full_name || user?.email?.split('@')[0]}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              title={darkMode ? "Mode Terang" : "Mode Gelap"}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {darkMode ? <Sun size={17} color="#FBBF24" /> : <Moon size={17} color="#E0E7FF" />}
            </button>
            <button
              onClick={() => setShowCameraModal(true)}
              title="Kamera Timemark"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Camera size={17} />
            </button>
            <button
              onClick={() => setActiveTab('pengumuman')}
              title="Pengumuman"
              style={{
                background: activeTab === 'pengumuman' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <Bell size={17} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '-2px', right: '-2px', background: '#EF4444', width: '8px', height: '8px', borderRadius: '50%' }}></span>}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.15)', padding: '0.45rem 0.85rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-2">
            <Clock size={16} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.5px' }}>
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.92)' }}>
            {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        
        {/* Offline & Sync Indicators */}
        {isOffline && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#DC2626', fontSize: '0.85rem' }}>
             <WifiOff size={16} /> Mode Luring (Offline) Aktif
          </div>
        )}
        {!isOffline && unsyncedCount > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', color: '#D97706', fontSize: '0.85rem' }}>
             <span>Ada {unsyncedCount} data absen tertunda.</span>
             <button onClick={syncOfflineData} style={{ background: 'transparent', border: 'none', color: '#D97706', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold' }} disabled={loading}>
                <RefreshCw size={14} className={loading ? "spin" : ""} /> Sync
             </button>
          </div>
        )}

        {activeTab === 'absensi' && (
          <div className="text-center">
            {!isHoliday && <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Sentuh tombol di bawah untuk absensi</p>}

            {isHoliday ? (
              <div className="card" style={{ padding: '2rem', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', marginTop: '1rem' }}>
                <Calendar size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Hari Libur</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>{holidayReason}</p>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.85rem' }}>Anda tidak perlu melakukan presensi hari ini. Selamat beristirahat!</p>
              </div>
            ) : !hasCheckedIn ? (
              <>
                <button className="btn-clock" onClick={() => handleAbsen('masuk')} disabled={loading} style={{ marginBottom: '1.5rem' }}>
                  <Fingerprint size={48} strokeWidth={1.5} />
                  <span>Clock In</span>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: '0.65rem', justifyContent: 'center', marginTop: '1rem', maxWidth: '380px', margin: '1rem auto 0 auto' }}>
                  <button onClick={() => { setIzinMode('sakit'); setShowTugasLuarModal(false); }} className="btn" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem' }}>Sakit</button>
                  <button onClick={() => { setIzinMode('izin'); setShowTugasLuarModal(false); }} className="btn" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem' }}>Izin</button>
                  <button onClick={() => { setShowTugasLuarModal(true); setIzinMode(null); }} className="btn" style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #93C5FD', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <Briefcase size={15} /> Tugas Luar
                  </button>
                </div>
              </>
            ) : (todayStatus === 'sakit' || todayStatus === 'izin') ? (
              <div className="card" style={{ padding: '2rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>
                <CheckCircle size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Anda Terdaftar {todayStatus.toUpperCase()}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Semoga lekas membaik dan hari Anda menyenangkan. Anda tidak perlu Clock Out hari ini.</p>
              </div>
            ) : todayAbsensi?.waktu_pulang ? (
              <div className="card" style={{ padding: '1.5rem', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', textAlign: 'center' }}>
                <CheckCircle size={44} style={{ margin: '0 auto 0.75rem auto', color: '#16A34A' }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.35rem', fontWeight: 'bold' }}>
                  {todayAbsensi.keterangan?.includes('Tugas Luar') ? 'Presensi Tugas Luar Selesai' : 'Presensi Hari Ini Selesai'}
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#15803D' }}>
                  Anda terdaftar <strong>HADIR</strong> untuk hari ini.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', background: 'white', padding: '0.75rem 1rem', borderRadius: '14px', border: '1px solid #DCFCE7', marginBottom: '1rem', maxWidth: '320px', margin: '0 auto 1rem auto' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 'bold' }}>JAM MASUK</div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#059669' }}>
                      {todayAbsensi.waktu_masuk ? new Date(todayAbsensi.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '07.00'}
                    </div>
                  </div>
                  <div style={{ borderLeft: '1px solid #E5E7EB' }}></div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 'bold' }}>JAM PULANG</div>
                    <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#D97706' }}>
                      {todayAbsensi.waktu_pulang ? new Date(todayAbsensi.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '14.00'}
                    </div>
                  </div>
                </div>
                {todayAbsensi.keterangan && (
                  <div style={{ textAlign: 'left', background: 'white', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #DCFCE7', fontSize: '0.85rem', color: '#374151', margin: '0 auto 1rem auto', maxWidth: '380px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4B5563', marginBottom: '0.2rem' }}>Catatan Tugas / Keterangan:</div>
                    <div>{todayAbsensi.keterangan}</div>
                  </div>
                )}
                {getStoredPhotoForToday() && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4B5563', marginBottom: '0.4rem' }}>Dokumentasi Timemark Tugas Luar:</div>
                    <img src={getStoredPhotoForToday()} alt="Bukti Tugas Luar" style={{ maxHeight: '180px', width: 'auto', maxWidth: '100%', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 4px 10px rgba(0,0,0,0.08)', margin: '0 auto', display: 'block' }} />
                  </div>
                )}
              </div>
            ) : (
              <button className="btn-clock out" onClick={() => handleAbsen('pulang')} disabled={loading}>
                <Fingerprint size={48} strokeWidth={1.5} />
                <span>Clock Out</span>
              </button>
            )}

            {izinMode && (
              <div className="card" style={{ marginTop: '2rem', textAlign: 'left' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Form {izinMode === 'sakit' ? 'Sakit' : 'Izin'}</h4>
                <textarea className="input" rows="3" placeholder="Masukkan keterangan..." value={keterangan} onChange={e => setKeterangan(e.target.value)} style={{ marginBottom: '1rem' }} />
                <div className="flex gap-2">
                  <button onClick={() => setIzinMode(null)} className="btn" style={{ background: '#E2E8F0', flex: 1 }}>Batal</button>
                  <button onClick={() => handleAbsen(izinMode)} className="btn btn-primary" style={{ flex: 1 }}>Kirim</button>
                </div>
              </div>
            )}

            {/* Modal Form Tugas Luar / Pelatihan */}
            {showTugasLuarModal && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem'
                }}
              >
                <div
                  className="card"
                  style={{
                    width: '100%',
                    maxWidth: '460px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: 'white',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    textAlign: 'left',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ background: '#EFF6FF', color: '#2563EB', padding: '0.45rem', borderRadius: '10px' }}>
                        <Briefcase size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold', color: '#1E293B' }}>Presensi Tugas Luar</h4>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Masuk: 07.00 • Pulang: 14.00 (Otomatis Hadir)</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTugasLuarModal(false)}
                      style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#1E40AF', lineHeight: '1.4' }}>
                    💡 <strong>Ketentuan:</strong> Form khusus guru yang bertugas di luar/pelatihan. Setelah dikirim, Anda langsung tercatat <strong>HADIR</strong> lengkap masuk (07:00) dan pulang (14:00) tanpa batas radius sekolah.
                  </div>

                  {/* Foto Timemark / Bukti Pelatihan */}
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block', color: '#334155' }}>
                      📸 Foto Dokumentasi Timemark / Surat Tugas:
                    </label>

                    {tugasLuarFoto ? (
                      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1', background: '#F8FAFC', textAlign: 'center' }}>
                        <img
                          src={tugasLuarFoto}
                          alt="Dokumentasi Tugas Luar"
                          style={{ maxHeight: '200px', width: 'auto', maxWidth: '100%', objectFit: 'contain', margin: '0 auto', display: 'block' }}
                        />
                        <button
                          type="button"
                          onClick={() => setTugasLuarFoto(null)}
                          style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Hapus / Ambil Ulang"
                        >
                          <X size={16} />
                        </button>
                        <div style={{ padding: '0.45rem', fontSize: '0.75rem', color: '#059669', background: '#ECFDF5', fontWeight: 'bold' }}>
                          ✓ Foto Timemark Berhasil Terlampir
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowTugasLuarModal(false)
                            setCameraModeForTugasLuar(true)
                            setShowCameraModal(true)
                          }}
                          className="btn"
                          style={{
                            background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                            color: 'white',
                            fontSize: '0.8rem',
                            padding: '0.75rem 0.5rem',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontWeight: '600',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <Camera size={16} /> Kamera Timemark
                        </button>

                        <label
                          htmlFor="upload-tugas-luar-file"
                          className="btn"
                          style={{
                            background: '#F1F5F9',
                            color: '#334155',
                            fontSize: '0.8rem',
                            padding: '0.75rem 0.5rem',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            border: '1px solid #E2E8F0',
                            textAlign: 'center'
                          }}
                        >
                          <Upload size={16} /> Pilih Galeri
                        </label>
                        <input
                          type="file"
                          id="upload-tugas-luar-file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              try {
                                const reader = new FileReader()
                                reader.onload = async (ev) => {
                                  const webp = await convertToWebP(ev.target.result, 0.75, 1024)
                                  setTugasLuarFoto(webp)
                                }
                                reader.readAsDataURL(file)
                              } catch (err) {
                                console.error(err)
                              }
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Catatan / Keterangan Tugas Luar */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.4rem', display: 'block', color: '#334155' }}>
                      Catatan / Rincian Pelatihan & Tugas: <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <textarea
                      className="input"
                      rows="3"
                      placeholder="Contoh: Mengikuti Pelatihan Pemanfaatan Kurikulum Merdeka di Balai Penjaminan Mutu Pendidikan..."
                      value={tugasLuarCatatan}
                      onChange={e => setTugasLuarCatatan(e.target.value)}
                      style={{ fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
                      required
                    />
                  </div>

                  {/* Tombol Batal & Kirim */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTugasLuarModal(false)}
                      className="btn"
                      style={{ background: '#F1F5F9', color: '#475569', flex: 1, padding: '0.75rem', borderRadius: '12px', fontWeight: '600' }}
                      disabled={loading}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleTugasLuarSubmit}
                      className="btn btn-primary"
                      style={{
                        background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                        color: 'white',
                        flex: 1.5,
                        padding: '0.75rem',
                        borderRadius: '12px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <RefreshCw size={16} className="spin" /> Memproses...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={16} /> Kirim Presensi
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pengaturan' && (
          <div className="fade-in">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Pengaturan Profil</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                {profile?.foto_profil ? (
                  <img src={profile.foto_profil} alt="Profil" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '1rem' }} />
                ) : (
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <UserCircle size={40} color="var(--text-muted)" />
                  </div>
                )}
                <div>
                  <input type="file" id="upload-foto" accept="image/*" style={{ display: 'none' }} onChange={uploadFoto} disabled={loading || isOffline} />
                  <label htmlFor="upload-foto" className="btn" style={{ background: '#E0E7FF', color: '#4F46E5', fontSize: '0.85rem', padding: '0.5rem 1rem', cursor: 'pointer', opacity: isOffline ? 0.5 : 1 }}>
                    {loading ? 'Mengunggah...' : 'Ubah Foto'}
                  </label>
                </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa menyimpan profil saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const guruTipe = formData.get('penugasan_tipe') || 'guru_kelas';
                const mataPelajaran = guruTipe === 'guru_mapel' ? (formData.get('mata_pelajaran') || '') : '';
                let formattedJabatan = formData.get('jabatan') || '';
                if (guruTipe === 'guru_mapel' && mataPelajaran && !formattedJabatan.includes(mataPelajaran)) {
                  formattedJabatan = `Guru ${mataPelajaran} • ${formattedJabatan || 'Guru Mapel'}`;
                }

                // Ambil rombel yang dipilih
                let selectedClasses = [];
                if (guruTipe === 'guru_kelas') {
                  const kelasWali = formData.get('kelas_wali');
                  if (kelasWali) selectedClasses = [kelasWali];
                } else {
                  selectedClasses = formData.getAll('assigned_classes') || [];
                }

                // Simpan role database asli (jangan ubah 'guru' atau 'admin' agar tidak melanggar constraint DB profiles_role_check)
                const updates = { 
                  full_name: formData.get('full_name'), 
                  nip: formData.get('nip'), 
                  jabatan: formattedJabatan,
                  mata_pelajaran: mataPelajaran
                };
                
                let { error } = await supabase.from('profiles').update(updates).eq('id', user.id);

                if (!error) {
                  await setLocalPref(`guru_tipe_${user.id}`, guruTipe);
                  await setLocalPref(`guru_mapel_${user.id}`, mataPelajaran);
                  await setLocalPref(`guru_assigned_classes_${user.id}`, selectedClasses);
                  setAssignedClasses(selectedClasses);
                  setGuruTipeState(guruTipe);
                  setGuruMapelState(mataPelajaran);
                  setShowAssignmentReminder(false);
                  setProfile({ 
                    ...profile, 
                    ...updates, 
                    penugasan_tipe: guruTipe, 
                    mata_pelajaran: mataPelajaran, 
                    jabatan: formattedJabatan 
                  });
                  showPopup("Tersimpan!", "Profil dan penugasan kelas Anda berhasil diperbarui.", "success");
                } else {
                  showPopup("Gagal", error.message, "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Nama Lengkap</label>
                  <input type="text" name="full_name" className="input" defaultValue={profile?.full_name || ''} required />
                </div>
                <div className="input-group">
                  <label className="input-label">NIP / ID Pegawai</label>
                  <input type="text" name="nip" className="input" defaultValue={profile?.nip || ''} placeholder="Contoh: 198012312005011002" />
                </div>
                <div className="input-group">
                  <label className="input-label">Jabatan Struktural / Keterangan</label>
                  <input type="text" name="jabatan" className="input" defaultValue={profile?.jabatan || ''} placeholder="Contoh: Guru Kelas V / Pembina OSIS" />
                </div>

                <div className="input-group">
                  <label className="input-label">Tipe Penugasan Guru</label>
                  <select 
                    name="penugasan_tipe" 
                    className="input" 
                    value={guruTipeState}
                    onChange={(e) => setGuruTipeState(e.target.value)}
                  >
                    <option value="guru_kelas">Guru Kelas (Wali Kelas)</option>
                    <option value="guru_mapel">Guru Mata Pelajaran (Bidang Studi)</option>
                  </select>
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    *Guru Kelas mengelola data siswa rombelnya, sedangkan Guru Mapel mengajar mapel spesifik di lintas kelas.
                  </small>
                </div>

                <div 
                  id="mapel-select-box" 
                  className="input-group" 
                  style={{ display: guruTipeState === 'guru_mapel' ? 'block' : 'none' }}
                >
                  <label className="input-label">Bidang Studi / Mata Pelajaran Utama</label>
                  <select 
                    name="mata_pelajaran" 
                    className="input" 
                    value={guruMapelState}
                    onChange={(e) => setGuruMapelState(e.target.value)}
                  >
                    <option value="">-- Pilih Mata Pelajaran --</option>
                    {getCustomSubjects().map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                  <small style={{ fontSize: '0.72rem', color: '#6366F1', marginTop: '4px', display: 'block' }}>
                    Tersinkron otomatis dari daftar mata pelajaran di Master KBM.
                  </small>
                </div>

                {/* Pemilihan Penugasan Rombel / Kelas */}
                <div className="input-group" style={{ marginTop: '0.5rem' }}>
                  <label className="input-label">Penugasan Kelas / Rombel Belajar</label>
                  
                  {/* Tampilan untuk Guru Kelas (Wali Kelas) */}
                  <div id="kelas-wali-box" style={{ display: guruTipeState === 'guru_mapel' ? 'none' : 'block' }}>
                    <select 
                      name="kelas_wali" 
                      className="input" 
                      key={`wali-${assignedClasses.join(',')}`}
                      defaultValue={assignedClasses.length > 0 ? assignedClasses[0] : ''}
                    >
                      <option value="">-- Pilih Kelas Binaan (Wali Kelas) --</option>
                      {classesList.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Pilih rombel kelas yang Anda bina sebagai Wali Kelas.
                    </small>
                  </div>

                  {/* Tampilan untuk Guru Mapel (Multi-Pilih Kelas) */}
                  <div id="kelas-mapel-box" style={{ display: guruTipeState === 'guru_mapel' ? 'block' : 'none' }}>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '6px' }}>
                      Centang semua kelas yang Anda ajar untuk mata pelajaran ini:
                    </div>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', background: '#F8FAFC', padding: '0.75rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {classesList.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Belum ada daftar kelas dari Admin.</span>
                      ) : (
                        classesList.map(cls => (
                          <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              name="assigned_classes" 
                              value={cls.id} 
                              defaultChecked={assignedClasses.includes(cls.id)}
                              style={{ width: '16px', height: '16px' }} 
                            />
                            <span style={{ fontWeight: '600', color: '#1E293B' }}>{cls.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Pilihan kelas ini akan menjadi filter rombel otomatis di menu Pembelajaran Anda.
                    </small>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '0.75rem' }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan Profil & Penugasan'}
                </button>
              </form>
            </div>

            {/* INTEGRASI GOOGLE GEMINI AI (MANDIRI) */}
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={20} color="#6366F1" />
              <span>Integrasi Google Gemini AI</span>
            </h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
                  Digunakan untuk <strong>mengisi otomatis Jurnal Mengajar dari modul ajar (foto/teks)</strong> dan <strong>pindai foto daftar siswa & NISN</strong>. Kunci API ini tersimpan mandiri khusus untuk akun Anda.
                </p>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={14} color="#6366F1" style={{ flexShrink: 0 }} />
                  <span>Sistem memprioritaskan <strong>Gemini 3.8 Flash</strong>, lalu otomatis beralih ke <strong>2.0 Flash</strong> dan <strong>1.5 Flash</strong> jika kuota batas tercapai.</span>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Gemini API Key</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: '#4F46E5', textDecoration: 'underline', fontWeight: 'normal' }}
                  >
                    Dapatkan API Key Gratis di Google AI Studio ↗
                  </a>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value)
                      setGeminiTestStatus(null)
                      setGeminiSavedMessage(null)
                    }}
                    className="input"
                    placeholder="AIzaSy..."
                    style={{ paddingRight: '45px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                  >
                    {showGeminiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {geminiTestStatus && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '0.75rem',
                  background: geminiTestStatus.success ? '#ECFDF5' : '#FEF2F2',
                  color: geminiTestStatus.success ? '#065F46' : '#991B1B',
                  border: `1px solid ${geminiTestStatus.success ? '#A7F3D0' : '#FECACA'}`
                }}>
                  {geminiTestStatus.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{geminiTestStatus.message}</span>
                </div>
              )}

              {geminiSavedMessage && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  background: '#ECFDF5',
                  color: '#065F46',
                  border: '1px solid #A7F3D0',
                  marginBottom: '0.75rem'
                }}>
                  {geminiSavedMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  disabled={geminiTesting || !geminiApiKey.trim()}
                  onClick={async () => {
                    setGeminiTesting(true)
                    setGeminiTestStatus(null)
                    try {
                      const res = await testGeminiConnection(geminiApiKey)
                      setGeminiTestStatus({
                        success: true,
                        message: `Koneksi Berhasil! Model aktif: ${res.usedModel}`
                      })
                    } catch (err) {
                      setGeminiTestStatus({
                        success: false,
                        message: err.message || 'Gagal terhubung ke Gemini API.'
                      })
                    } finally {
                      setGeminiTesting(false)
                    }
                  }}
                  className="btn"
                  style={{
                    flex: 1,
                    background: '#F1F5F9',
                    color: '#1E293B',
                    padding: '0.75rem',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    cursor: (!geminiApiKey.trim() || geminiTesting) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {geminiTesting ? (
                    <>
                      <Loader2 size={15} className="spin" />
                      <span>Menguji...</span>
                    </>
                  ) : (
                    <span>Tes Koneksi AI</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const saved = saveGeminiKey(geminiApiKey, user?.id)
                    try {
                      await supabase.from('profiles').update({ gemini_api_key: saved }).eq('id', user?.id)
                    } catch (e) {
                      // Kolom DB mungkin belum ada, penyimpanan lokal sudah berhasil
                    }
                    setGeminiSavedMessage('API Key Gemini Anda berhasil disimpan!')
                    setTimeout(() => setGeminiSavedMessage(null), 3000)
                  }}
                  className="btn"
                  style={{
                    flex: 1.5,
                    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                    color: 'white',
                    padding: '0.75rem',
                    fontSize: '0.82rem',
                    fontWeight: 'bold',
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
                  }}
                >
                  <Save size={15} />
                  <span>Simpan API Key</span>
                </button>
              </div>
            </div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', marginTop: '2rem' }}>Keamanan</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa mengubah password saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const newPassword = formData.get('new_password');
                
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (!error) {
                  showPopup("Berhasil!", "Password Anda telah diperbarui.", "success");
                  e.target.reset();
                } else {
                  showPopup("Gagal", error.message, "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Ubah Password Baru</label>
                  <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                </div>
                <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }} disabled={loading}>
                  {loading ? 'Memproses...' : 'Ubah Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'riwayat' && (
          <div className="fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Riwayat Kehadiran</h3>
                <div className="flex gap-2">
                  <button
                    onClick={downloadHistoryExcel}
                    disabled={historyLoading || historyList.length === 0}
                    className="btn"
                    title="Unduh Excel (.xlsx)"
                    style={{
                      background: '#10B981',
                      color: 'white',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      width: 'auto',
                      opacity: historyList.length === 0 ? 0.6 : 1
                    }}
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button
                    onClick={downloadHistoryPDF}
                    disabled={historyLoading || historyList.length === 0}
                    className="btn"
                    title="Unduh PDF (.pdf)"
                    style={{
                      background: '#EF4444',
                      color: 'white',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      width: 'auto',
                      opacity: historyList.length === 0 ? 0.6 : 1
                    }}
                  >
                    <FileText size={14} /> PDF
                  </button>
                </div>
             </div>

             {/* Filter Bulan */}
             <div className="card" style={{ padding: '0.85rem 1rem', border: 'none', background: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Calendar size={18} color="var(--primary)" />
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '0.2rem' }}>Pilih Bulan</label>
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => {
                      setHistoryMonth(e.target.value)
                      loadHistory(e.target.value)
                    }}
                    className="input"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px' }}
                  />
                </div>
             </div>

             {historyLoading ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem auto' }} />
                   Memuat data riwayat...
                </div>
             ) : historyList.length === 0 ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   Tidak ada data kehadiran di bulan {historyMonth}.
                </div>
             ) : (
                <div className="flex flex-col gap-2">
                   {historyList.map((item) => {
                     const isHadir = !item.status || item.status === 'hadir'
                     const statusColor = isHadir ? '#10B981' : item.status === 'izin' ? '#F59E0B' : '#EF4444'
                     const statusBg = isHadir ? '#ECFDF5' : item.status === 'izin' ? '#FFFBEB' : '#FEF2F2'
                     
                     return (
                       <div key={item.id} className="card flex items-center justify-between" style={{ padding: '0.85rem 1rem', border: 'none', borderRadius: '16px', background: 'white' }}>
                         <div>
                           <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1E293B', marginBottom: '0.2rem' }}>
                             {new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                           </div>
                           <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: statusBg, color: statusColor, textTransform: 'uppercase' }}>
                             {item.status || 'HADIR'}
                           </span>
                           {item.keterangan && (
                             <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                               Ket: {item.keterangan}
                             </p>
                           )}
                         </div>

                         <div className="flex gap-3 text-center">
                           <div>
                             <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>MASUK</div>
                             <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#10B981' }}>
                               {item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                             </div>
                           </div>
                           <div>
                             <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>PULANG</div>
                             <div style={{ fontWeight: '700', fontSize: '0.85rem', color: item.waktu_pulang ? '#F59E0B' : '#CBD5E1' }}>
                               {item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                             </div>
                           </div>
                         </div>
                       </div>
                     )
                   })}
                </div>
             )}
          </div>
        )}

        {activeTab === 'pengumuman' && (
          <div className="fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Notifikasi</h3>
                {'Notification' in window && Notification.permission !== 'granted' && (
                   <button
                     onClick={requestNotificationPermission}
                     className="btn"
                     style={{
                       background: '#38BDF8',
                       color: 'white',
                       padding: '0.35rem 0.75rem',
                       borderRadius: '8px',
                       fontSize: '0.75rem',
                       width: 'auto'
                     }}
                   >
                     🔔 Izinkan Push
                   </button>
                )}
             </div>
             
             {pengumumanData.length === 0 ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   Belum ada pengumuman untuk Anda.
                </div>
             ) : (
                <div className="flex flex-col gap-3">
                  {pengumumanData.map(p => (
                    <div key={p.id} className="card" style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '16px', background: 'white' }}>
                      <div className="flex justify-between items-start mb-2">
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => handleDeletePengumuman(p.id)} style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#EF4444', cursor: 'pointer', padding: '0.35rem', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#1E293B', lineHeight: '1.5' }}>{p.pesan}</p>
                    </div>
                  ))}
                </div>
             )}
          </div>
        )}
        {/* Tab KBM / Pembelajaran (Input Jurnal, Presensi Murid, Nilai, Rekap) */}
        {activeTab === 'kbm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {kbmSubTab === 'menu' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Header Title KBM */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Sistem Pembelajaran</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>Pilih modul kegiatan belajar mengajar</p>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4F46E5', background: '#EEF2FF', padding: '4px 10px', borderRadius: '12px' }}>
                    {filteredClassesList.length} Rombel Diampu
                  </span>
                </div>

                {/* Grid Menu Cards: Desain Kotak Modern Mobile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Card 1: Presensi Siswa */}
                  <div
                    onClick={() => setKbmSubTab('presensi_siswa')}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '20px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)' }}>
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Presensi Siswa</h4>
                          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '8px' }}>Harian</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Catat absensi hadir, sakit, izin & alpha kelas</p>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Card 2: Jurnal Mengajar */}
                  <div
                    onClick={() => setKbmSubTab('jurnal')}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '20px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #0D9488 0%, #0284C7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 4px 10px rgba(13, 148, 136, 0.3)' }}>
                        <BookOpen size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Jurnal Mengajar</h4>
                          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#0D9488', background: '#CCFBF1', padding: '2px 8px', borderRadius: '8px' }}>Agenda</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Catatan materi pelajaran, metode & evaluasi harian</p>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Card 3: Input Nilai Siswa */}
                  <div
                    onClick={() => setKbmSubTab('nilai')}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '20px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #9333EA 0%, #6366F1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 4px 10px rgba(147, 51, 234, 0.3)' }}>
                        <Award size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Input Nilai Siswa</h4>
                          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#7E22CE', background: '#F3E8FF', padding: '2px 8px', borderRadius: '8px' }}>Leger</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Penilaian tugas, kuis, STS, SAS & predikat nilai</p>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Card 4: Rekap & Laporan */}
                  <div
                    onClick={() => setKbmSubTab('rekap')}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '20px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)' }}>
                        <FileSpreadsheet size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Rekapitulasi & Cetak</h4>
                          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#EA580C', background: '#FFEDD5', padding: '2px 8px', borderRadius: '8px' }}>Excel / PDF</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Ekspor laporan presensi, rekap nilai & jurnal mengajar</p>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  </div>

                  {/* Card 5: Master Siswa & Kelas */}
                  <div
                    onClick={() => setKbmSubTab('master_siswa')}
                    className="card"
                    style={{
                      padding: '1.1rem 1.25rem',
                      borderRadius: '20px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, #334155 0%, #0F172A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0, boxShadow: '0 4px 10px rgba(15, 23, 42, 0.3)' }}>
                        <Users size={24} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Master KBM</h4>
                          <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#475569', background: '#F1F5F9', padding: '2px 8px', borderRadius: '8px' }}>Basis Data</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>Kelola rombel kelas, siswa & mata pelajaran</p>
                      </div>
                    </div>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', flexShrink: 0 }}>
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Header Sub-Halaman dengan Tombol Kembali */}
                <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button
                    onClick={() => setKbmSubTab('menu')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 'bold',
                      color: '#4F46E5',
                      background: '#EEF2FF',
                      border: 'none',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <ArrowLeft size={15} />
                    <span>Menu</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '2px 0' }}>
                    <button
                      onClick={() => setKbmSubTab('presensi_siswa')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmSubTab === 'presensi_siswa' ? '#10B981' : '#F1F5F9',
                        color: kbmSubTab === 'presensi_siswa' ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      📝 Presensi
                    </button>
                    <button
                      onClick={() => setKbmSubTab('jurnal')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmSubTab === 'jurnal' ? '#0D9488' : '#F1F5F9',
                        color: kbmSubTab === 'jurnal' ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      📓 Jurnal
                    </button>
                    <button
                      onClick={() => setKbmSubTab('nilai')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmSubTab === 'nilai' ? '#9333EA' : '#F1F5F9',
                        color: kbmSubTab === 'nilai' ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      ✍️ Nilai
                    </button>
                    <button
                      onClick={() => setKbmSubTab('rekap')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmSubTab === 'rekap' ? '#EA580C' : '#F1F5F9',
                        color: kbmSubTab === 'rekap' ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      📊 Rekap
                    </button>
                    <button
                      onClick={() => setKbmSubTab('master_siswa')}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmSubTab === 'master_siswa' ? '#1E293B' : '#F1F5F9',
                        color: kbmSubTab === 'master_siswa' ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      ⚙️ Master KBM
                    </button>
                  </div>
                </div>

                {kbmSubTab === 'presensi_siswa' && (
                  <InputPresensiMurid
                    classes={filteredClassesList}
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolInfo={schoolInfoData}
                  />
                )}

                {kbmSubTab === 'jurnal' && (
                  <InputJurnalMengajar
                    classes={filteredClassesList}
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolInfo={schoolInfoData}
                  />
                )}

                {kbmSubTab === 'nilai' && (
                  <InputNilaiSiswa
                    classes={filteredClassesList}
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolInfo={schoolInfoData}
                  />
                )}

                {kbmSubTab === 'rekap' && (
                  <RekapDanLaporan
                    classes={filteredClassesList}
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolInfo={schoolInfoData}
                  />
                )}

                {kbmSubTab === 'master_siswa' && (
                  <MasterSiswaDanKelas
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolInfo={schoolInfoData}
                    onRefresh={fetchUser}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer Copyright & Branding PanritaEdu */}
        <footer className="guru-footer-branding">
          <div className="brand" style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>
            <span className="brand-panrita">Panrita</span><span className="brand-edu">Edu</span>
          </div>
          <p className="brand-tagline" style={{ fontSize: '0.82rem', margin: '0 0 0.35rem 0' }}>
            Sistem Presensi & Manajemen Pembelajaran Terpadu
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8', fontWeight: '500' }}>
            &copy; {new Date().getFullYear()} All Rights Reserved
          </p>
        </footer>
      </div>

      {/* Corporate Style Bottom Navigation (Mobile App Shell) */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'absensi' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('absensi')}>
          <Clock size={20} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.5} /> Presensi
        </button>
        <button
          className="nav-item"
          style={{ flex: 1, color: '#0284C7' }}
          onClick={() => setShowCameraModal(true)}
        >
          <div style={{
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
            color: 'white',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '-14px',
            boxShadow: '0 4px 10px rgba(2, 132, 199, 0.4)'
          }}>
            <Camera size={18} />
          </div>
          <span style={{ fontSize: '0.7rem', fontWeight: '600' }}>Timemark</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'kbm' ? 'active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => {
            if (!checkAssignmentConfigured()) {
              setShowAssignmentReminder(true);
              showPopup("Penugasan Belum Diatur", "Silakan lengkapi penugasan kelas atau mata pelajaran di menu Profil terlebih dahulu sebelum membuka Pembelajaran.", "error");
              return;
            }
            setActiveTab('kbm');
          }}
        >
          <BookOpen size={20} strokeWidth={activeTab === 'kbm' ? 2.5 : 1.5} /> Pembelajaran
        </button>
        <button
          className={`nav-item ${activeTab === 'riwayat' ? 'active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => {
            setActiveTab('riwayat')
            loadHistory()
          }}
        >
          <History size={20} strokeWidth={activeTab === 'riwayat' ? 2.5 : 1.5} /> Riwayat
        </button>
        <button className={`nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('pengaturan')}>
          <UserCircle size={20} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.5} /> Profil
        </button>
      </nav>

      {/* Camera Timemark Modal */}
      <CameraTimemarkModal
        isOpen={showCameraModal}
        onClose={() => {
          setShowCameraModal(false)
          if (cameraModeForTugasLuar) {
            setShowTugasLuarModal(true)
            setCameraModeForTugasLuar(false)
          }
        }}
        profile={profile}
        user={user}
        schoolName={schoolName}
        schoolLogo={schoolLogo}
        onSelectPhoto={cameraModeForTugasLuar ? async (photoUrl) => {
          const webp = await convertToWebP(photoUrl, 0.75, 1024)
          setTugasLuarFoto(webp)
          setShowCameraModal(false)
          setCameraModeForTugasLuar(false)
          setShowTugasLuarModal(true)
        } : null}
      />
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
