import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Users, FileText, Settings, BookOpen, Layers, ShieldCheck, ArrowLeft, Download, Search, ArrowUpDown, UserCircle, Activity, Clock, XCircle, Bell, Trash2, X, Sun, Moon, MapPin, Menu, Award, ChevronRight, CheckCircle2, FileSpreadsheet, School, Briefcase, Camera, ExternalLink, Image as ImageIcon, Edit3, Save, Sparkles, Key, Eye, EyeOff, Loader2, AlertCircle, Fingerprint, Check, History, AlertTriangle, Calendar, RefreshCw, Upload } from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import GeofenceMapPicker from '../../components/GeofenceMapPicker'
import InputPresensiMurid from '../../components/kbm/InputPresensiMurid'
import InputJurnalMengajar from '../../components/kbm/InputJurnalMengajar'
import InputNilaiSiswa from '../../components/kbm/InputNilaiSiswa'
import RekapDanLaporan from '../../components/kbm/RekapDanLaporan'
import MasterSiswaDanKelas from '../../components/kbm/MasterSiswaDanKelas'
import { exportAttendanceRecapExcel, exportGradesRecapExcel, exportJournalsRecapExcel } from '../../lib/excelExport'
import { getCustomSubjects, syncCloudSubjects } from '../../lib/subjectsManager'
import { getSavedGeminiKey, loadSavedGeminiKeyAsync, saveGeminiKey, testGeminiConnection } from '../../lib/gemini'
import { syncCloudTeacherAssignments, saveTeacherAssignmentToCloud, getClassesTakenByOtherTeachers, getCachedAssignmentsMap } from '../../lib/assignmentManager'
import { Capacitor } from '@capacitor/core'
import { getSecureServerDate, getSecureServerIsoString, getSecureLocalDateString, syncServerTime, getSecureLocation, verifyAttendancePlatform, isIncognitoMode, checkCrossDeviceAccess } from '../../lib/security'
import CameraTimemarkModal from '../../components/CameraTimemarkModal'
import { fetchDeviceBindings, resetDeviceBinding } from '../../lib/deviceManager'
import PresensiOnlyApkNotice from '../../components/PresensiOnlyApkNotice'
import RekapPresensiPegawai from '../../components/presensi/RekapPresensiPegawai'
import GoogleDriveBackupCard from '../../components/admin/GoogleDriveBackupCard'
import { checkAutoBackupSchedule } from '../../lib/googleDriveBackupManager'

export default function DashboardKepsek() {
  const isNative = Capacitor.isNativePlatform()
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024)
  const [admin, setAdmin] = useState({ role: 'kepsek' })
  const [activeTab, setActiveTab] = useState(window.innerWidth < 1024 ? 'absensi' : 'overview') 
  const [isIncognito, setIsIncognito] = useState(false)
  const [crossDeviceStatus, setCrossDeviceStatus] = useState({ allowed: true })

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    isIncognitoMode().then(val => setIsIncognito(val))
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (admin?.id) {
      const cross = checkCrossDeviceAccess(admin)
      setCrossDeviceStatus(cross)
    }
  }, [admin])

  const getGreeting = () => {
    const hour = currentTime.getHours()
    if (hour < 11) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  // Riwayat Kehadiran Pribadi Kepala Sekolah
  const [historyList, setHistoryList] = useState([])
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7))
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async (targetMonth = historyMonth) => {
    if (!admin?.id) return
    setHistoryLoading(true)
    try {
      const [year, month] = targetMonth.split('-')
      const firstDay = `${targetMonth}-01`
      const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')
      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', admin.id)
        .gte('tanggal', firstDay)
        .lte('tanggal', lastDay)
        .order('tanggal', { ascending: false })
      if (!error && data) {
        setHistoryList(data)
      }
    } catch (err) {
      console.error("Gagal load history:", err)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'riwayat' && admin?.id) {
      loadHistory(historyMonth)
    }
  }, [activeTab, admin?.id, historyMonth]) 

  // State Gemini AI Key untuk Admin / Kepsek
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiTesting, setGeminiTesting] = useState(false)
  const [geminiTestStatus, setGeminiTestStatus] = useState(null)
  const [geminiSavedMessage, setGeminiSavedMessage] = useState(null)
  const [namaSekolah, setNamaSekolah] = useState('HR Dashboard')
  const [logoSekolah, setLogoSekolah] = useState('')
  const [hariKerja, setHariKerja] = useState(5)
  const [rekapTampilJam, setRekapTampilJam] = useState(true)
  const [exportFontSize, setExportFontSize] = useState(7)
  const [hariLiburData, setHariLiburData] = useState([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // Geofencing states
  const [geofenceEnabled, setGeofenceEnabled] = useState(false)
  const [schoolLat, setSchoolLat] = useState(-5.147665)
  const [schoolLng, setSchoolLng] = useState(119.432732)
  const [schoolRadius, setSchoolRadius] = useState(100) // meters
  
  // Theme Mode & Sidebar state
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme_mode') === 'dark')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  
  // State Presensi Mandiri Khusus Kepala Sekolah / Admin
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [kepsekTodayAbsensi, setKepsekTodayAbsensi] = useState(null)
  const [kepsekHasCheckedIn, setKepsekHasCheckedIn] = useState(false)
  const [kepsekTodayStatus, setKepsekTodayStatus] = useState(null)
  const [kepsekAbsenLoading, setKepsekAbsenLoading] = useState(false)
  const [kepsekPopup, setKepsekPopup] = useState({ show: false, title: '', message: '', type: 'success' })
  const [kepsekIzinMode, setKepsekIzinMode] = useState(null) // 'sakit' | 'izin' | null
  const [kepsekKeterangan, setKepsekKeterangan] = useState('')
  const [showTugasLuarModal, setShowTugasLuarModal] = useState(false)
  const [tugasLuarCatatan, setTugasLuarCatatan] = useState('')
  const [tugasLuarFoto, setTugasLuarFoto] = useState(null)
  const [cameraModeForTugasLuar, setCameraModeForTugasLuar] = useState(false)
  const [isHoliday, setIsHoliday] = useState(false)
  const [holidayReason, setHolidayReason] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [uploadingAdminPhoto, setUploadingAdminPhoto] = useState(false)
  
  const [pegawaiData, setPegawaiData] = useState([])
  const [deviceBindings, setDeviceBindings] = useState({})
  const [absensiData, setAbsensiData] = useState([])
  const [pengumumanData, setPengumumanData] = useState([])
  const [targetType, setTargetType] = useState('all')
  const [selectedPegawai, setSelectedPegawai] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [laporanTipe, setLaporanTipe] = useState('bulanan') // 'harian', 'bulanan', 'semester'
  const [laporanTanggal, setLaporanTanggal] = useState(new Date().toLocaleDateString('en-CA')) // YYYY-MM-DD
  const [laporanBulan, setLaporanBulan] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [laporanSemester, setLaporanSemester] = useState('ganjil')
  const [laporanTahun, setLaporanTahun] = useState(new Date().getFullYear())
  
  const [pegawaiSearch, setPegawaiSearch] = useState('')
  const [pegawaiSort, setPegawaiSort] = useState('name-asc')
  const [editingPegawai, setEditingPegawai] = useState(null) // Pegawai yang sedang diedit perannya oleh Admin
  const [savingPegawai, setSavingPegawai] = useState(false)

  const [overviewStats, setOverviewStats] = useState({ hadir: 0, tidakHadir: 0 })
  // KBM Pembelajaran States
  const [kbmAdminSubTab, setKbmAdminSubTab] = useState('menu') // 'menu' | 'presensi' | 'jurnal' | 'nilai' | 'rekap' | 'master_siswa'
  const [kbmFilterMode, setKbmFilterMode] = useState('kelas') // 'kelas' | 'guru'
  const [kbmClasses, setKbmClasses] = useState([])
  const [kbmSelectedClassId, setKbmSelectedClassId] = useState('')
  const [kbmSelectedTeacherId, setKbmSelectedTeacherId] = useState('')
  const [kbmReportType, setKbmReportType] = useState('kehadiran') // 'kehadiran' | 'nilai' | 'jurnal'
  const [kbmMonth, setKbmMonth] = useState(new Date().toISOString().slice(0, 7))
  const [kbmSemester, setKbmSemester] = useState('ganjil')
  const [kbmYear, setKbmYear] = useState('2026/2027')
  const [kbmStudents, setKbmStudents] = useState([])
  const [kbmAttendance, setKbmAttendance] = useState([])
  const [kbmGrades, setKbmGrades] = useState([])
  const [kbmJournals, setKbmJournals] = useState([])
  const [kbmLoading, setKbmLoading] = useState(false)

  
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPreviewData, setExportPreviewData] = useState({ columns: [], rows: [] })
  const [selectedDetailPhoto, setSelectedDetailPhoto] = useState(null)
  
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

  const navigate = useNavigate()

  useEffect(() => {
    fetchAdmin()
    fetchSettings()
    fetchOverviewStats()
    checkAutoBackupSchedule(supabase)
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTab === 'laporan') {
       loadAbsensi()
       if (pegawaiData.length === 0) loadPegawai()
    }
    if (activeTab === 'kbm') {
       loadKbmClasses()
       loadPegawai()
       loadKbmData()
    }
  }, [laporanTipe, laporanTanggal, laporanBulan, laporanSemester, laporanTahun, activeTab, kbmFilterMode, kbmSelectedClassId, kbmSelectedTeacherId, kbmMonth, kbmSemester, kbmYear])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme_mode', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('theme_mode', 'light')
    }
  }, [darkMode])

  // Pastikan API Key Gemini selalu terisi saat membuka tab Pengaturan / Profil
  useEffect(() => {
    if (activeTab === 'pengaturan') {
      const uId = admin?.id
      loadSavedGeminiKeyAsync(uId, admin).then(k => {
        if (k) setGeminiApiKey(k)
      })
    }
  }, [activeTab, admin])

  const toggleTheme = () => {
    setDarkMode(!darkMode)
  }

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    let currentHariKerja = 5
    if (data) {
      if (data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
      if (data.logo_sekolah) setLogoSekolah(data.logo_sekolah)
      if (data.hari_kerja) {
        setHariKerja(data.hari_kerja)
        currentHariKerja = data.hari_kerja
      }
      if (data.rekap_tampil_jam !== undefined) setRekapTampilJam(data.rekap_tampil_jam)
      if (data.geofence_enabled !== undefined) setGeofenceEnabled(data.geofence_enabled)
      if (data.school_lat) setSchoolLat(data.school_lat)
      if (data.school_lng) setSchoolLng(data.school_lng)
      if (data.school_radius) setSchoolRadius(data.school_radius)
    }

    const dayOfWeek = new Date().getDay()
    let holiday = false
    let reason = ''
    if (currentHariKerja === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) {
      holiday = true
      reason = 'Libur Akhir Pekan (Sabtu / Minggu)'
    } else if (currentHariKerja === 6 && dayOfWeek === 0) {
      holiday = true
      reason = 'Libur Akhir Pekan (Minggu)'
    }

    const today = getSecureLocalDateString()
    if (!holiday) {
      const { data: libur } = await supabase.from('hari_libur').select('*').eq('tanggal', today).maybeSingle()
      if (libur) {
        holiday = true
        reason = libur.keterangan
      }
    }
    setIsHoliday(holiday)
    setHolidayReason(reason)
  }

  const loadHariLibur = async () => {
    const { data } = await supabase.from('hari_libur').select('*').order('tanggal', { ascending: false }).limit(20)
    if (data) setHariLiburData(data)
  }

  const fetchAdmin = async () => {
    // 1. Cek jika sedang dibuka oleh Akun Pengembang / Kepsek Override (Super Admin Mode)
    const devSession = localStorage.getItem('panrita_developer_session')
    if (devSession) {
      try {
        const parsed = JSON.parse(devSession)
        if (parsed && parsed.user && parsed.expiresAt > Date.now()) {
          const devUser = {
            id: parsed.user.id || 'developer-master-uid',
            email: parsed.user.email || 'kepsek@sekolah.edu',
            full_name: parsed.user.full_name || 'Kepala Sekolah (Supervisi Eksekutif)',
            role: 'kepsek',
            isDeveloperPreview: true
          }
          setAdmin(devUser)
          const existingKey = await loadSavedGeminiKeyAsync(devUser.id, devUser)
          setGeminiApiKey(existingKey)
          loadKepsekTodayAbsensi(devUser.id)
          return
        }
      } catch (e) {}
    }

    // 2. Ambil user dari session lokal terlebih dahulu (tahan delay jaringan)
    let currentUser = null
    try {
      const { data: sessData } = await supabase.auth.getSession()
      if (sessData?.session?.user) {
        currentUser = sessData.session.user
      }
    } catch (e) {}

    // 3. Fallback ke getUser jika session lokal belum ter-resolve
    if (!currentUser) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (userData?.user) {
          currentUser = userData.user
        }
      } catch (e) {}
    }

    // 4. Beri toleransi delay singkat (400ms) untuk sinkronisasi token storage sebelum memutuskan keluar
    if (!currentUser) {
      await new Promise(r => setTimeout(r, 400))
      try {
        const { data: retrySess } = await supabase.auth.getSession()
        if (retrySess?.session?.user) {
          currentUser = retrySess.session.user
        }
      } catch (e) {}
    }

    if (!currentUser) {
      return navigate('/')
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle()
    const userRole = profile?.role || localStorage.getItem(`panrita_role_${currentUser.id}`) || ''

    // Proteksi ketat: Halaman ini HANYA untuk Kepala Sekolah
    if (userRole !== 'kepsek') {
      if (userRole === 'admin') return navigate('/admin')
      if (userRole === 'operator') return navigate('/operator')
      if (userRole === 'tendik' || userRole === 'nonoperator') return navigate('/nonoperator')
      return navigate('/guru')
    }

    const fullUser = { 
      ...currentUser, 
      ...(profile || {}), 
      role: userRole,
      tipe_perangkat: localStorage.getItem(`guru_tipe_perangkat_${currentUser.id}`) || 'android'
    }
    setAdmin(fullUser)
    const existingKey = await loadSavedGeminiKeyAsync(currentUser.id, fullUser, profile)
    setGeminiApiKey(existingKey)
    loadKepsekTodayAbsensi(currentUser.id)
  }

  const loadKepsekTodayAbsensi = async (userId) => {
    const today = getSecureLocalDateString()
    const { data } = await supabase.from('absensi').select('*').eq('user_id', userId).eq('tanggal', today).order('waktu_masuk', { ascending: false }).limit(1)
    if (data && data.length > 0) {
      setKepsekTodayAbsensi(data[0])
      setKepsekHasCheckedIn(true)
      setKepsekTodayStatus(data[0].status)
    }
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
        try {
          resolve(canvas.toDataURL('image/webp', quality))
        } catch {
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
      }
      img.onerror = () => resolve(imageSrc)
      img.src = imageSrc
    })
  }

  const getStoredPhotoForToday = () => {
    if (tugasLuarFoto) return tugasLuarFoto
    const today = getSecureLocalDateString()
    return localStorage.getItem(`tugas_luar_foto_${today}_${admin?.id}`) || null
  }

  const handleTugasLuarSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!tugasLuarCatatan.trim()) {
      setKepsekPopup({ show: true, title: "Catatan Wajib Diisi", message: "Mohon isi nama pelatihan atau rincian tugas luar.", type: "error" })
      return
    }

    setKepsekAbsenLoading(true)
    const today = getSecureLocalDateString()
    const [year, month, day] = today.split('-').map(Number)

    // Jam masuk otomatis 07.00, jam pulang otomatis 14.00 waktu lokal
    const jamMasukDate = new Date(year, month - 1, day, 7, 0, 0)
    const jamPulangDate = new Date(year, month - 1, day, 14, 0, 0)
    const waktuMasuk = jamMasukDate.toISOString()
    const waktuPulang = jamPulangDate.toISOString()

    // Ambil koordinat GPS perangkat saat ini jika tersedia (tanpa geofence constraint)
    let loc = 'Lokasi Tugas Luar'
    try {
      const pos = await getSecureLocation({ timeout: 7000, enableHighAccuracy: true })
      if (!pos.isMock) {
        loc = `${pos.latitude}, ${pos.longitude}`
      }
    } catch {}

    const finalCatatan = `[Tugas Luar/Pelatihan] ${tugasLuarCatatan.trim()}`

    let webpPhoto = tugasLuarFoto
    if (tugasLuarFoto) {
      try {
        webpPhoto = await convertToWebP(tugasLuarFoto, 0.75, 1024)
      } catch (err) {
        console.warn("Convert webp error:", err)
      }
    }

    if (webpPhoto && admin?.id) {
      try {
        localStorage.setItem(`tugas_luar_foto_${today}_${admin.id}`, webpPhoto)
      } catch (err) {
        console.warn("Storage quota exceeded for local preview photo:", err)
      }
    }

    let uploadedPhotoUrl = null
    if (webpPhoto) {
      try {
        const res = await fetch(webpPhoto)
        const blob = await res.blob()
        const fileName = `tugas_luar-${admin.id}-${Date.now()}.webp`
        const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: 'image/webp' })
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
          uploadedPhotoUrl = publicUrl
        }
      } catch (e) {
        console.warn("Upload storage tugas luar:", e)
      }
    }

    const keteranganLengkap = uploadedPhotoUrl 
      ? `${finalCatatan} | Foto: ${uploadedPhotoUrl}` 
      : (webpPhoto ? `${finalCatatan} [FOTO_WEBP:${webpPhoto}]` : finalCatatan)

    try {
      const { data, error } = await supabase.from('absensi').insert({
        user_id: admin.id,
        waktu_masuk: waktuMasuk,
        waktu_pulang: waktuPulang,
        tanggal: today,
        lokasi_masuk: loc,
        lokasi_pulang: loc,
        status: 'hadir',
        keterangan: keteranganLengkap
      }).select().maybeSingle()

      if (error) throw error

      setKepsekHasCheckedIn(true)
      setKepsekTodayStatus('hadir')
      setKepsekTodayAbsensi(data || {
        user_id: admin.id,
        waktu_masuk: waktuMasuk,
        waktu_pulang: waktuPulang,
        tanggal: today,
        lokasi_masuk: loc,
        lokasi_pulang: loc,
        status: 'hadir',
        keterangan: keteranganLengkap
      })
      setShowTugasLuarModal(false)
      setTugasLuarCatatan('')
      setKepsekPopup({
        show: true,
        title: "Tugas Luar Berhasil!",
        message: "Presensi tugas luar tercatat: Hadir otomatis Jam 07.00 - 14.00.",
        type: "success"
      })
    } catch (err) {
      setKepsekPopup({ show: true, title: "Gagal Menyimpan", message: err.message, type: "error" })
    } finally {
      setKepsekAbsenLoading(false)
    }
  }

  const handleKepsekAbsen = async (jenis) => {
    const platformCheck = verifyAttendancePlatform(admin, isIncognito)
    if (!platformCheck.allowed && (jenis === 'masuk' || jenis === 'pulang')) {
      const title = platformCheck.platform === 'incognito_blocked' 
        ? "Tab Samaran Terdeteksi" 
        : platformCheck.platform === 'cross_device_blocked' 
          ? "Akses Perangkat Ditolak" 
          : "Presensi Ditolak (Gunakan Aplikasi)"
      setKepsekPopup({
        show: true,
        title: title,
        message: platformCheck.message,
        type: "error"
      })
      return
    }

    setKepsekAbsenLoading(true)
    try {
      const pos = await getSecureLocation({ enableHighAccuracy: true, timeout: 10000 })
      if (pos.isMock) {
        setKepsekPopup({
          show: true,
          title: "Peringatan Fake GPS",
          message: "Aplikasi mendeteksi penggunaan Fake GPS. Matikan aplikasi Fake GPS untuk presensi.",
          type: "error"
        })
        setKepsekAbsenLoading(false)
        return
      }

      // Geofencing Validation (khusus absen masuk & pulang)
      if (geofenceEnabled && (jenis === 'masuk' || jenis === 'pulang')) {
        const distance = calculateDistance(
          pos.latitude,
          pos.longitude,
          schoolLat,
          schoolLng
        )

        if (distance > schoolRadius) {
          setKepsekPopup({
            show: true,
            title: "Di Luar Radius Sekolah",
            message: `Anda berada ${distance}m dari sekolah (maksimal ${schoolRadius}m). Mohon mendekat ke area sekolah.`,
            type: "error"
          })
          setKepsekAbsenLoading(false)
          return
        }
      }

      const loc = `${pos.latitude}, ${pos.longitude}`
      const today = getSecureLocalDateString()
      const now = getSecureServerIsoString()

      if (jenis === 'masuk') {
        const { data, error } = await supabase.from('absensi').insert({
          user_id: admin.id,
          waktu_masuk: now,
          tanggal: today,
          lokasi_masuk: loc,
          status: 'hadir'
        }).select().maybeSingle()
        if (error) throw error
        setKepsekHasCheckedIn(true)
        setKepsekTodayStatus('hadir')
        setKepsekTodayAbsensi(data || { user_id: admin.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
        setKepsekPopup({ show: true, title: "Absen Berhasil!", message: "Presensi masuk Anda telah tersimpan.", type: "success" })
      } else if (jenis === 'pulang') {
        const { data, error } = await supabase.from('absensi').update({
          waktu_pulang: now,
          lokasi_pulang: loc
        }).eq('user_id', admin.id).eq('tanggal', today).select().maybeSingle()
        if (error) throw error
        setKepsekTodayAbsensi(prev => ({ ...prev, waktu_pulang: now, lokasi_pulang: loc }))
        setKepsekPopup({ show: true, title: "Pulang Tercatat!", message: "Presensi kepulangan Anda telah tersimpan.", type: "success" })
      } else if (jenis === 'sakit' || jenis === 'izin') {
        const note = kepsekKeterangan.trim() || (jenis === 'sakit' ? 'Sakit' : 'Izin')
        const { data, error } = await supabase.from('absensi').insert({
          user_id: admin.id,
          waktu_masuk: now,
          waktu_pulang: now,
          tanggal: today,
          lokasi_masuk: loc,
          lokasi_pulang: loc,
          status: jenis,
          keterangan: note
        }).select().maybeSingle()
        if (error) throw error
        setKepsekHasCheckedIn(true)
        setKepsekTodayStatus(jenis)
        setKepsekTodayAbsensi(data || { user_id: admin.id, waktu_masuk: now, waktu_pulang: now, tanggal: today, status: jenis, keterangan: note })
        setKepsekIzinMode(null)
        setKepsekKeterangan('')
        setKepsekPopup({
          show: true,
          title: "Pengajuan Terkirim",
          message: `Status kehadiran Anda hari ini terdaftar ${jenis.toUpperCase()}.`,
          type: "success"
        })
      }
    } catch (err) {
      setKepsekPopup({ show: true, title: "Gagal Mengambil Lokasi", message: err.message || "Pastikan GPS aktif dan izin diberikan.", type: "error" })
    } finally {
      setKepsekAbsenLoading(false)
    }
  }

  const fetchOverviewStats = async () => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase.from('absensi').select('*').eq('tanggal', todayStr)
    if (data) {
       let hadir = 0
       let tidakHadir = 0
       data.forEach(a => {
          if (a.status === 'hadir') {
             hadir++
          } else {
             tidakHadir++
          }
       })
       setOverviewStats({ hadir, tidakHadir })
    }
  }

  const loadPegawai = async () => {
    setLoadingData(true)
    loadKbmClasses()
    syncCloudSubjects(supabase)
    await syncCloudTeacherAssignments(supabase)
    const [profRes, bindRes] = await Promise.all([
      supabase.from('profiles').select('*'),
      fetchDeviceBindings(supabase)
    ])
    if (profRes.data) setPegawaiData(profRes.data)
    if (bindRes) setDeviceBindings(bindRes)
    setLoadingData(false)
  }

  const loadAbsensi = async () => {
    setLoadingData(true)
    let query = supabase.from('absensi').select('*, profiles(full_name, email, foto_profil, jabatan, nip)')
    
    if (laporanTipe === 'harian') {
       query = query.eq('tanggal', laporanTanggal)
    } else if (laporanTipe === 'bulanan') {
       const [year, month] = laporanBulan.split('-')
       const firstDay = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
       const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay).lte('tanggal', lastDay)
    } else if (laporanTipe === 'semester') {
       const year = parseInt(laporanTahun)
       const startMonth = laporanSemester === 'ganjil' ? 6 : 0 // Ganjil = Jul-Dec, Genap = Jan-Jun
       const endMonth = laporanSemester === 'ganjil' ? 11 : 5
       const firstDay = new Date(year, startMonth, 1).toLocaleDateString('en-CA')
       const lastDay = new Date(year, endMonth + 1, 0).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay).lte('tanggal', lastDay)
    }
    
    const { data } = await query.order('waktu_masuk', { ascending: false }).limit(2000)
    if (data) setAbsensiData(data)
    setLoadingData(false)
  }

  const loadPengumuman = async () => {
    setLoadingData(true)
    const { data, error } = await supabase
      .from('pengumuman')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error && data) {
      const filtered = data.filter(p => {
        const tt = (p.target_type || '').trim()
        if (tt.startsWith('__') || tt.startsWith('SYSTEM_')) return false
        if (typeof p.pesan === 'string') {
          const t = p.pesan.trim()
          if (t.startsWith('{') && (t.includes('"deviceId"') || t.includes('"DEV-') || t.includes('"boundAt"') || t.includes('"passwordHash"'))) {
            return false
          }
        }
        return true
      })
      setPengumumanData(filtered)
    }
    setLoadingData(false)
  }

  const hapusPengumuman = async (id) => {
    if (!window.confirm("Hapus pengumuman ini?")) return
    const target = pengumumanData.find(p => p.id === id)
    if (target?.target_type?.startsWith('__')) {
       alert("Item sistem tidak dapat dihapus.")
       return
    }
    const { error } = await supabase.from('pengumuman').delete().eq('id', id)
    if (!error) {
       setPengumumanData(pengumumanData.filter(p => p.id !== id))
    }
  }

  const tambahPengumuman = async (e) => {
    e.preventDefault()
    const pesan = e.target.pesan.value
    if (!pesan.trim()) return
    if (targetType === 'selected' && selectedPegawai.length === 0) {
       return alert("Pilih minimal satu pegawai untuk menerima notifikasi ini.")
    }
    
    const target_users = targetType === 'selected' ? selectedPegawai.join(',') : ''
    const { data, error } = await supabase.from('pengumuman').insert({ pesan, target_type: targetType, target_users }).select()
    
    if (!error && data) {
       setPengumumanData([data[0], ...pengumumanData])
       e.target.reset()
       setTargetType('all')
       setSelectedPegawai([])
       alert("Pengumuman berhasil dikirim!")
    } else {
       if (error?.code === '42P01' || error?.message?.includes('target_type')) {
          alert("Error: Struktur tabel 'pengumuman' belum diperbarui di Supabase. Silakan perbarui tabel (tambah kolom target_type dan target_users)!")
       } else {
          alert("Gagal mengirim pengumuman: " + error?.message)
       }
    }
  }

  const loadKbmClasses = async () => {
    try {
      const { data, error } = await supabase.from('classes').select('*').order('name', { ascending: true })
      if (!error && data) {
        setKbmClasses(data)
        if (data.length > 0 && !kbmSelectedClassId) {
          setKbmSelectedClassId(data[0].id)
        }
      }
    } catch (err) {
      console.error('Error loading KBM classes:', err)
    }
  }

  const loadKbmData = async () => {
    setKbmLoading(true)
    try {
      // 1. Ambil data siswa
      let studentQuery = supabase.from('students').select('*').order('name', { ascending: true })
      if (kbmFilterMode === 'kelas' && kbmSelectedClassId) {
        studentQuery = studentQuery.eq('class_id', kbmSelectedClassId)
      }
      const { data: stdData } = await studentQuery
      setKbmStudents(stdData || [])

      // 2. Ambil data presensi
      const [year, month] = (kbmMonth || new Date().toISOString().slice(0, 7)).split('-')
      const firstDay = `${year}-${month}-01`
      const lastDay = new Date(year, parseInt(month), 0).toLocaleDateString('en-CA')

      let attQuery = supabase.from('student_attendance').select('*').gte('tanggal', firstDay).lte('tanggal', lastDay)
      if (kbmFilterMode === 'kelas' && kbmSelectedClassId) {
        attQuery = attQuery.eq('class_id', kbmSelectedClassId)
      } else if (kbmFilterMode === 'guru' && kbmSelectedTeacherId) {
        attQuery = attQuery.eq('teacher_id', kbmSelectedTeacherId)
      }
      const { data: attData } = await attQuery
      setKbmAttendance(attData || [])

      // 3. Ambil data nilai
      let grQuery = supabase.from('student_grades').select('*').eq('semester', kbmSemester).eq('tahun_ajaran', kbmYear)
      if (kbmFilterMode === 'kelas' && kbmSelectedClassId) {
        grQuery = grQuery.eq('class_id', kbmSelectedClassId)
      } else if (kbmFilterMode === 'guru' && kbmSelectedTeacherId) {
        grQuery = grQuery.eq('teacher_id', kbmSelectedTeacherId)
      }
      const { data: grData } = await grQuery
      setKbmGrades(grData || [])

      // 4. Ambil data jurnal
      let jrnQuery = supabase.from('learning_journals').select('*, profiles(full_name, email), classes(name)').order('tanggal', { ascending: false }).limit(100)
      if (kbmFilterMode === 'kelas' && kbmSelectedClassId) {
        jrnQuery = jrnQuery.eq('class_id', kbmSelectedClassId)
      } else if (kbmFilterMode === 'guru' && kbmSelectedTeacherId) {
        jrnQuery = jrnQuery.eq('teacher_id', kbmSelectedTeacherId)
      }
      const { data: jrnData } = await jrnQuery
      setKbmJournals(jrnData || [])
    } catch (err) {
      console.error('Error loading KBM data:', err)
    } finally {
      setKbmLoading(false)
    }
  }

  const handleExportKbmAdmin = () => {
    const activeClass = kbmClasses.find(c => c.id === kbmSelectedClassId)
    const activeClassName = activeClass ? activeClass.name : 'Semua Kelas'
    const schoolInfoObj = {
      schoolName: namaSekolah,
      principalName: '',
      teacherName: 'Administrator',
      principalNIP: '-',
      teacherNIP: '-'
    }

    if (kbmReportType === 'kehadiran') {
      const rows = (kbmStudents || []).map((st, idx) => {
        let h = 0, s = 0, i = 0, a = 0
        ;(kbmAttendance || []).forEach(att => {
          if (att.student_id === st.id) {
            if (att.status === 'hadir') h++
            else if (att.status === 'sakit') s++
            else if (att.status === 'izin') i++
            else if (att.status === 'alpha') a++
          }
        })
        const total = h + s + i + a
        const pct = total > 0 ? ((h / total) * 100).toFixed(1) + '%' : '100%'
        return [idx + 1, st.nis || '-', st.name, st.gender || '-', h, s, i, a, pct]
      })

      exportAttendanceRecapExcel({
        title: 'REKAPITULASI PRESENSI SISWA',
        className: activeClassName,
        periodText: kbmMonth,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'NIS', 'Nama Siswa', 'L/P', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', '% Kehadiran'],
          rows: rows,
          summary: [
            ['Total Siswa:', (kbmStudents || []).length, '', 'Bulan:', kbmMonth]
          ]
        }
      })
    } else if (kbmReportType === 'nilai') {
      const rows = (kbmStudents || []).map((st, idx) => {
        const stGr = (kbmGrades || []).filter(g => g.student_id === st.id)
        const avg = stGr.length > 0 ? (stGr.reduce((a, b) => a + Number(b.nilai), 0) / stGr.length).toFixed(1) : '-'
        const predikat = avg >= 90 ? 'A' : avg >= 75 ? 'B' : avg >= 60 ? 'C' : avg !== '-' ? 'D' : '-'
        return [idx + 1, st.nis || '-', st.name, st.gender || '-', avg, predikat]
      })

      exportGradesRecapExcel({
        title: 'REKAPITULASI NILAI SISWA',
        className: activeClassName,
        subjectName: 'Semua Mata Pelajaran',
        periodText: `Semester ${kbmSemester} ${kbmYear}`,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'NIS', 'Nama Siswa', 'L/P', 'Rata-rata Nilai', 'Predikat'],
          rows: rows
        }
      })
    } else if (kbmReportType === 'jurnal') {
      const rows = (kbmJournals || []).map((j, idx) => [
        idx + 1,
        j.tanggal,
        j.classes?.name || activeClassName,
        j.profiles?.full_name || 'Guru',
        j.mata_pelajaran,
        j.topik,
        j.kegiatan || '-',
        j.catatan || '-'
      ])

      exportJournalsRecapExcel({
        title: 'REKAPITULASI JURNAL PEMBELAJARAN (ADMIN)',
        className: activeClassName,
        periodText: `Tahun Ajaran ${kbmYear}`,
        schoolInfo: schoolInfoObj,
        dataGrid: {
          headers: ['No', 'Tanggal', 'Kelas', 'Guru Pengampu', 'Mata Pelajaran', 'Materi/Topik', 'Kegiatan KBM', 'Catatan/Hambatan'],
          rows: rows
        }
      })
    }
  }

  const location = useLocation()

  // Sinkronisasi ActiveTab dengan URL Path di Kepsek Dashboard
  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '')
    if (path === '/kepsek/pegawai') {
      setActiveTab('pegawai')
      loadPegawai()
    } else if (path === '/kepsek/kbm') {
      setActiveTab('kbm')
      loadKbmClasses()
      loadPegawai()
      loadKbmData()
    } else if (path === '/kepsek/laporan') {
      setActiveTab('laporan')
      loadPegawai()
      loadAbsensi()
    } else if (path === '/kepsek/pengumuman') {
      setActiveTab('pengumuman')
      loadPengumuman()
      loadPegawai()
    } else if (path === '/kepsek/pengaturan') {
      setActiveTab('pengaturan')
      fetchSettings()
      loadHariLibur()
    } else if (path === '/kepsek') {
      setActiveTab('overview')
      fetchOverviewStats()
    }
  }, [location.pathname])

  const handleMenuClick = (menu) => {
    setActiveTab(menu)
    if (menu === 'pegawai') {
       navigate('/kepsek/pegawai')
       loadPegawai()
    }
    if (menu === 'kbm') {
       navigate('/kepsek/kbm')
       loadKbmClasses()
       loadPegawai()
       loadKbmData()
    }
    if (menu === 'laporan') {
       navigate('/kepsek/laporan')
       loadPegawai()
       loadAbsensi()
    }
    if (menu === 'overview') {
       navigate('/kepsek')
       fetchOverviewStats()
    }
    if (menu === 'pengumuman') {
       navigate('/kepsek/pengumuman')
       loadPengumuman()
       loadPegawai()
    }
    if (menu === 'pengaturan') {
       navigate('/kepsek/pengaturan')
       fetchSettings()
       loadHariLibur()
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
          if (width > height) {
            if (width > 600) { height = Math.round((height *= 600 / width)); width = 600; }
          } else {
            if (height > 600) { width = Math.round((width *= 600 / height)); height = 600; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], "logo_" + Date.now() + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const compressedFile = await compressImage(file)
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.webp`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('settings').upsert({ id: 1, logo_sekolah: publicUrl }, { onConflict: 'id' })
      if (updateError) throw updateError
      setLogoSekolah(publicUrl)
      alert("Logo berhasil diperbarui!")
    } catch (err) {
      alert("Gagal upload logo: " + err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleOpenExportModal = () => {
     if (absensiData.length === 0) return alert("Tidak ada data untuk diekspor.");
     let columns = [];
     let rows = [];
     let monthName = '';
     let redColumns = [];

     if (laporanTipe === 'bulanan') {
       columns = ['No', 'Nama'];
       const [yearStr, monthStr] = laporanBulan.split('-');
       const yearNum = parseInt(yearStr);
       const monthNum = parseInt(monthStr) - 1;
       const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
       monthName = `${monthNames[monthNum]} ${yearNum}`;
       
       const daysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();
       
       for(let i=1; i<=daysInMonth; i++) {
          columns.push(i.toString());
          const dateObj = new Date(yearNum, monthNum, i);
          const dayOfWeek = dateObj.getDay();
          let isRed = false;
          if (hariKerja === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) isRed = true;
          if (hariKerja === 6 && dayOfWeek === 0) isRed = true;
          
          const dateStr = dateObj.toLocaleDateString('en-CA');
          if (hariLiburData.some(h => h.tanggal === dateStr)) isRed = true;
          
          if (isRed) redColumns.push(i.toString());
       }

       const userMap = {}
       pegawaiData.forEach(p => {
          userMap[p.id] = { nama: p.full_name || p.email, nip: p.nip || '-', absensi: {} }
       })
       absensiData.forEach(a => {
          if(!userMap[a.user_id]) return;
          const tgl = new Date(a.tanggal).getDate();
          userMap[a.user_id].absensi[tgl] = {
             status: a.status,
             in: a.waktu_masuk ? new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
             out: a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
          };
       })

       rows = Object.values(userMap).map((user, index) => {
          const row = { No: index + 1, Nama: `${user.nama}\nNIP: ${user.nip}` };
          for(let i=1; i<=daysInMonth; i++) {
             row[i] = user.absensi[i] || null;
          }
          return row;
       });
     } else {
       columns = ['No', 'Nama', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status'];
       rows = getFilteredAndSortedData().map((a, index) => ({
         No: index + 1,
         Nama: `${a.profiles?.full_name || a.profiles?.email?.split('@')[0] || 'Unknown'}\nNIP: ${a.profiles?.nip || '-'}`,
         Tanggal: new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
         'Jam Masuk': new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
         'Jam Pulang': a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
         Status: a.status?.toUpperCase() || 'HADIR'
       }));
     }

     setExportPreviewData({ 
        columns, 
        rows,
        monthName: laporanTipe === 'bulanan' ? monthName : '',
        redColumns: laporanTipe === 'bulanan' ? redColumns : []
     });
     setShowExportModal(true);
  }

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Presensi');

    worksheet.mergeCells(1, 1, 1, exportPreviewData.columns.length);
    worksheet.getCell(1, 1).value = 'DAFTAR HADIR';
    worksheet.getCell(1, 1).font = { bold: true, size: 12 };
    worksheet.getCell(1, 1).alignment = { horizontal: 'center' };

    worksheet.mergeCells(2, 1, 2, exportPreviewData.columns.length);
    worksheet.getCell(2, 1).value = 'GURU DAN TENAGA KEPENDIDIKAN';
    worksheet.getCell(2, 1).font = { bold: true, size: 12 };
    worksheet.getCell(2, 1).alignment = { horizontal: 'center' };

    worksheet.mergeCells(3, 1, 3, exportPreviewData.columns.length);
    worksheet.getCell(3, 1).value = namaSekolah.toUpperCase();
    worksheet.getCell(3, 1).font = { bold: true, size: 12 };
    worksheet.getCell(3, 1).alignment = { horizontal: 'center' };
    
    if (laporanTipe === 'bulanan') {
       worksheet.mergeCells(4, 1, 4, exportPreviewData.columns.length);
       worksheet.getCell(4, 1).value = `Bulan : ${exportPreviewData.monthName}`;
       worksheet.getCell(4, 1).font = { bold: true, size: 11 };
       worksheet.getCell(4, 1).alignment = { horizontal: 'left' };
    }

    const headerRow = worksheet.addRow(exportPreviewData.columns);
    headerRow.eachCell((cell, colNumber) => {
      const colName = exportPreviewData.columns[colNumber - 1];
      let bgColor = exportPreviewData.redColumns?.includes(colName) ? 'FFDC2626' : 'FF4F46E5';
      
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: exportFontSize };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    worksheet.getColumn(1).width = 5;
    // Auto shrink Nama column a bit based on exportFontSize
    worksheet.getColumn(2).width = Math.max(15, 30 * (exportFontSize / 10));
    
    if (laporanTipe === 'bulanan') {
      for(let i=3; i<=exportPreviewData.columns.length; i++) worksheet.getColumn(i).width = rekapTampilJam ? 12 : 5;
    } else {
      for(let i=3; i<=6; i++) worksheet.getColumn(i).width = 18;
    }

    exportPreviewData.rows.forEach(row => {
      const rowData = [];
      exportPreviewData.columns.forEach(col => {
         if (laporanTipe === 'bulanan' && col !== 'No' && col !== 'Nama') {
            const cellData = row[col];
            if (!cellData) rowData.push('-');
            else if (cellData.status === 'hadir') rowData.push(rekapTampilJam ? `✓\nIn: ${cellData.in}\nOut: ${cellData.out}` : '✓');
            else rowData.push(cellData.status.toUpperCase());
         } else {
            rowData.push(row[col]);
         }
      });
      
      const addedRow = worksheet.addRow(rowData);
      addedRow.eachCell((cell, colNumber) => {
         const colName = exportPreviewData.columns[colNumber - 1];
         let isRedColumn = exportPreviewData.redColumns?.includes(colName);
         
         cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
         cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         
         if (isRedColumn) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
         }
         
         let cellFont = { size: exportFontSize };
         
         if (laporanTipe === 'bulanan' && colNumber > 2) {
            const cellData = row[colName];
            if (cellData && cellData !== '-') {
               if (cellData.status === 'hadir') {
                  cellFont.color = { argb: 'FF2563EB' };
               } else if (cellData.status === 'izin') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
                  cellFont.bold = true;
                  cellFont.color = { argb: 'FFFFFFFF' };
               } else if (cellData.status === 'sakit') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
                  cellFont.bold = true;
                  cellFont.color = { argb: 'FFFFFFFF' };
               }
            }
         }
         cell.font = cellFont;
      });
    });

    worksheet.pageSetup.orientation = laporanTipe === 'bulanan' ? 'landscape' : 'portrait';
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToWidth = 1;
    worksheet.pageSetup.fitToHeight = 0;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Laporan_Kehadiran_${laporanTipe}.xlsx`);
  }

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: laporanTipe === 'bulanan' ? 'landscape' : 'portrait', format: 'legal' });
    const docWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR HADIR", docWidth / 2, 15, { align: 'center' });
    doc.text("GURU DAN TENAGA KEPENDIDIKAN", docWidth / 2, 22, { align: 'center' });
    doc.text(namaSekolah.toUpperCase(), docWidth / 2, 29, { align: 'center' });

    if (laporanTipe === 'bulanan') {
      doc.setFontSize(12);
      doc.text(`Bulan : ${exportPreviewData.monthName}`, 14, 40);
    }
    
    const startY = laporanTipe === 'bulanan' ? 45 : 35;
    
    const drawTable = (columns, rows, startYPos) => {
       const head = [columns];
       const body = rows.map(r => columns.map(c => {
          let content = r[c] || '-';
          if (laporanTipe === 'bulanan' && c !== 'No' && c !== 'Nama' && content !== '-') {
             if (content.status === 'hadir') content = rekapTampilJam ? `✓\nIn: ${content.in}\nOut: ${content.out}` : '✓';
             else if (content.status === 'izin') content = 'IZIN';
             else if (content.status === 'sakit') content = 'SAKIT';
          }
          return content;
       }));

       autoTable(doc, {
         startY: startYPos,
         head: head,
         body: body,
         theme: 'grid',
         styles: { 
            fontSize: exportFontSize,
            cellPadding: (laporanTipe === 'bulanan' && rekapTampilJam) ? 0.5 : 1,
            halign: 'center',
            valign: 'middle',
            minCellHeight: 8
         },
         headStyles: {
            fillColor: [79, 70, 229]
         },
         didParseCell: function (data) {
            if (laporanTipe === 'bulanan' && data.section === 'head') {
               const colName = columns[data.column.index];
               if (exportPreviewData.redColumns.includes(colName)) data.cell.styles.fillColor = [220, 38, 38];
            }
            if (laporanTipe === 'bulanan' && data.section === 'body') {
               const colName = columns[data.column.index];
               const cellData = rows[data.row.index][colName];
               
               if (exportPreviewData.redColumns.includes(colName)) {
                  data.cell.styles.fillColor = [254, 226, 226];
               }
               
               if (colName !== 'No' && colName !== 'Nama' && cellData && cellData !== '-') {
                  if (cellData.status === 'hadir') {
                     data.cell.styles.textColor = [37, 99, 235];
                  } else if (cellData.status === 'izin') {
                     data.cell.styles.fillColor = [251, 191, 36];
                     data.cell.styles.textColor = [255, 255, 255];
                     data.cell.styles.fontStyle = 'bold';
                  } else if (cellData.status === 'sakit') {
                     data.cell.styles.fillColor = [239, 68, 68];
                     data.cell.styles.textColor = [255, 255, 255];
                     data.cell.styles.fontStyle = 'bold';
                  }
               }
            }
         }
       });
    };

    drawTable(exportPreviewData.columns, exportPreviewData.rows, startY);

    doc.save(`Laporan_Kehadiran_${laporanTipe}.pdf`);
  }

  const exportToWord = () => {
    let tableHTML = document.getElementById('export-preview-container').outerHTML;
    tableHTML = tableHTML.replace(/\n/g, '<br>');
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' 
      xmlns:w='urn:schemas-microsoft-com:office:word' 
      xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Laporan Absensi</title>
        <style>
          @page WordSection1 { size: 841.95pt 595.35pt; mso-page-orientation: landscape; margin: 36.0pt; }
          div.WordSection1 { page: WordSection1; }
          table { width: 100%; border-collapse: collapse; font-size: ${exportFontSize}pt; }
          td, th { border: 1px solid #000; padding: 2px; text-align: center; vertical-align: middle; }
        </style>
      </head>
      <body>
        <div class="WordSection1">`;
    const footer = "</div></body></html>";
    const sourceHTML = header + tableHTML + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    saveAs(blob, `Laporan_Kehadiran_${laporanTipe}.doc`);
  }

  const getFilteredAndSortedData = () => {
    let result = absensiData.filter(a => {
      const name = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      return name.includes(searchTerm.toLowerCase())
    })
    result.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.waktu_masuk) - new Date(a.waktu_masuk)
      if (sortOrder === 'oldest') return new Date(a.waktu_masuk) - new Date(b.waktu_masuk)
      const nameA = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      const nameB = (b.profiles?.full_name || b.profiles?.email || '').toLowerCase()
      if (sortOrder === 'name-asc') return nameA.localeCompare(nameB)
      if (sortOrder === 'name-desc') return nameB.localeCompare(nameA)
      return 0
    })
    return result
  }

  const getFilteredPegawai = () => {
    let result = pegawaiData.filter(p => {
      const name = (p.full_name || p.email || '').toLowerCase()
      return name.includes(pegawaiSearch.toLowerCase())
    })
    result.sort((a, b) => {
      const nameA = (a.full_name || a.email || '').toLowerCase()
      const nameB = (b.full_name || b.email || '').toLowerCase()
      if (pegawaiSort === 'name-asc') return nameA.localeCompare(nameB)
      if (pegawaiSort === 'name-desc') return nameB.localeCompare(nameA)
      if (pegawaiSort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      return 0
    })
    return result
  }

  const filteredAbsensi = getFilteredAndSortedData()
  const filteredPegawai = getFilteredPegawai()

  return (
    <div className="admin-desktop-layout">
      {/* 💻 Desktop Fixed Sidebar Navigation */}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div>
          {/* Logo & Info Sekolah */}
          <div style={{ padding: '1.25rem 1.25rem 1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: logoSekolah ? 'transparent' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
                {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <img src="/panrita_logo.webp" alt="GammaraApp" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{namaSekolah}</h4>
                <span style={{ fontSize: '0.72rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', fontWeight: '500' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }}></span> Portal Kepala Sekolah
                </span>
              </div>
            </div>
            {/* GammaraApp Brand Tagline */}
            <div style={{ background: 'var(--surface)', padding: '0.45rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div className="gammara-logo" style={{ fontSize: '15px' }}>
                <span className="gammara">Gammara</span><span className="app">App</span>
              </div>
              <div className="logo-description" style={{ fontSize: '10px', marginTop: '2px' }}>
                Sistem Manajemen Sekolah Terpadu
              </div>
            </div>
          </div>

          {/* Menu Items Vertikal */}
          <nav className="admin-sidebar-nav">
            <button className={`admin-nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => { handleMenuClick('overview'); setIsSidebarOpen(false); }}>
              <Activity size={18} />
              <span>Ringkasan (Overview)</span>
            </button>
            <button className={`admin-nav-item ${activeTab === 'pegawai' ? 'active' : ''}`} onClick={() => { handleMenuClick('pegawai'); setIsSidebarOpen(false); }}>
              <Users size={18} />
              <span>Data Pegawai / Guru</span>
            </button>
            
            <button className={`admin-nav-item ${activeTab === 'kbm' ? 'active' : ''}`} onClick={() => { handleMenuClick('kbm'); setIsSidebarOpen(false); }}>
              <BookOpen size={18} />
              <span>Sistem Pembelajaran (KBM)</span>
            </button>
            <button className={`admin-nav-item ${activeTab === 'laporan' ? 'active' : ''}`} onClick={() => { handleMenuClick('laporan'); setIsSidebarOpen(false); }}>
              <FileText size={18} />
              <span>Rekap Presensi & Ekspor</span>
            </button>
            <button className={`admin-nav-item ${activeTab === 'pengumuman' ? 'active' : ''}`} onClick={() => { handleMenuClick('pengumuman'); setIsSidebarOpen(false); }}>
              <Bell size={18} />
              <span>Pengumuman Sekolah</span>
            </button>
            <button className={`admin-nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} onClick={() => { handleMenuClick('pengaturan'); setIsSidebarOpen(false); }}>
              <Settings size={18} />
              <span>Pengaturan & Geofencing</span>
            </button>
          </nav>
        </div>

        {/* Footer Sidebar (Akun Admin) */}
        <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--surface)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <UserCircle size={22} color="var(--primary)" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{admin?.full_name || admin?.email?.split('@')[0] || 'Kepala Sekolah'}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Kepala Sekolah</div>
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut().then(() => navigate('/'))} title="Keluar" style={{ background: '#FEE2E2', border: 'none', color: '#EF4444', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop saat sidebar drawer mobile aktif */}
      {isSidebarOpen && (
        <div onClick={() => setIsSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 45 }} />
      )}

      {/* 🖥️ Main Desktop Content */}
      <div className="admin-main" style={{ paddingBottom: !isDesktop ? '90px' : '2rem' }}>
        {/* Header ID Card khusus Mobile (APK & Mobile Browser) */}
        {!isDesktop && (
          <div className="card-gradient no-print" style={{ padding: '1.15rem 1.25rem 0.85rem 1.25rem', borderRadius: '0 0 20px 20px', marginBottom: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.18)', padding: '0.2rem 0.65rem', borderRadius: '9999px', backdropFilter: 'blur(8px)' }}>
              <img src={logoSekolah || "/panrita_logo.webp"} alt="Logo" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
              <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'white', letterSpacing: '-0.02em' }}>{logoSekolah ? namaSekolah : 'GammaraApp'}</span>
            </div>
            <div className="flex justify-between items-center mb-2.5">
              <div className="flex items-center gap-3">
                {admin?.foto_profil ? (
                  <img src={admin.foto_profil} alt="Profil" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)', background: 'white', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserCircle size={28} color="var(--primary)" />
                  </div>
                )}
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: '0.75rem', marginBottom: '0px', lineHeight: 1.2 }}>{getGreeting()},</p>
                  <h2 style={{ fontSize: '1.05rem', margin: '2px 0 0 0', fontWeight: '700', letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px', lineHeight: 1.2 }}>
                    {admin?.full_name || 'Kepala Sekolah'}
                  </h2>
                  <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '6px', fontWeight: 'bold', textTransform: 'uppercase', color: '#E0E7FF' }}>
                    Kepala Sekolah
                  </span>
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
                </button>
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  title="Menu Navigasi"
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
                    cursor: 'pointer'
                  }}
                >
                  <Menu size={18} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.15)', padding: '0.45rem 0.85rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
              <div className="flex items-center gap-2">
                <Clock size={16} />
                <span style={{ fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.5px' }}>
                  {currentTime.toLocaleTimeString('id-ID')}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: '500', opacity: 0.9 }}>
                {currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
        )}

        {/* Peringatan Akses Lintas Perangkat (Android di iPhone / iPhone di Android) */}
        {!crossDeviceStatus.allowed && (
          <div style={{ margin: '1rem', padding: '1rem 1.25rem', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', color: '#991B1B' }}>
            <AlertCircle size={28} color="#DC2626" style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Peringatan Akses Perangkat</h4>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{crossDeviceStatus.message}</p>
            </div>
          </div>
        )}

        {/* Topbar Header Desktop (Hanya muncul jika Desktop) */}
        {isDesktop && (
          <header className="admin-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mobile-toggle-btn" style={{ background: 'transparent', border: '1px solid var(--border)', padding: '0.45rem', borderRadius: '8px', cursor: 'pointer', display: 'none' }}>
                <Menu size={20} />
              </button>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                  {activeTab === 'overview' && 'Ringkasan Kehadiran & Aktivitas'}
                  {activeTab === 'absensi' && 'Presensi Mandiri Kepala Sekolah'}
                  {activeTab === 'riwayat' && 'Riwayat Kehadiran Kepala Sekolah'}
                  {activeTab === 'pegawai' && 'Manajemen Data Pegawai & Guru'}
                  {activeTab === 'kbm' && 'Sistem Pembelajaran Terpadu (KBM, Nilai, Jurnal & Rekap)'}
                  {activeTab === 'laporan' && 'Laporan & Rekapitulasi Presensi'}
                  {activeTab === 'pengumuman' && 'Pusat Pengumuman & Notifikasi'}
                  {activeTab === 'pengaturan' && 'Pengaturan Sekolah & Validasi GPS (Geofencing)'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sistem Presensi Guru & Tenaga Kependidikan {namaSekolah} • GammaraApp
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {admin?.isDeveloperPreview && (
                <button
                  onClick={() => navigate('/pengembang')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#071C35',
                    color: '#00B4D8',
                    border: '1.5px solid #00B4D8',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0, 180, 216, 0.3)'
                  }}
                >
                  <span>⚙️ Mode Super Admin (Kembali)</span>
                </button>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', padding: '0.45rem 0.85rem', borderRadius: '12px', fontSize: '0.85rem' }}>
                <Clock size={16} color="var(--primary)" />
                <span style={{ fontWeight: '600' }}>{currentTime.toLocaleTimeString('id-ID')}</span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span style={{ color: 'var(--text-muted)' }}>{currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>

              <button
                onClick={toggleTheme}
                title={darkMode ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {darkMode ? <Sun size={20} color="#FBBF24" /> : <Moon size={20} color="#4F46E5" />}
              </button>
            </div>
          </header>
        )}

        {/* Content Canvas */}
        <main className="admin-content">
          {/* Tab Presensi Mandiri Pimpinan */}
          {activeTab === 'absensi' && (() => {
            const platformCheck = verifyAttendancePlatform(admin, isIncognito)

            return (
              <div className="fade-in text-center" style={{ maxWidth: '480px', margin: '0 auto', padding: '1rem 0' }}>
                {!isHoliday && !platformCheck.allowed && (
                  platformCheck.platform === 'incognito_blocked' ? (
                    <div style={{ margin: '1rem auto', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '16px', padding: '1.25rem', color: '#92400E', textAlign: 'center' }}>
                      <AlertTriangle size={36} color="#D97706" style={{ margin: '0 auto 0.5rem auto' }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Mode Tab Samaran Terdeteksi</h4>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{platformCheck.message}</p>
                    </div>
                  ) : platformCheck.platform === 'cross_device_blocked' ? (
                    <div style={{ margin: '1rem auto', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '16px', padding: '1.25rem', color: '#991B1B', textAlign: 'center' }}>
                      <AlertCircle size={36} color="#DC2626" style={{ margin: '0 auto 0.5rem auto' }} />
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Akses Perangkat Ditolak</h4>
                      <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{platformCheck.message}</p>
                    </div>
                  ) : (
                    <PresensiOnlyApkNotice />
                  )
                )}

                {!isHoliday && platformCheck.allowed && (
                  <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Sentuh tombol di bawah untuk absensi</p>
                )}

                {isHoliday ? (
                  <div className="card" style={{ padding: '2rem', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', marginTop: '1rem' }}>
                    <Calendar size={48} style={{ margin: '0 auto 1rem auto' }} />
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Hari Libur</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>{holidayReason}</p>
                    <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.85rem' }}>Anda tidak perlu melakukan presensi hari ini. Selamat beristirahat!</p>
                  </div>
                ) : !kepsekHasCheckedIn ? (
                  platformCheck.allowed ? (
                    <>
                      <button className="btn-clock" onClick={() => handleKepsekAbsen('masuk')} disabled={kepsekAbsenLoading} style={{ marginBottom: '1.5rem' }}>
                        <Fingerprint size={48} strokeWidth={1.5} />
                        <span>Clock In</span>
                      </button>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.25fr', gap: '0.65rem', justifyContent: 'center', marginTop: '1rem', maxWidth: '380px', margin: '1rem auto 0 auto' }}>
                        <button onClick={() => { setKepsekIzinMode('sakit'); setShowTugasLuarModal(false); }} className="btn" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem' }}>Sakit</button>
                        <button onClick={() => { setKepsekIzinMode('izin'); setShowTugasLuarModal(false); }} className="btn" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem' }}>Izin</button>
                        <button onClick={() => { setShowTugasLuarModal(true); setKepsekIzinMode(null); }} className="btn" style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #93C5FD', padding: '0.75rem 0.5rem', fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                          <Briefcase size={15} /> Tugas Luar
                        </button>
                      </div>
                    </>
                  ) : null
                ) : (kepsekTodayStatus === 'sakit' || kepsekTodayStatus === 'izin') ? (
                  <div className="card" style={{ padding: '2rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>
                    <CheckCircle2 size={48} style={{ margin: '0 auto 1rem auto' }} />
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Anda Terdaftar {kepsekTodayStatus.toUpperCase()}</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>Semoga lekas membaik dan hari Anda menyenangkan. Anda tidak perlu Clock Out hari ini.</p>
                  </div>
                ) : kepsekTodayAbsensi?.waktu_pulang ? (
                  <div className="card" style={{ padding: '1.5rem', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', textAlign: 'center' }}>
                    <CheckCircle2 size={44} style={{ margin: '0 auto 0.75rem auto', color: '#16A34A' }} />
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.35rem', fontWeight: 'bold' }}>
                      {kepsekTodayAbsensi.keterangan?.includes('Tugas Luar') ? 'Presensi Tugas Luar Selesai' : 'Presensi Hari Ini Selesai'}
                    </h3>
                    <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#15803D' }}>
                      Anda terdaftar <strong>HADIR</strong> untuk hari ini.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', background: 'white', padding: '0.75rem 1rem', borderRadius: '14px', border: '1px solid #DCFCE7', marginBottom: '1rem', maxWidth: '320px', margin: '0 auto 1rem auto' }}>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 'bold' }}>JAM MASUK</div>
                        <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#059669' }}>
                          {kepsekTodayAbsensi.waktu_masuk ? new Date(kepsekTodayAbsensi.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '07.00'}
                        </div>
                      </div>
                      <div style={{ borderLeft: '1px solid #E5E7EB' }}></div>
                      <div>
                        <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: 'bold' }}>JAM PULANG</div>
                        <div style={{ fontWeight: '800', fontSize: '1.05rem', color: '#D97706' }}>
                          {kepsekTodayAbsensi.waktu_pulang ? new Date(kepsekTodayAbsensi.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '14.00'}
                        </div>
                      </div>
                    </div>
                    {kepsekTodayAbsensi.keterangan && (
                      <div style={{ textAlign: 'left', background: 'white', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #DCFCE7', fontSize: '0.85rem', color: '#374151', margin: '0 auto 1rem auto', maxWidth: '380px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4B5563', marginBottom: '0.2rem' }}>Catatan Tugas / Keterangan:</div>
                        <div>{kepsekTodayAbsensi.keterangan}</div>
                      </div>
                    )}
                    {getStoredPhotoForToday() && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4B5563', marginBottom: '0.4rem' }}>Dokumentasi Timemark Tugas Luar:</div>
                        <img src={getStoredPhotoForToday()} alt="Bukti Tugas Luar" style={{ maxHeight: '180px', width: 'auto', maxWidth: '100%', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 4px 10px rgba(0,0,0,0.08)', margin: '0 auto', display: 'block' }} />
                      </div>
                    )}
                  </div>
                ) : platformCheck.allowed ? (
                  <button className="btn-clock out" onClick={() => handleKepsekAbsen('pulang')} disabled={kepsekAbsenLoading}>
                    <Fingerprint size={48} strokeWidth={1.5} />
                    <span>Clock Out</span>
                  </button>
                ) : null}

                {kepsekIzinMode && (
                  <div className="card" style={{ marginTop: '2rem', textAlign: 'left' }}>
                    <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Form {kepsekIzinMode === 'sakit' ? 'Sakit' : 'Izin'}</h4>
                    <textarea className="input" rows="3" placeholder="Masukkan keterangan..." value={kepsekKeterangan} onChange={e => setKepsekKeterangan(e.target.value)} style={{ marginBottom: '1rem' }} />
                    <div className="flex gap-2">
                      <button onClick={() => setKepsekIzinMode(null)} className="btn" style={{ background: '#E2E8F0', flex: 1 }}>Batal</button>
                      <button onClick={() => handleKepsekAbsen(kepsekIzinMode)} disabled={kepsekAbsenLoading} className="btn btn-primary" style={{ flex: 1 }}>Kirim</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Modal Form Tugas Luar */}
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
                  💡 <strong>Ketentuan:</strong> Form khusus pimpinan bertugas di luar/kedinasan. Setelah dikirim, Anda langsung tercatat <strong>HADIR</strong> lengkap masuk (07:00) dan pulang (14:00) tanpa batas radius sekolah.
                </div>

                {/* Foto Timemark */}
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
                        <Camera size={16} /> Kamera GTag
                      </button>

                      <label
                        htmlFor="upload-tugas-luar-file-kepsek"
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
                        id="upload-tugas-luar-file-kepsek"
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

                {/* Catatan / Keterangan */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.4rem', display: 'block', color: '#334155' }}>
                    Catatan / Rincian Pelatihan & Tugas: <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    className="input"
                    rows="3"
                    placeholder="Contoh: Rapat Koordinasi MKKS di Balai Penjaminan Mutu Pendidikan..."
                    value={tugasLuarCatatan}
                    onChange={(e) => setTugasLuarCatatan(e.target.value)}
                    style={{ width: '100%', borderRadius: '12px', border: '1px solid #CBD5E1', padding: '0.75rem', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowTugasLuarModal(false)}
                    className="btn"
                    style={{ flex: 1, background: '#F1F5F9', color: '#64748B', border: 'none', padding: '0.75rem', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}
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
                    disabled={kepsekAbsenLoading}
                  >
                    {kepsekAbsenLoading ? (
                      <>
                        <RefreshCw size={16} className="spin" /> Memproses...
                      </>
                    ) : (
                      <>
                        <Check size={18} /> Kirim Presensi
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="fade-in">
              {/* Kartu Presensi Mandiri Khusus Kepala Sekolah / Admin (Muncul di Desktop) */}
              {(admin?.role === 'kepsek' || admin?.role === 'admin') && isDesktop && (
                <div className="card mb-6" style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)', color: 'white', border: 'none', borderRadius: '22px', padding: '1.5rem', boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck size={28} color="#A5B4FC" />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#C7D2FE', fontWeight: 'bold' }}>Presensi Mandiri Pimpinan</span>
                        <h3 style={{ margin: '2px 0 0 0', fontSize: '1.15rem', color: 'white' }}>{admin?.full_name || 'Kepala Sekolah'}</h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#E0E7FF' }}>
                          Status Hari Ini: {kepsekTodayAbsensi ? `Tercatat Hadir (Masuk: ${kepsekTodayAbsensi.waktu_masuk ? new Date(kepsekTodayAbsensi.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'})` : 'Belum Melakukan Presensi'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {(() => {
                        const platformCheck = verifyAttendancePlatform(admin, isIncognito)
                        if (!platformCheck.allowed) {
                          if (platformCheck.platform === 'incognito_blocked') {
                            return (
                              <div style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #F59E0B', borderRadius: '12px', padding: '0.65rem 1rem', color: '#FEF3C7', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                                <AlertTriangle size={18} color="#FBBF24" />
                                <span>Tab Samaran: Tidak bisa presensi</span>
                              </div>
                            )
                          }
                          if (platformCheck.platform === 'cross_device_blocked') {
                            return (
                              <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #EF4444', borderRadius: '12px', padding: '0.65rem 1rem', color: '#FEE2E2', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                                <AlertCircle size={18} color="#F87171" />
                                <span>Akses Perangkat Ditolak</span>
                              </div>
                            )
                          }
                          return <PresensiOnlyApkNotice style={{ margin: 0, padding: '0.85rem 1.25rem', width: '100%', maxWidth: '340px' }} />
                        }

                        return (
                          <>
                            {!kepsekHasCheckedIn ? (
                              <button
                                onClick={() => handleKepsekAbsen('masuk')}
                                disabled={kepsekAbsenLoading}
                                className="btn"
                                style={{ background: '#10B981', color: 'white', border: 'none', padding: '0.75rem 1.25rem', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)' }}
                              >
                                <Fingerprint size={18} />
                                <span>Clock In Saya</span>
                              </button>
                            ) : !kepsekTodayAbsensi?.waktu_pulang ? (
                              <button
                                onClick={() => handleKepsekAbsen('pulang')}
                                disabled={kepsekAbsenLoading}
                                className="btn"
                                style={{ background: '#F59E0B', color: 'white', border: 'none', padding: '0.75rem 1.25rem', borderRadius: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)' }}
                              >
                                <Fingerprint size={18} />
                                <span>Clock Out Saya</span>
                              </button>
                            ) : (
                              <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.6rem 1rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle2 size={18} />
                                <span>Presensi Hari Ini Lengkap</span>
                              </div>
                            )}

                            <button
                              onClick={() => setShowCameraModal(true)}
                              title="Kamera Timemark"
                              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: 'white', padding: '0.75rem', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Camera size={18} />
                            </button>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Real-time Dashboard Metrics (Lega 4 Kolom di Monitor Laptop) */}
              <h3 style={{ marginBottom: '1rem', fontSize: '1.15rem' }}>Kehadiran Guru Hari Ini</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                 <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.12)' }}>
                    <Activity size={28} color="#10B981" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#10B981', margin: '0 0 0.25rem 0' }}>{overviewStats.hadir}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>HADIR HARI INI</p>
                 </div>
                 <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.12)' }}>
                    <XCircle size={28} color="#EF4444" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#EF4444', margin: '0 0 0.25rem 0' }}>{overviewStats.tidakHadir}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>IZIN / SAKIT</p>
                 </div>
                 <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.12)' }}>
                    <Users size={28} color="#4F46E5" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#4F46E5', margin: '0 0 0.25rem 0' }}>{pegawaiData.length}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>TOTAL PEGAWAI</p>
                 </div>
                 <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.12)' }}>
                    <MapPin size={28} color={geofenceEnabled ? "#10B981" : "#F59E0B"} style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.3rem', color: geofenceEnabled ? "#10B981" : "#F59E0B", margin: '0.25rem 0' }}>{geofenceEnabled ? `${schoolRadius} Meter` : 'Non-Aktif'}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>GEOFENCING GPS</p>
                 </div>
              </div>

              <h3 style={{ marginBottom: '1rem', fontSize: '1.15rem' }}>Menu Akses Cepat</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                <div onClick={() => handleMenuClick('pegawai')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Users size={32} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600' }}>Data Pegawai</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Kelola profil & data guru</p>
                </div>
                <div onClick={() => handleMenuClick('laporan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <FileText size={32} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600' }}>Laporan & Rekap</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Unduh berkas Excel, PDF, Word</p>
                </div>
                <div onClick={() => handleMenuClick('pengumuman')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Bell size={32} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600' }}>Pengumuman Sekolah</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Kirim broadcast pesan ke guru</p>
                </div>
                <div onClick={() => handleMenuClick('kbm')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #0284C7 0%, #38BDF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <BookOpen size={32} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600' }}>Sistem Pembelajaran</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Jurnal, Nilai, Presensi Siswa & Rekap</p>
                </div>
                <div onClick={() => handleMenuClick('pengaturan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Settings size={32} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: '600' }}>Pengaturan & GPS</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Lokasi peta radius & hari kerja</p>
                </div>
              </div>
            </div>
          )}

        {activeTab === 'pegawai' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Daftar Pegawai</h3>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ position: 'relative' }}>
                   <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <input type="text" className="input" placeholder="Cari nama guru..." value={pegawaiSearch} onChange={(e) => setPegawaiSearch(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', fontSize: '0.9rem' }} />
                </div>
                <div style={{ position: 'relative' }}>
                   <ArrowUpDown size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <select className="input" value={pegawaiSort} onChange={(e) => setPegawaiSort(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', appearance: 'none', fontSize: '0.9rem' }}>
                      <option value="name-asc">Nama (A - Z)</option>
                      <option value="name-desc">Nama (Z - A)</option>
                      <option value="newest">Terbaru Ditambahkan</option>
                   </select>
                </div>
             </div>

             {loadingData ? <p className="text-center text-muted">Memuat data...</p> : (
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                 {filteredPegawai.length === 0 && <p className="text-center text-muted">Tidak ada pegawai.</p>}
                  {filteredPegawai.map(p => {
                    const isKepsek = p.role === 'kepsek' || p.penugasan_tipe === 'kepsek';
                    const isAdmin = p.role === 'admin' || p.penugasan_tipe === 'admin';
                    const guruTipe = localStorage.getItem(`guru_tipe_${p.id}`) || p.penugasan_tipe || p.role;
                    const isTendik = !isKepsek && !isAdmin && (guruTipe === 'tendik' || p.role === 'tendik' || p.penugasan_tipe === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(p.jabatan));
                    const isMapel = !isKepsek && !isAdmin && !isTendik && (guruTipe === 'guru_mapel' || p.role === 'guru_mapel');
                    return (
                      <div key={p.id} className="card flex items-center justify-between" style={{ padding: '1rem 1.25rem', border: 'none', borderRadius: '18px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                        <div className="flex gap-3 items-center" style={{ minWidth: 0, flex: 1 }}>
                          {p.foto_profil ? <img src={p.foto_profil} style={{ width:'42px', height:'42px', borderRadius:'50%', objectFit:'cover', flexShrink: 0 }} /> : <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UserCircle size={24} color="var(--text-muted)" /></div>}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600' }}>{p.full_name || p.email}</h4>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: '700',
                                padding: '2px 7px',
                                borderRadius: '8px',
                                background: isKepsek ? '#FEF3C7' : (isAdmin ? '#EDE9FE' : (isTendik ? '#E0F2FE' : (isMapel ? '#EEF2FF' : '#ECFDF5'))),
                                color: isKepsek ? '#B45309' : (isAdmin ? '#6D28D9' : (isTendik ? '#0369A1' : (isMapel ? '#4F46E5' : '#059669'))),
                                border: `1px solid ${isKepsek ? '#FDE68A' : (isAdmin ? '#DDD6FE' : (isTendik ? '#BAE6FD' : (isMapel ? '#C7D2FE' : '#A7F3D0')))}`
                              }}>
                                {isKepsek ? 'Kepala Sekolah' : (isAdmin ? 'Administrator' : (isTendik ? (p.jabatan || 'Tendik') : (isMapel ? 'Guru Mapel' : 'Guru Kelas')))}
                              </span>
                              {(() => {
                                const tipePerangkat = p.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${p.id}`) || 'android'
                                return (
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                    padding: '2px 7px',
                                    borderRadius: '8px',
                                    background: tipePerangkat === 'iphone' ? '#F3E8FF' : '#F1F5F9',
                                    color: tipePerangkat === 'iphone' ? '#7E22CE' : '#475569',
                                    border: `1px solid ${tipePerangkat === 'iphone' ? '#D8B4FE' : '#CBD5E1'}`
                                  }}>
                                    {tipePerangkat === 'iphone' ? '🍏 iPhone' : '📱 Android'}
                                  </span>
                                )
                              })()}
                            </div>
                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{p.jabatan || 'Pegawai'} {p.nip && `• NIP: ${p.nip}`}</p>
                            {isMapel && (p.mata_pelajaran || localStorage.getItem(`guru_mapel_${p.id}`)) && (
                              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#6366F1', fontWeight: '600' }}>
                                Mapel: {p.mata_pelajaran || localStorage.getItem(`guru_mapel_${p.id}`)}
                              </p>
                            )}
                            {(() => {
                              const assigned = JSON.parse(localStorage.getItem(`guru_assigned_classes_${p.id}`) || '[]')
                              if (assigned.length > 0) {
                                const names = kbmClasses.filter(c => assigned.includes(c.id)).map(c => c.name).join(', ')
                                return (
                                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#059669', fontWeight: '600' }}>
                                    Kelas Diampu: {names || `${assigned.length} Kelas`}
                                  </p>
                                )
                              }
                              return null
                            })()}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {(() => {
                            const b = deviceBindings[p.id]
                            if (b && b.deviceId) {
                              return (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const teacherName = p.full_name || p.email
                                    if (window.confirm(`Reset kunci HP untuk ${teacherName}? Guru ini akan bisa mendaftarkan HP barunya saat presensi berikutnya.`)) {
                                      const ok = await resetDeviceBinding({ userId: p.id, supabase })
                                      if (ok) {
                                        setDeviceBindings(prev => {
                                          const copy = { ...prev }
                                          delete copy[p.id]
                                          return copy
                                        })
                                        alert(`Kunci HP untuk ${teacherName} berhasil di-reset!`)
                                      } else {
                                        alert("Gagal mereset kunci HP.")
                                      }
                                    }
                                  }}
                                  title={`Terkunci di: ${b.deviceName || 'HP Guru'}. Klik untuk reset kunci jika guru ganti HP.`}
                                  style={{
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '10px',
                                    background: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    color: '#DC2626',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  <Fingerprint size={12} />
                                  <span>Reset HP</span>
                                </button>
                              )
                            }
                            return (
                              <span 
                                title="Akun ini belum terikat ke HP manapun. Akan otomatis terkunci ke HP pertama saat guru presensi."
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#94A3B8',
                                  background: '#F8FAFC',
                                  border: '1px solid #E2E8F0',
                                  padding: '0.4rem 0.55rem',
                                  borderRadius: '8px',
                                  fontWeight: '600'
                                }}
                              >
                                HP Terbuka
                              </span>
                            )
                          })()}

                          <button
                            type="button"
                            onClick={() => setEditingPegawai(p)}
                            style={{
                              padding: '0.45rem 0.65rem',
                              borderRadius: '10px',
                              background: '#F1F5F9',
                              border: '1px solid #E2E8F0',
                              color: '#475569',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              flexShrink: 0
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Atur</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
               </div>
             )}

              {/* MODAL EDIT PENUGASAN PEGAWAI OLEH ADMIN */}
              {editingPegawai && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1rem',
                  zIndex: 9999
                }}>
                  <div className="card" style={{ maxWidth: '460px', width: '100%', background: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 'bold' }}>Atur Peran & Mapel Guru</h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{editingPegawai.full_name || editingPegawai.email}</p>
                      </div>
                      <button onClick={() => setEditingPegawai(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                        <X size={20} />
                      </button>
                    </div>

                    <form onSubmit={async (e) => {
                      e.preventDefault()
                      setSavingPegawai(true)
                      const formData = new FormData(e.target)
                      const newRole = formData.get('role')
                      const newMapel = newRole === 'guru_mapel' ? (formData.get('mata_pelajaran') || '') : ''
                      const tendikJabatan = formData.get('tendik_jabatan')
                      let newJabatan = formData.get('jabatan') || editingPegawai.jabatan

                      let formattedJabatan = newJabatan;
                      if (newRole === 'tendik') {
                        formattedJabatan = tendikJabatan || 'Operator Dapodik';
                      } else if (newRole === 'guru_mapel' && newMapel) {
                        formattedJabatan = `Guru ${newMapel} • ${newJabatan || 'Guru Mapel'}`;
                      }

                      // Ambil assigned_classes dari formData
                      const assignedClasses = newRole === 'tendik' ? [] : formData.getAll('assigned_classes')
                      localStorage.setItem(`guru_assigned_classes_${editingPegawai.id}`, JSON.stringify(assignedClasses))

                      // Simpan tipe penugasan di localStorage
                      localStorage.setItem(`guru_tipe_${editingPegawai.id}`, newRole)
                      if (newRole === 'tendik') {
                        const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(formattedJabatan)
                        localStorage.setItem(`tendik_kategori_${editingPegawai.id}`, isNonOp ? 'non_operator' : 'operator')
                        localStorage.setItem(`tendik_penugasan_${editingPegawai.id}`, formattedJabatan)
                      }

                      const newTipePerangkat = formData.get('tipe_perangkat') || 'android'
                      localStorage.setItem(`guru_tipe_perangkat_${editingPegawai.id}`, newTipePerangkat)

                      // Simpan ke Cloud Supabase agar otomatis tersinkron ke semua perangkat guru
                      await saveTeacherAssignmentToCloud({
                        teacherId: editingPegawai.id,
                        tipe: newRole,
                        mapel: newMapel,
                        jabatan: formattedJabatan,
                        assignedClasses: assignedClasses,
                        tipe_perangkat: newTipePerangkat,
                        supabase
                      })

                      // Update profil di database (tanpa mengubah role utama agar tidak melanggar profiles_role_check)
                      let { error } = await supabase.from('profiles').update({
                        jabatan: formattedJabatan
                      }).eq('id', editingPegawai.id)

                      if (!error) {
                        // Simpan juga mapel guru ke penyimpanan lokal/state agar dashboard langsung sinkron
                        localStorage.setItem(`guru_mapel_${editingPegawai.id}`, newMapel)
                        setPegawaiData(prev => prev.map(item => item.id === editingPegawai.id ? { 
                          ...item, 
                          penugasan_tipe: newRole, 
                          mata_pelajaran: newMapel, 
                          jabatan: formattedJabatan,
                          tipe_perangkat: newTipePerangkat
                        } : item))
                        setEditingPegawai(null)
                        loadKbmClasses()
                        alert("Penugasan guru berhasil diperbarui!")
                      } else {
                        alert("Gagal memperbarui: " + error.message)
                      }
                      setSavingPegawai(false)
                    }}>
                      <div className="input-group" style={{ marginBottom: '1rem' }}>
                        <label className="input-label">Peran Penugasan</label>
                        <select 
                          name="role" 
                          className="input" 
                          defaultValue={localStorage.getItem(`guru_tipe_${editingPegawai.id}`) || (editingPegawai.penugasan_tipe === 'guru_mapel' || editingPegawai.role === 'guru_mapel' ? 'guru_mapel' : (editingPegawai.role === 'tendik' || editingPegawai.penugasan_tipe === 'tendik' ? 'tendik' : 'guru_kelas'))}
                          onChange={(e) => {
                            const mapelBox = document.getElementById('admin-edit-mapel-box')
                            const classBox = document.getElementById('admin-edit-class-box')
                            const tendikBox = document.getElementById('admin-edit-tendik-box')
                            if (mapelBox) mapelBox.style.display = e.target.value === 'guru_mapel' ? 'block' : 'none'
                            if (classBox) classBox.style.display = e.target.value === 'tendik' ? 'none' : 'block'
                            if (tendikBox) tendikBox.style.display = e.target.value === 'tendik' ? 'block' : 'none'
                          }}
                        >
                          <option value="guru_kelas">Guru Kelas (Wali Kelas)</option>
                          <option value="guru_mapel">Guru Mata Pelajaran (Bidang Studi)</option>
                          <option value="tendik">Tenaga Kependidikan (Tendik)</option>
                        </select>
                      </div>

                      <div 
                        id="admin-edit-tendik-box" 
                        className="input-group" 
                        style={{ 
                          marginBottom: '1rem', 
                          display: (editingPegawai.role === 'tendik' || editingPegawai.penugasan_tipe === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(editingPegawai.jabatan)) ? 'block' : 'none',
                          background: '#F0F9FF',
                          padding: '0.85rem',
                          borderRadius: '14px',
                          border: '1.5px solid #BAE6FD'
                        }}
                      >
                        <label className="input-label" style={{ color: '#0369A1', fontWeight: 800 }}>Tugas & Jabatan Tendik</label>
                        <select 
                          name="tendik_jabatan" 
                          className="input" 
                          defaultValue={editingPegawai.jabatan || 'Operator Dapodik'}
                          style={{ fontWeight: 700 }}
                        >
                          <optgroup label="Akun Operator (Presensi & Master KBM)">
                            <option value="Operator Dapodik">💻 Operator Dapodik</option>
                            <option value="Operator Sekolah">🖥️ Operator Sekolah</option>
                          </optgroup>
                          <optgroup label="Akun Non-Operator (Presensi & Tambah/Hapus Siswa)">
                            <option value="Pustakawan">📚 Pustakawan</option>
                            <option value="Bujang">🧹 Bujang (Kebersihan / Pelaksana)</option>
                            <option value="Satpam">🛡️ Satpam (Keamanan)</option>
                          </optgroup>
                        </select>
                        <small style={{ fontSize: '0.72rem', color: '#0284C7', marginTop: '4px', display: 'block' }}>
                          *Tendik tidak perlu memilih kelas binaan rombel.
                        </small>
                      </div>

                      <div 
                        id="admin-edit-mapel-box" 
                        className="input-group" 
                        style={{ marginBottom: '1rem', display: editingPegawai.role === 'guru_mapel' ? 'block' : 'none' }}
                      >
                        <label className="input-label">Mata Pelajaran yang Diampu</label>
                        <select 
                          name="mata_pelajaran" 
                          className="input" 
                          defaultValue={editingPegawai.mata_pelajaran || localStorage.getItem(`guru_mapel_${editingPegawai.id}`) || ''}
                        >
                          <option value="">-- Pilih Mata Pelajaran --</option>
                          {getCustomSubjects().map(sub => (
                            <option key={sub} value={sub}>{sub}</option>
                          ))}
                        </select>
                      </div>

                      {/* Penugasan Kelas / Rombel */}
                      <div 
                        id="admin-edit-class-box" 
                        className="input-group" 
                        style={{ 
                          marginBottom: '1rem',
                          display: (editingPegawai.role === 'tendik' || editingPegawai.penugasan_tipe === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(editingPegawai.jabatan)) ? 'none' : 'block'
                        }}
                      >
                        <label className="input-label">Penugasan Kelas / Rombel</label>
                        {(() => {
                          const savedAssigned = JSON.parse(localStorage.getItem(`guru_assigned_classes_${editingPegawai.id}`) || '[]')
                          return (
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '6px' }}>
                                Centang kelas yang diampu oleh guru ini:
                              </div>
                              <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#F8FAFC', padding: '0.65rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {kbmClasses.length === 0 ? (
                                  <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Belum ada kelas rombel dibuat di Master KBM.</span>
                                ) : (
                                  kbmClasses.map(cls => (
                                    <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                      <input 
                                        type="checkbox" 
                                        name="assigned_classes" 
                                        value={cls.id} 
                                        defaultChecked={savedAssigned.includes(cls.id)}
                                        style={{ width: '16px', height: '16px' }} 
                                      />
                                      <span style={{ fontWeight: '600', color: '#1E293B' }}>{cls.name}</span>
                                    </label>
                                  ))
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                        <label className="input-label">Jabatan Struktural / Keterangan</label>
                        <input 
                          type="text" 
                          name="jabatan" 
                          className="input" 
                          defaultValue={editingPegawai.jabatan || ''} 
                          placeholder="Contoh: Guru PJOK / Wali Kelas IV-A" 
                        />
                      </div>

                      <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                        <label className="input-label">Tipe Perangkat Presensi Guru</label>
                        <select 
                          name="tipe_perangkat" 
                          className="input" 
                          defaultValue={editingPegawai.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${editingPegawai.id}`) || 'android'}
                        >
                          <option value="android">📱 Android (Aplikasi Resmi APK)</option>
                          <option value="iphone">🍏 iPhone (Browser Safari & Chrome)</option>
                        </select>
                        <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          *Pengguna Android wajib presensi di APK resmi. Pengguna iPhone diizinkan presensi lewat browser Safari atau Chrome iOS.
                        </small>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setEditingPegawai(null)} className="btn" style={{ width: 'auto', padding: '0.65rem 1rem', background: '#F1F5F9', color: '#475569', borderRadius: '10px', fontSize: '0.85rem' }}>
                          Batal
                        </button>
                        <button type="submit" disabled={savingPegawai} className="btn btn-primary" style={{ width: 'auto', padding: '0.65rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem' }}>
                          {savingPegawai ? 'Menyimpan...' : 'Simpan Penugasan'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
           </div>
        )}

        {activeTab === 'laporan' && (
          <div className="fade-in">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <h3 style={{ fontSize: '1.125rem', margin: 0, fontWeight: 800 }}>Laporan & Rekapitulasi Presensi</h3>
                </div>
             </div>

             <RekapPresensiPegawai
               role="kepsek"
               mode="all"
               currentUser={admin}
               pegawaiList={pegawaiData}
               absensiData={absensiData}
               loading={loadingData}
               selectedMonth={laporanBulan}
               onMonthChange={(m) => {
                 setLaporanBulan(m)
               }}
               schoolName={namaSekolah}
               schoolLogo={logoSekolah}
               hariKerja={hariKerja || 5}
               onOpenExportModal={handleOpenExportModal}
             />
          </div>
        )}

        {activeTab === 'pengumuman' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Notifikasi & Pengumuman</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Buat Pengumuman Baru</h4>
               <form onSubmit={tambahPengumuman}>
                 <div className="input-group">
                   <textarea name="pesan" className="input" rows="3" placeholder="Tulis pesan atau notifikasi..." required style={{ resize: 'vertical' }}></textarea>
                 </div>
                 
                 <div className="input-group" style={{ marginTop: '1rem' }}>
                   <label className="input-label" style={{ fontSize: '0.85rem' }}>Kirim Ke</label>
                   <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: '0.75rem', borderRadius: '12px' }}>
                      <option value="all">Semua Pegawai</option>
                      <option value="selected">Pegawai Tertentu</option>
                   </select>
                 </div>
                 
                 {targetType === 'selected' && (
                    <div className="input-group" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                       {pegawaiData.length === 0 ? <p className="text-muted text-sm m-0">Memuat data pegawai...</p> : pegawaiData.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                             <input type="checkbox" checked={selectedPegawai.includes(p.id)} onChange={(e) => {
                                if (e.target.checked) setSelectedPegawai([...selectedPegawai, p.id]);
                                else setSelectedPegawai(selectedPegawai.filter(id => id !== p.id));
                             }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                             <span style={{ fontSize: '0.95rem', color: '#334E68' }}>{p.full_name || p.email}</span>
                          </label>
                       ))}
                    </div>
                 )}

                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '1.25rem', width: '100%', background: '#EC4899', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                   <Bell size={18} /> Kirim Notifikasi
                 </button>
               </form>
             </div>

             <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Riwayat Pengumuman</h4>
             {loadingData ? <p className="text-muted">Memuat data...</p> : (
               <div className="flex flex-col gap-3">
                 {pengumumanData.length === 0 && <p className="text-muted">Belum ada pengumuman.</p>}
                 {pengumumanData.map(p => (
                   <div key={p.id} className="card" style={{ padding: '1rem', border: '1px solid #F1F5F9', borderRadius: '16px', background: 'white' }}>
                     <div className="flex justify-between items-start mb-2">
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                         {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </span>
                       <button onClick={() => hapusPengumuman(p.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                         <Trash2 size={16} />
                       </button>
                     </div>
                     <p style={{ margin: 0, fontSize: '0.95rem', color: '#334E68', lineHeight: '1.5' }}>{p.pesan}</p>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        
        {/* ============================================================== */}
        {/* TAB: SISTEM PEMBELAJARAN (ENTERPRISE ACADEMIC MANAGEMENT)      */}
        {/* ============================================================== */}
        {activeTab === 'kbm' && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {kbmAdminSubTab === 'menu' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Real-time Metric Badges */}
                <h3 style={{ marginBottom: '0.25rem', fontSize: '1.15rem' }}>Statistik Akademik & KBM</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                  <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.12)' }}>
                    <School size={28} color="#4F46E5" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#4F46E5', margin: '0 0 0.25rem 0' }}>{kbmClasses.length}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>TOTAL KELAS / ROMBEL</p>
                  </div>
                  <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.12)' }}>
                    <Users size={28} color="#10B981" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#10B981', margin: '0 0 0.25rem 0' }}>{kbmStudents.length}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>TOTAL SISWA TERDAFTAR</p>
                  </div>
                  <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(147, 51, 234, 0.12)' }}>
                    <Award size={28} color="#9333EA" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#9333EA', margin: '0 0 0.25rem 0' }}>{kbmGrades.length}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>DATA NILAI TERINPUT</p>
                  </div>
                  <div className="card text-center" style={{ padding: '1.5rem 1rem', borderRadius: '20px', border: 'none', background: 'var(--surface)', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.12)' }}>
                    <BookOpen size={28} color="#F59E0B" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h2 style={{ fontSize: '1.8rem', color: '#F59E0B', margin: '0 0 0.25rem 0' }}>{kbmJournals.length}</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, fontWeight: '600' }}>JURNAL PEMBELAJARAN</p>
                  </div>
                </div>

                {/* Grid Menu Cards Admin KBM: Hanya Rekapitulasi & Master KBM */}
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.15rem' }}>Menu Modul Pembelajaran (Admin)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {/* Card 1: Rekapitulasi & Cetak Laporan */}
                  <div
                    onClick={() => setKbmAdminSubTab('rekap')}
                    className="card"
                    style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1.25rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}
                  >
                    <div style={{ width: '68px', height: '68px', borderRadius: '22px', background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 8px 16px rgba(245, 158, 11, 0.25)' }}>
                      <FileSpreadsheet size={34} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: '700' }}>Rekapitulasi KBM & Cetak</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>Unduh rekap presensi (harian/bulanan/semester), legger nilai & jurnal semua kelas</p>
                  </div>

                  {/* Card 2: Master KBM (Siswa, Rombel & Mapel) */}
                  <div
                    onClick={() => setKbmAdminSubTab('master_siswa')}
                    className="card"
                    style={{ cursor: 'pointer', border: 'none', padding: '1.75rem 1.25rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)', transition: 'transform 0.2s' }}
                  >
                    <div style={{ width: '68px', height: '68px', borderRadius: '22px', background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', boxShadow: '0 8px 16px rgba(79, 70, 229, 0.25)' }}>
                      <Users size={34} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: '700' }}>Master KBM</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>Kelola rombongan belajar kelas, siswa & pengaturan mata pelajaran</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Header Sub-Halaman dengan Navigasi Kembali & Switcher Pills */}
                <div className="card" style={{ padding: '0.85rem 1.25rem', background: 'white', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <button
                    onClick={() => setKbmAdminSubTab('menu')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      color: '#4F46E5',
                      background: '#EEF2FF',
                      border: 'none',
                      padding: '0.5rem 0.9rem',
                      borderRadius: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>Kembali ke Menu KBM</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', padding: '2px 0' }}>
                    <button
                      onClick={() => setKbmAdminSubTab('rekap')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmAdminSubTab === 'rekap' ? '#EA580C' : '#F1F5F9',
                        color: kbmAdminSubTab === 'rekap' ? 'white' : '#475569',
                        boxShadow: kbmAdminSubTab === 'rekap' ? '0 2px 5px rgba(234, 88, 12, 0.25)' : 'none'
                      }}
                    >
                      📊 Rekapitulasi & Cetak
                    </button>
                    <button
                      onClick={() => setKbmAdminSubTab('master_siswa')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        background: kbmAdminSubTab === 'master_siswa' ? '#1E293B' : '#F1F5F9',
                        color: kbmAdminSubTab === 'master_siswa' ? 'white' : '#475569',
                        boxShadow: kbmAdminSubTab === 'master_siswa' ? '0 2px 5px rgba(30, 41, 59, 0.25)' : 'none'
                      }}
                    >
                      ⚙️ Master KBM
                    </button>
                  </div>
                </div>

                {/* Sub-Modul Content */}
                {kbmAdminSubTab === 'rekap' && (
                  <RekapDanLaporan
                    classes={kbmClasses}
                    user={admin}
                    schoolInfo={{ schoolName: namaSekolah, principalName: '', principalNIP: '', kkm: 75, appMode: 'SD' }}
                  />
                )}

                {kbmAdminSubTab === 'master_siswa' && (
                  <MasterSiswaDanKelas
                    user={{ ...admin, role: 'admin' }}
                    profile={{ ...admin, role: 'admin' }}
                    schoolInfo={{ schoolName: namaSekolah }}
                    onRefresh={loadKbmClasses}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'pengaturan' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Pengaturan</h3>
             </div>
             
             {/* Profil Akun Pimpinan (Kepala Sekolah / Admin) */}
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <UserCircle size={20} color="var(--primary)" /> Profil Akun Pimpinan
               </h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 setProfileSaving(true);
                 const formData = new FormData(e.target);
                 const newFullName = formData.get('full_name');
                 const newNip = formData.get('nip');
                 const newJabatan = formData.get('jabatan');
                 const newRole = formData.get('role');
                 const newTipePerangkat = formData.get('tipe_perangkat');

                 const updates = {
                   full_name: newFullName,
                   nip: newNip,
                   jabatan: newJabatan,
                   role: newRole
                 };

                 try {
                   const { error } = await supabase.from('profiles').update(updates).eq('id', admin.id);
                   if (error) throw error;
                   
                   setAdmin(prev => ({ ...prev, ...updates, tipe_perangkat: newTipePerangkat }));
                   localStorage.setItem(`guru_tipe_perangkat_${admin.id}`, newTipePerangkat);
                   try {
                     await saveTeacherAssignmentToCloud({
                       teacherId: admin.id,
                       tipe: newRole || admin.role,
                       mapel: '',
                       jabatan: newJabatan,
                       assignedClasses: [],
                       tipe_perangkat: newTipePerangkat,
                       supabase
                     });
                   } catch (e) {
                     console.warn('Sync kepsek assignment warning:', e);
                   }
                   alert("Profil akun pimpinan berhasil diperbarui!");
                 } catch (err) {
                   alert("Gagal memperbarui profil: " + err.message);
                 } finally {
                   setProfileSaving(false);
                 }
               }}>
                 {/* Foto Profil */}
                 <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                   <label className="input-label">Foto Profil</label>
                   <div className="flex gap-4 items-center">
                     <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                       {admin?.foto_profil ? (
                         <img src={admin.foto_profil} alt="Foto Profil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                       ) : (
                         <UserCircle size={36} color="var(--text-muted)" />
                       )}
                     </div>
                     <label className="btn" style={{ background: '#F1F5F9', color: '#1E293B', cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.875rem', borderRadius: '12px' }}>
                       {uploadingAdminPhoto ? 'Mengunggah...' : 'Ubah Foto'}
                       <input
                         type="file"
                         accept="image/*"
                         style={{ display: 'none' }}
                         disabled={uploadingAdminPhoto}
                         onChange={async (e) => {
                           const file = e.target.files?.[0];
                           if (!file || !admin?.id) return;
                           setUploadingAdminPhoto(true);
                           try {
                             const reader = new FileReader();
                             reader.onload = async (ev) => {
                               try {
                                 const webp = await convertToWebP(ev.target.result, 0.8, 600);
                                 const res = await fetch(webp);
                                 const blob = await res.blob();
                                 const fileName = `avatar-${admin.id}-${Date.now()}.webp`;
                                 const { error: upErr } = await supabase.storage.from('avatars').upload(fileName, blob, { contentType: 'image/webp' });
                                 if (upErr) throw upErr;
                                 const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
                                 await supabase.from('profiles').update({ foto_profil: publicUrl }).eq('id', admin.id);
                                 setAdmin(prev => ({ ...prev, foto_profil: publicUrl }));
                                 alert("Foto profil berhasil diperbarui!");
                               } catch (uploadErr) {
                                 alert("Gagal mengunggah foto: " + uploadErr.message);
                               } finally {
                                 setUploadingAdminPhoto(false);
                               }
                             };
                             reader.readAsDataURL(file);
                           } catch (err) {
                             alert("Gagal membaca file: " + err.message);
                             setUploadingAdminPhoto(false);
                           }
                         }}
                       />
                     </label>
                   </div>
                 </div>

                 {/* Nama Lengkap */}
                 <div className="input-group" style={{ marginBottom: '1rem' }}>
                   <label className="input-label">Nama Lengkap & Gelar</label>
                   <input type="text" name="full_name" className="input" defaultValue={admin?.full_name || ''} required />
                 </div>

                 {/* NIP / ID Pegawai */}
                 <div className="input-group" style={{ marginBottom: '1rem' }}>
                   <label className="input-label">NIP / ID Pegawai</label>
                   <input type="text" name="nip" className="input" defaultValue={admin?.nip || ''} placeholder="Contoh: 19800101 200501 1 001" />
                 </div>

                 {/* Jabatan */}
                 <div className="input-group" style={{ marginBottom: '1rem' }}>
                   <label className="input-label">Jabatan</label>
                   <input type="text" name="jabatan" className="input" defaultValue={admin?.jabatan || 'Kepala Sekolah'} required />
                 </div>

                 {/* Tipe Penugasan (Kepsek / Admin) */}
                 <div className="input-group" style={{ marginBottom: '1rem' }}>
                   <label className="input-label">Tipe Penugasan</label>
                   <select name="role" className="input" defaultValue={admin?.role || 'kepsek'}>
                     <option value="kepsek">Kepala Sekolah</option>
                     <option value="admin">Administrator</option>
                   </select>
                 </div>

                 {/* Tipe Perangkat (Android / iPhone) */}
                 <div className="input-group" style={{ marginBottom: '1rem' }}>
                   <label className="input-label">Tipe Perangkat Absensi</label>
                   <select name="tipe_perangkat" className="input" defaultValue={admin?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${admin?.id}`) || 'android'}>
                     <option value="android">📱 Android (APK Resmi)</option>
                     <option value="iphone">🍏 iPhone (Safari / Chrome iOS)</option>
                   </select>
                 </div>

                 <button type="submit" disabled={profileSaving} className="btn btn-primary" style={{ padding: '0.85rem 1.5rem', background: '#2563EB', color: 'white', fontWeight: 'bold', borderRadius: '12px', width: '100%' }}>
                   {profileSaving ? 'Menyimpan Profil...' : 'Simpan Profil Pimpinan'}
                 </button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Profil Sekolah</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const { error } = await supabase.from('settings').upsert({ id: 1, nama_sekolah: formData.get('nama_sekolah'), logo_sekolah: logoSekolah }, { onConflict: 'id' });
                 if (error) alert('Error: ' + error.message);
                 else { setNamaSekolah(formData.get('nama_sekolah')); alert('Tersimpan!'); }
               }}>
                 <div className="input-group">
                   <label className="input-label">Nama Sekolah / Instansi</label>
                   <input type="text" name="nama_sekolah" className="input" defaultValue={namaSekolah} required />
                 </div>
                 <div className="input-group">
                   <label className="input-label">Logo Sekolah</label>
                   <div className="flex gap-4 items-center">
                     <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                       {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ShieldCheck size={24} color="var(--text-muted)" />}
                     </div>
                     <label className="btn" style={{ background: '#F1F5F9', color: '#1E293B', cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.875rem', borderRadius: '12px' }}>
                       {uploadingLogo ? '...' : 'Upload Logo'}
                       <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
                     </label>
                   </div>
                 </div>
                 <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '1rem', background: '#F59E0B' }}>Simpan Pengaturan</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Sistem Hari Kerja</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 setLoadingData(true);
                 const val = parseInt(e.target.hari_kerja.value);
                 const { error } = await supabase.from('settings').upsert({ id: 1, hari_kerja: val }, { onConflict: 'id' });
                 if (!error) {
                    setHariKerja(val);
                    alert("Sistem Hari Kerja berhasil diperbarui!");
                 } else {
                    alert("Error update: " + error.message);
                 }
                 setLoadingData(false);
               }}>
                 <div className="input-group">
                   <select name="hari_kerja" className="input" defaultValue={hariKerja}>
                      <option value="5">5 Hari Kerja (Senin - Jumat)</option>
                      <option value="6">6 Hari Kerja (Senin - Sabtu)</option>
                   </select>
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#4F46E5', color: 'white', width: '100%' }}>Simpan Hari Kerja</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Format Rekapitulasi Bulanan</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 setLoadingData(true);
                 const val = e.target.rekap_tampil_jam.value === 'true';
                 const { error } = await supabase.from('settings').upsert({ id: 1, rekap_tampil_jam: val }, { onConflict: 'id' });
                 if (!error) {
                    setRekapTampilJam(val);
                    alert("Format Rekapitulasi berhasil diperbarui!");
                 } else {
                    alert("Error update: " + error.message);
                 }
                 setLoadingData(false);
               }}>
                 <div className="input-group">
                   <select name="rekap_tampil_jam" className="input" defaultValue={rekapTampilJam.toString()}>
                      <option value="false">Mode Ringkas: Hanya Tanda (✓ / S / I)</option>
                      <option value="true">Mode Detail: Tanda + Jam Masuk & Pulang</option>
                   </select>
                   <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Pilih Mode Ringkas agar tabel rekap bulanan berukuran lebih kecil dan mudah dimuat dalam 1 halaman cetak (PDF).</p>
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#4F46E5', color: 'white', width: '100%' }}>Simpan Format Rekap</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Validasi Lokasi GPS (Geofencing)</h4>
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                  Wajibkan guru berada di dalam radius area sekolah saat melakukan Clock In / Clock Out.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setLoadingData(true);
                  const isEnabled = e.target.geofence_enabled.value === 'true';
                  const lat = parseFloat(e.target.school_lat.value) || 0;
                  const lng = parseFloat(e.target.school_lng.value) || 0;
                  const radius = parseInt(e.target.school_radius.value) || 100;

                  const payload = {
                    id: 1,
                    geofence_enabled: isEnabled,
                    school_lat: lat,
                    school_lng: lng,
                    school_radius: radius
                  };

                  const { error } = await supabase.from('settings').upsert(payload, { onConflict: 'id' });
                  if (!error) {
                    setGeofenceEnabled(isEnabled);
                    setSchoolLat(lat);
                    setSchoolLng(lng);
                    setSchoolRadius(radius);
                    alert("Pengaturan Geofencing berhasil disimpan!");
                  } else {
                    alert("Error: " + error.message);
                  }
                  setLoadingData(false);
                }}>
                  <div className="input-group">
                    <label className="input-label" style={{ fontSize: '0.85rem' }}>Status Geofencing</label>
                    <select name="geofence_enabled" className="input" defaultValue={geofenceEnabled.toString()}>
                       <option value="false">Nonaktif (Bisa absen dari mana saja)</option>
                       <option value="true">Aktif (Wajib di area sekolah)</option>
                    </select>
                  </div>

                  {/* Interactive Map Picker */}
                  <GeofenceMapPicker
                    lat={schoolLat}
                    lng={schoolLng}
                    radius={schoolRadius}
                    onLocationChange={(newLat, newLng) => {
                      setSchoolLat(newLat)
                      setSchoolLng(newLng)
                    }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div className="input-group">
                      <label className="input-label" style={{ fontSize: '0.85rem' }}>Latitude Sekolah</label>
                      <input
                        type="number"
                        step="any"
                        name="school_lat"
                        className="input"
                        value={schoolLat}
                        onChange={(e) => setSchoolLat(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label" style={{ fontSize: '0.85rem' }}>Longitude Sekolah</label>
                      <input
                        type="number"
                        step="any"
                        name="school_lng"
                        className="input"
                        value={schoolLng}
                        onChange={(e) => setSchoolLng(parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label className="input-label" style={{ fontSize: '0.85rem' }}>Radius Toleransi (Meter)</label>
                    <input
                      type="number"
                      name="school_radius"
                      className="input"
                      value={schoolRadius}
                      onChange={(e) => setSchoolRadius(parseInt(e.target.value) || 50)}
                      min="10"
                      max="2000"
                      placeholder="Contoh: 100"
                      required
                    />
                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>Jarak maksimal dari titik pusat sekolah (misal: 100 meter).</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            setSchoolLat(pos.coords.latitude);
                            setSchoolLng(pos.coords.longitude);
                            alert("Lokasi GPS berhasil diambil:\nLat: " + pos.coords.latitude + "\nLng: " + pos.coords.longitude);
                          },
                          (err) => alert("Gagal mengambil GPS: " + err.message),
                          { enableHighAccuracy: true }
                        );
                      } else {
                        alert("Browser tidak mendukung geolokasi.");
                      }
                    }}
                    className="btn"
                    style={{ background: '#F1F5F9', color: '#1E293B', marginBottom: '0.75rem', fontSize: '0.85rem', padding: '0.75rem' }}
                  >
                    📍 Ambil Titik Lokasi Saya Sekarang
                  </button>

                  <button type="submit" className="btn" style={{ padding: '1rem', background: '#10B981', color: 'white', width: '100%' }}>
                    Simpan Lokasi Geofencing
                  </button>
                </form>
              </div>

              <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
                <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Daftar Hari Libur (Manual)</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const startDateStr = e.target.tanggal_mulai.value;
                 const endDateStr = e.target.tanggal_selesai.value || startDateStr;
                 const keterangan = e.target.keterangan.value;
                 if(!startDateStr || !keterangan) return;
                 
                 const startDate = new Date(startDateStr);
                 const endDate = new Date(endDateStr);
                 
                 if (endDate < startDate) return alert("Tanggal selesai tidak boleh lebih kecil dari tanggal mulai.");
                 
                 setLoadingData(true);
                 const payload = [];
                 let currDate = new Date(startDate);
                 while(currDate <= endDate) {
                    payload.push({
                       tanggal: currDate.toLocaleDateString('en-CA'),
                       keterangan: keterangan
                    })
                    currDate.setDate(currDate.getDate() + 1);
                 }
                 
                 const { data, error } = await supabase.from('hari_libur').insert(payload).select();
                 if(!error && data) {
                    const mergedData = [...data, ...hariLiburData].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
                    setHariLiburData(mergedData.slice(0, 50));
                    e.target.reset();
                    alert("Hari libur berhasil ditambahkan!");
                 } else {
                    alert("Gagal menambahkan hari libur.");
                 }
                 setLoadingData(false);
               }}>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                       <label className="text-muted" style={{ fontSize: '0.75rem' }}>Mulai Tanggal</label>
                       <input type="date" name="tanggal_mulai" className="input" required />
                    </div>
                    <div>
                       <label className="text-muted" style={{ fontSize: '0.75rem' }}>Sampai Tanggal (Opsional)</label>
                       <input type="date" name="tanggal_selesai" className="input" />
                    </div>
                 </div>
                 <input type="text" name="keterangan" className="input" placeholder="Keterangan libur (misal: Cuti Bersama)" required />
                 <button type="submit" className="btn" style={{ padding: '0.8rem', marginTop: '0.5rem', background: '#10B981', color: 'white', width: '100%' }}>Tambah Hari Libur</button>
               </form>
               
               <div style={{ marginTop: '1.5rem' }}>
                  {hariLiburData.length === 0 ? <p className="text-muted" style={{ fontSize: '0.85rem' }}>Belum ada hari libur tersimpan.</p> : hariLiburData.map(h => (
                     <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid #F1F5F9' }}>
                        <div>
                           <div style={{ fontWeight: '600', color: '#1E293B', fontSize: '0.9rem' }}>{new Date(h.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                           <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{h.keterangan}</div>
                        </div>
                        <button onClick={async () => {
                           if(!window.confirm('Hapus hari libur ini?')) return;
                           const { error } = await supabase.from('hari_libur').delete().eq('id', h.id);
                           if(!error) setHariLiburData(hariLiburData.filter(item => item.id !== h.id));
                        }} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                     </div>
                  ))}
               </div>
             </div>

             {/* INTEGRASI GOOGLE GEMINI AI UNTUK ADMIN & KEPSEK */}
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                 <Sparkles size={20} color="#6366F1" />
                 <h4 style={{ fontSize: '1rem', margin: 0, fontWeight: 'bold' }}>Integrasi Google Gemini AI (Akun Mandiri)</h4>
               </div>
               <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                 Digunakan untuk <strong>Scan Foto Dokumen Tambah Siswa (OCR Nama & NISN)</strong> serta fitur kecerdasan buatan lainnya. Kunci API ini tersimpan mandiri khusus untuk akun Anda.
               </p>

               <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '0.65rem 0.85rem', borderRadius: '12px', fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                 <Sparkles size={14} color="#6366F1" style={{ flexShrink: 0 }} />
                 <span>Sistem memprioritaskan <strong>Gemini 3.8 Flash</strong>, lalu otomatis fallback ke <strong>2.0 Flash</strong> dan <strong>1.5 Flash</strong> jika kuota limit.</span>
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
                     const saved = await saveGeminiKey(geminiApiKey, admin?.id, supabase)
                     setGeminiSavedMessage('API Key Gemini berhasil disimpan secara permanen!')
                     setTimeout(() => setGeminiSavedMessage(null), 3500)
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

             {/* PENCADANGAN GOOGLE DRIVE & DATA SEKOLAH */}
             <GoogleDriveBackupCard supabase={supabase} darkMode={darkMode} />

             <div className="card" style={{ border: 'none', background: 'white' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Keamanan Akun</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const newPassword = formData.get('new_password');
                 
                 const { error } = await supabase.auth.updateUser({ password: newPassword });
                 if (!error) {
                   alert("Password berhasil diperbarui!");
                   e.target.reset();
                 } else {
                   alert("Gagal mengubah password: " + error.message);
                 }
               }}>
                 <div className="input-group">
                   <label className="input-label">Ubah Password Baru</label>
                   <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }}>
                   Ubah Password
                 </button>
               </form>
             </div>
          </div>
        )}

        {/* Tab Riwayat Kehadiran Kepala Sekolah */}
        {activeTab === 'riwayat' && (
          <div className="fade-in">
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: '700' }}>Riwayat Kehadiran Saya</h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Catatan presensi pribadi Anda sebagai Kepala Sekolah
              </p>
            </div>

            <RekapPresensiPegawai
              role="kepsek"
              mode="personal"
              currentUser={admin}
              pegawaiList={admin ? [admin] : []}
              absensiData={historyList}
              loading={historyLoading}
              selectedMonth={historyMonth}
              onMonthChange={(m) => {
                setHistoryMonth(m)
                loadHistory(m)
              }}
              schoolName={namaSekolah}
              schoolLogo={logoSekolah}
              hariKerja={hariKerja || 5}
            />
          </div>
        )}
        </main>
      {showExportModal && (
        <div className="popup-overlay" style={{ zIndex: 1000, padding: '1rem' }}>
          <div className="popup-content" style={{ maxWidth: '900px', width: '100%', padding: '1.5rem', borderRadius: '24px', background: 'white' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Pratinjau Laporan ({laporanTipe.toUpperCase()})</h2>
              <button onClick={() => setShowExportModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: '#F8FAFC', padding: '0.8rem', borderRadius: '12px' }}>
               <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Ukuran Huruf ({exportFontSize}px):</label>
               <input type="range" min="4" max="14" step="1" value={exportFontSize} onChange={(e) => setExportFontSize(parseInt(e.target.value))} style={{ flex: 1 }} />
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '50vh', border: '1px solid #E2E8F0', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div id="export-preview-container" style={{ padding: '1.5rem', background: 'white', minWidth: laporanTipe === 'bulanan' ? '1200px' : '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontWeight: 'bold', fontSize: '1rem', color: 'black' }}>
                  <div style={{ fontSize: '1.2rem' }}>DAFTAR HADIR</div>
                  <div style={{ fontSize: '1.2rem' }}>GURU DAN TENAGA KEPENDIDIKAN</div>
                  <div style={{ fontSize: '1.2rem' }}>{namaSekolah.toUpperCase()}</div>
                </div>
                {laporanTipe === 'bulanan' && (
                  <div style={{ textAlign: 'left', marginBottom: '0.5rem', fontWeight: 'bold', color: 'black' }}>
                    Bulan : {exportPreviewData.monthName}
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ color: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      {exportPreviewData.columns.map((col, idx) => (
                        <th key={idx} style={{ padding: '0.5rem', border: '1px solid #E2E8F0', textAlign: 'center', whiteSpace: 'nowrap', background: exportPreviewData.redColumns?.includes(col) ? '#EF4444' : '#4F46E5' }}>{col}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {exportPreviewData.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {exportPreviewData.columns.map((col, cIdx) => {
                        let cellContent = row[col] || '-';
                        let bg = 'white';
                        let color = '#1E293B';
                        let bold = false;
                        
                        let isRedCol = exportPreviewData.redColumns?.includes(col);
                        if (isRedCol) bg = '#FEE2E2';
                        
                        if (laporanTipe === 'bulanan' && cIdx > 1 && cellContent !== '-') {
                           if (cellContent.status === 'hadir') {
                              color = '#2563EB'; // Blue
                              cellContent = rekapTampilJam ? `✓\nIn: ${cellContent.in}\nOut: ${cellContent.out}` : '✓';
                           } else if (cellContent.status === 'izin') {
                              bg = '#FBBF24'; // Yellow
                              color = 'white';
                              bold = true;
                              cellContent = 'IZIN';
                           } else if (cellContent.status === 'sakit') {
                              bg = '#EF4444'; // Red
                              color = 'white';
                              bold = true;
                              cellContent = 'SAKIT';
                           }
                        }

                        return (
                          <td key={cIdx} style={{ padding: laporanTipe === 'bulanan' ? (rekapTampilJam ? '0.4rem' : '0.2rem 0.1rem') : '0.4rem', border: '1px solid #E2E8F0', textAlign: 'center', whiteSpace: 'pre-wrap', background: bg, color: color, fontWeight: bold ? 'bold' : 'normal', verticalAlign: 'middle', fontSize: `${exportFontSize}px` }}>
                            {cellContent}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
               <button onClick={exportToExcel} className="btn" style={{ background: '#10B981', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download Excel
               </button>
               <button onClick={exportToPDF} className="btn" style={{ background: '#EF4444', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download PDF
               </button>
               <button onClick={exportToWord} className="btn" style={{ background: '#2563EB', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download Word
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail & Dokumentasi Foto Tugas Luar */}
      {selectedDetailPhoto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setSelectedDetailPhoto(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '20px',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ background: '#EFF6FF', color: '#2563EB', padding: '0.5rem', borderRadius: '10px' }}>
                  <Briefcase size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold', color: '#0F172A' }}>
                    Dokumentasi Presensi Tugas Luar
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    Format WebP Ringan • Bukti Kehadiran
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailPhoto(null)}
                style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Foto WebP Pratinjau Detail */}
            <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', background: '#0F172A', textAlign: 'center', marginBottom: '1rem', border: '1px solid #E2E8F0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)' }}>
              <img
                src={selectedDetailPhoto.photo}
                alt="Dokumentasi Tugas Luar"
                style={{
                  maxHeight: '380px',
                  width: 'auto',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto'
                }}
              />
              <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                WebP High Efficiency
              </div>
            </div>

            {/* Data Detail Presensi Pegawai */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1rem', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748B' }}>Nama Guru:</span>
                <strong style={{ color: '#0F172A' }}>{selectedDetailPhoto.absensi?.profiles?.full_name || selectedDetailPhoto.absensi?.profiles?.email}</strong>
              </div>
              {selectedDetailPhoto.absensi?.profiles?.nip && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.4rem' }}>
                  <span style={{ color: '#64748B' }}>NIP / ID:</span>
                  <span style={{ color: '#334155' }}>{selectedDetailPhoto.absensi.profiles.nip}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748B' }}>Tanggal:</span>
                <span style={{ color: '#334155' }}>{new Date(selectedDetailPhoto.absensi?.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.4rem' }}>
                <span style={{ color: '#64748B' }}>Jam Masuk & Pulang:</span>
                <span style={{ color: '#059669', fontWeight: 'bold' }}>
                  {new Date(selectedDetailPhoto.absensi?.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  <span style={{ color: '#64748B', fontWeight: 'normal' }}> s/d </span>
                  <span style={{ color: '#D97706' }}>{selectedDetailPhoto.absensi?.waktu_pulang ? new Date(selectedDetailPhoto.absensi.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '14:00'}</span>
                </span>
              </div>
              <div>
                <div style={{ color: '#64748B', marginBottom: '0.2rem' }}>Catatan / Rincian Tugas:</div>
                <div style={{ color: '#1E293B', background: 'white', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0', lineHeight: '1.4' }}>
                  {cleanKeterangan(selectedDetailPhoto.absensi?.keterangan) || 'Tugas Luar / Pelatihan'}
                </div>
              </div>
            </div>

            {/* Aksi Modal: Unduh & Tutup */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <a
                href={selectedDetailPhoto.photo}
                download={`Bukti_TugasLuar_${selectedDetailPhoto.absensi?.profiles?.full_name || 'Guru'}_${selectedDetailPhoto.absensi?.tanggal}.webp`}
                className="btn"
                style={{
                  background: '#10B981',
                  color: 'white',
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  textDecoration: 'none'
                }}
              >
                <Download size={16} /> Unduh Foto (.webp)
              </a>
              <button
                type="button"
                onClick={() => setSelectedDetailPhoto(null)}
                className="btn"
                style={{
                  background: '#F1F5F9',
                  color: '#475569',
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  fontWeight: '600',
                  fontSize: '0.85rem'
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Dialog untuk Kepsek Presensi */}
      {kepsekPopup.show && (
        <div className="popup-overlay" style={{ zIndex: 99999 }}>
          <div className="popup-content">
             <div style={{ margin: '0 auto 1rem auto', width: '64px', height: '64px', background: kepsekPopup.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: kepsekPopup.type === 'success' ? '#059669' : '#DC2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={32} strokeWidth={3} />
             </div>
             <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{kepsekPopup.title}</h2>
             <p className="text-muted" style={{ fontSize: '0.95rem', marginBottom: '1.25rem' }}>{kepsekPopup.message}</p>
             <button onClick={() => setKepsekPopup({ show: false, title: '', message: '', type: 'success' })} className="btn btn-primary" style={{ width: '100%' }}>
               Tutup
             </button>
          </div>
        </div>
      )}

        {/* Mobile Bottom Navigation Bar (Muncul di Layar Mobile: APK & Mobile Browser) */}
        {!isDesktop && (
          <nav
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              zIndex: 50,
              padding: '0.4rem 0.5rem 0.6rem 0.5rem',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              boxShadow: '0 -4px 14px rgba(0,0,0,0.08)'
            }}
          >
            {/* 1. Presensi */}
            <button
              onClick={() => setActiveTab('absensi')}
              style={{
                background: 'none',
                border: 'none',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                color: activeTab === 'absensi' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <MapPin size={20} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.8} />
              <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'absensi' ? 700 : 500 }}>Presensi</span>
            </button>

            {/* 2. Overview (Ringkasan Kehadiran Guru Hari Ini) */}
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                background: 'none',
                border: 'none',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                color: activeTab === 'overview' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <Activity size={20} strokeWidth={activeTab === 'overview' ? 2.5 : 1.8} />
              <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'overview' ? 700 : 500 }}>Overview</span>
            </button>

            {/* 3. GTag (Kamera Ber-watermark GPS) - Posisi Center / Tengah */}
            <button
              onClick={() => setShowCameraModal(true)}
              style={{
                background: 'none',
                border: 'none',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                color: '#0284C7',
                cursor: 'pointer',
                padding: '0 2px'
              }}
            >
              <div style={{
                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                color: 'white',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: '-14px',
                boxShadow: '0 4px 10px rgba(2, 132, 199, 0.4)'
              }}>
                <Camera size={19} />
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>GTag</span>
            </button>

            {/* 4. Riwayat */}
            <button
              onClick={() => {
                setActiveTab('riwayat')
                loadHistory()
              }}
              style={{
                background: 'none',
                border: 'none',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                color: activeTab === 'riwayat' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <History size={20} strokeWidth={activeTab === 'riwayat' ? 2.5 : 1.8} />
              <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'riwayat' ? 700 : 500 }}>Riwayat</span>
            </button>

            {/* 5. Profil */}
            <button
              onClick={() => setActiveTab('pengaturan')}
              style={{
                background: 'none',
                border: 'none',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                color: activeTab === 'pengaturan' ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px 2px'
              }}
            >
              <UserCircle size={20} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.8} />
              <span style={{ fontSize: '0.68rem', fontWeight: activeTab === 'pengaturan' ? 700 : 500 }}>Profil</span>
            </button>
          </nav>
        )}

        {/* Footer Admin GammaraApp */}
        <footer className="no-print" style={{ marginTop: '3rem', padding: '1.75rem 1rem 5rem 1rem', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
          <div className="gammara-logo" style={{ fontSize: '1.35rem', marginBottom: '0.25rem' }}>
            <span className="gammara">Gammara</span><span className="app">App</span>
          </div>
          <p className="logo-description" style={{ fontSize: '0.8rem', margin: '0 0 2px 0' }}>
            Sistem Manajemen Sekolah Terpadu
          </p>
          <p className="logo-tagline" style={{ fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
            Sekolah Tertata, Pembelajaran Berkualitas.
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} GammaraApp. All Rights Reserved.
          </p>
        </footer>

        {/* Camera Timemark Modal untuk Kepala Sekolah */}
        <CameraTimemarkModal
          isOpen={showCameraModal}
          onClose={() => {
            setShowCameraModal(false)
            if (cameraModeForTugasLuar) {
              setShowTugasLuarModal(true)
              setCameraModeForTugasLuar(false)
            }
          }}
          profile={admin}
          user={admin}
          schoolName={namaSekolah}
          schoolLogo={logoSekolah}
          onSelectPhoto={cameraModeForTugasLuar ? async (photoUrl) => {
            const webp = await convertToWebP(photoUrl, 0.75, 1024)
            setTugasLuarFoto(webp)
            setShowCameraModal(false)
            setCameraModeForTugasLuar(false)
            setShowTugasLuarModal(true)
          } : null}
        />
      </div>
    </div>
  )
}
