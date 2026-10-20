import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogOut, Clock, CheckCircle, CheckCircle2, Users, UserCircle, Calendar, Fingerprint, Check, WifiOff, RefreshCw, Bell, Trash2, Camera, History, Download, FileSpreadsheet, FileText, Sun, Moon, MapPin, BookOpen, Layers, ArrowLeft, Award, ChevronRight, Briefcase, Upload, Image as ImageIcon, X, Sparkles, Key, Eye, EyeOff, Loader2, AlertCircle, AlertTriangle, Save, ShieldCheck, ShieldAlert, MessageSquare } from 'lucide-react'
import CameraTimemarkModal from '../../components/CameraTimemarkModal'
import InputPresensiMurid from '../../components/kbm/InputPresensiMurid'
import InputJurnalMengajar from '../../components/kbm/InputJurnalMengajar'
import InputNilaiSiswa from '../../components/kbm/InputNilaiSiswa'
import RekapDanLaporan from '../../components/kbm/RekapDanLaporan'
import MasterSiswaDanKelas from '../../components/kbm/MasterSiswaDanKelas'
import PembuatanModulAjar from '../../components/kbm/PembuatanModulAjar'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getCustomSubjects, syncCloudSubjects } from '../../lib/subjectsManager'
import { getSavedGeminiKey, loadSavedGeminiKeyAsync, saveGeminiKey, testGeminiConnection } from '../../lib/gemini'
import { syncCloudTeacherAssignments, saveTeacherAssignmentToCloud, getClassesTakenByOtherTeachers, getCachedAssignmentsMap } from '../../lib/assignmentManager'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { getSecureServerDate, getSecureServerIsoString, getSecureLocalDateString, syncServerTime, getSecureLocation, verifyAttendancePlatform, isIncognitoMode, checkCrossDeviceAccess } from '../../lib/security'
import PresensiOnlyApkNotice from '../../components/PresensiOnlyApkNotice'
import RekapPresensiPegawai from '../../components/presensi/RekapPresensiPegawai'
import PusatKomunikasi from '../../components/communication/PusatKomunikasi'
import { loadKepsekConfigFromCloud } from '../../lib/persuratanGenerator'

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

function GuruDesktopWrapper({
  isDesktop,
  schoolLogo,
  schoolName,
  activeTab,
  setActiveTab,
  kbmSubTab,
  handleTabChangeWithUrl,
  checkAssignmentConfigured,
  setShowAssignmentReminder,
  showPopup,
  loadHistory,
  profile,
  user,
  isTendikUser,
  isOpUser,
  isNonOpUser,
  guruTipeState,
  allProfiles,
  selectedViewTeacherId,
  onSelectTeacher,
  currentTime,
  toggleTheme,
  darkMode,
  navigate,
  children
}) {
  if (!isDesktop) {
    return <>{children}</>
  }

  return (
    <div className="guru-desktop-shell">
      {/* Desktop Left Sidebar for Teacher / Operator / Non-Operator */}
      <aside className="guru-desktop-sidebar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
            <img src={schoolLogo || "/panrita_logo.webp"} alt="Logo" style={{ width: '40px', height: '40px', borderRadius: '12px', objectFit: 'contain' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{schoolLogo ? schoolName : 'GammaraApp'}</h4>
              <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: '600' }}>
                {isNonOpUser ? 'Portal Tenaga Kependidikan' : isOpUser ? 'Portal Operator Sekolah' : 'Portal Pendidik (KBM Web)'}
              </span>
            </div>
          </div>

          {/* Sidebar Navigation */}
          <nav className="guru-desktop-sidebar-nav">
            <button
              className={`guru-desktop-nav-btn ${activeTab === 'absensi' ? 'active' : ''}`}
              onClick={() => setActiveTab('absensi')}
            >
              <Clock size={18} />
              <span>Presensi & Kehadiran</span>
            </button>
            {!isNonOpUser && (
              <button
                className={`guru-desktop-nav-btn ${activeTab === 'kbm' ? 'active' : ''}`}
                onClick={() => {
                  if (isTendikUser || isOpUser) {
                    setActiveTab('kbm')
                    return
                  }
                  if (!checkAssignmentConfigured()) {
                    setShowAssignmentReminder(true)
                    showPopup("Penugasan Belum Diatur", "Silakan lengkapi penugasan kelas atau mata pelajaran di menu Profil terlebih dahulu sebelum membuka Pembelajaran.", "error")
                    return
                  }
                  setActiveTab('kbm')
                }}
              >
                <BookOpen size={18} />
                <span>
                  {isOpUser ? 'Menu KBM (Siswa & Kelas)' : 'Sistem KBM (Jurnal, Nilai, Siswa)'}
                </span>
              </button>
            )}
            {!isTendikUser && (
              <button
                className={`guru-desktop-nav-btn ${activeTab === 'modul_ajar' || (activeTab === 'kbm' && kbmSubTab === 'modul_ajar') ? 'active' : ''}`}
                onClick={() => handleTabChangeWithUrl('modul_ajar')}
              >
                <Sparkles size={18} color="#F59E0B" />
                <span>Modul Ajar (RPM AI)</span>
              </button>
            )}
            <button
              className={`guru-desktop-nav-btn ${activeTab === 'riwayat' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('riwayat')
                loadHistory()
              }}
            >
              <History size={18} />
              <span>Riwayat Kehadiran</span>
            </button>
            <button
              className={`guru-desktop-nav-btn ${activeTab === 'komunikasi' ? 'active' : ''}`}
              onClick={() => handleTabChangeWithUrl('komunikasi')}
            >
              <MessageSquare size={18} />
              <span>Pusat Komunikasi</span>
            </button>
            <button
              className={`guru-desktop-nav-btn ${activeTab === 'pengumuman' ? 'active' : ''}`}
              onClick={() => setActiveTab('pengumuman')}
            >
              <Bell size={18} />
              <span>Pengumuman Sekolah</span>
            </button>
            <button
              className={`guru-desktop-nav-btn ${activeTab === 'pengaturan' ? 'active' : ''}`}
              onClick={() => setActiveTab('pengaturan')}
            >
              <UserCircle size={18} />
              <span>Profil & Penugasan</span>
            </button>
          </nav>
        </div>

        {/* User Profile Info Footer */}
        <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', background: 'var(--surface)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
              {profile?.foto_profil ? (
                <img src={profile.foto_profil} alt="User" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserCircle size={22} color="var(--primary)" />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                  {profile?.full_name || user?.email?.split('@')[0]}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {(() => {
                    if (isTendikUser) return profile?.jabatan || (isNonOpUser ? 'Tendik Non-Operator' : 'Operator Sekolah')
                    if (profile?.role === 'guru_mapel' || guruTipeState === 'guru_mapel') return 'Guru Mapel'
                    if (profile?.role === 'kepsek') return 'Kepala Sekolah'
                    return 'Guru Kelas'
                  })()}
                </div>
              </div>
            </div>
            <button onClick={() => { localStorage.removeItem('panrita_developer_session'); supabase.auth.signOut().then(() => navigate('/')); }} title="Keluar" style={{ background: '#FEE2E2', border: 'none', color: '#EF4444', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Right Main Area */}
      <div className="guru-desktop-main">
        {/* Desktop Top Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0' }}>
              {activeTab === 'absensi' && 'Presensi & Kehadiran Pegawai'}
              {activeTab === 'kbm' && 'Manajemen Data & Master KBM'}
              {activeTab === 'modul_ajar' && 'Penyusunan Modul Ajar (RPM AI)'}
              {activeTab === 'riwayat' && 'Riwayat & Rekap Kehadiran'}
              {activeTab === 'komunikasi' && 'Pusat Komunikasi & Kolaborasi Staf'}
              {activeTab === 'pengumuman' && 'Pengumuman & Notifikasi'}
              {activeTab === 'pengaturan' && 'Profil Pegawai & Penugasan'}
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {schoolLogo ? schoolName : 'GammaraApp'} • {(currentTime instanceof Date && !isNaN(currentTime.getTime())) ? currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user?.isDeveloperPreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Dropdown Mode Lihat Akun Guru Terdaftar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0F172A', padding: '0.3rem 0.65rem', borderRadius: '12px', border: '1.5px solid #00B4D8' }}>
                  <Eye size={15} color="#00B4D8" />
                  <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700 }}>Mode Lihat:</span>
                  <select
                    value={selectedViewTeacherId}
                    onChange={(e) => onSelectTeacher(e.target.value)}
                    style={{
                      background: '#1E293B',
                      color: '#FFFFFF',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      outline: 'none',
                      cursor: 'pointer',
                      maxWidth: '220px'
                    }}
                  >
                    <option value="">👤 Akun Pengembang (Super Admin)</option>
                    {(allProfiles || [])
                      .filter(p => p.role === 'guru' || p.role === 'guru_kelas' || p.role === 'guru_mapel' || p.role === 'tendik' || p.penugasan_tipe === 'tendik')
                      .map(t => (
                        <option key={t.id} value={t.id}>
                          {t.role === 'tendik' || t.penugasan_tipe === 'tendik' ? '💼' : '👨‍🏫'} {t.full_name || t.email} ({t.mata_pelajaran || t.jabatan || 'Guru'})
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  onClick={() => navigate('/pengembang')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#071C35',
                    color: '#00B4D8',
                    border: '1.5px solid #00B4D8',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 0 10px rgba(0, 180, 216, 0.3)'
                  }}
                  title="Kembali ke Konsol Pengembang"
                >
                  <span>⚙️ Console Pengembang</span>
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'var(--surface)', border: '1px solid var(--border)', padding: '0.4rem 0.85rem', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '600' }}>
              <Clock size={16} color="var(--primary)" />
              <span>{(currentTime instanceof Date && !isNaN(currentTime.getTime())) ? currentTime.toLocaleTimeString('id-ID') : '--:--:--'}</span>
            </div>
            <button
              onClick={toggleTheme}
              title={darkMode ? "Mode Terang" : "Mode Gelap"}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '38px', height: '38px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {darkMode ? <Sun size={18} color="#FBBF24" /> : <Moon size={18} color="var(--primary)" />}
            </button>
          </div>
        </div>

        {/* Web Laptop Alert Banner for Attendance */}
        {activeTab === 'absensi' && (
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '0.85rem 1.25rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: '#1E40AF', fontSize: '0.88rem' }}>
            <ShieldCheck size={20} color="#2563EB" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontWeight: '700' }}>
              Presensi Kehadiran Hanya Melalui Aplikasi Smartphone
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

export default function DashboardGuru({ roleOverride = null }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  // State Gemini AI Key
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiTesting, setGeminiTesting] = useState(false)
  const [geminiTestStatus, setGeminiTestStatus] = useState(null)
  const [geminiSavedMessage, setGeminiSavedMessage] = useState(null)
  // State Mode Pratinjau Pengembang (Lihat Sebagai Guru Tertentu)
  const [selectedViewTeacherId, setSelectedViewTeacherId] = useState('')
  const [activeTab, setActiveTab] = useState('absensi') 
  const [kbmSubTab, setKbmSubTab] = useState('menu') // 'menu' | 'presensi_siswa' | 'jurnal' | 'nilai' | 'rekap' | 'master_siswa'
  const [classesList, setClassesList] = useState([])
  const [assignedClasses, setAssignedClasses] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [guruTipeState, setGuruTipeState] = useState('guru_kelas')
  const [guruMapelState, setGuruMapelState] = useState('')
  const [showAssignmentReminder, setShowAssignmentReminder] = useState(false)
  const [onboardingTipe, setOnboardingTipe] = useState('guru_kelas')
  const [onboardingMapel, setOnboardingMapel] = useState('')
  const [onboardingSaving, setOnboardingSaving] = useState(false)
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
  const [hariKerja, setHariKerja] = useState(5)
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

  // Responsive Layout (Otomatis deteksi layar Laptop/PC vs HP)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 992 : false)
  const [isIncognito, setIsIncognito] = useState(false)
  const [crossDeviceStatus, setCrossDeviceStatus] = useState({ allowed: true })

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 992)
    }
    window.addEventListener('resize', handleResize)
    isIncognitoMode().then(val => setIsIncognito(val))
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const activeUser = profile || user
    if (activeUser?.id) {
      const cross = checkCrossDeviceAccess(activeUser)
      setCrossDeviceStatus(cross)
    }
  }, [profile, user])

  const navigate = useNavigate()
  const location = useLocation()

  // Deteksi peran Tendik (Operator vs Non-Operator) secara terpadu
  const isInspectingSpecificUser = Boolean(selectedViewTeacherId)
  const isPathNonOp = !isInspectingSpecificUser && (location.pathname.startsWith('/nonoperator') || roleOverride === 'nonoperator')
  const isPathOp = !isInspectingSpecificUser && (location.pathname.startsWith('/operator') || roleOverride === 'operator')
  const isTendikUser = isPathNonOp || isPathOp || profile?.role === 'tendik' || profile?.role === 'operator' || profile?.role === 'nonoperator' || profile?.penugasan_tipe === 'tendik' || guruTipeState === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(profile?.jabatan)
  const isNonOpUser = isPathNonOp || profile?.role === 'nonoperator' || (isTendikUser && !isPathOp && (localStorage.getItem(`tendik_kategori_${profile?.id || user?.id}`) === 'non_operator' || ['Pustakawan', 'Bujang', 'Satpam'].includes(profile?.jabatan)))
  const isOpUser = !isNonOpUser && (isPathOp || profile?.role === 'operator' || isTendikUser)

  const getBasePath = () => {
    if (location.pathname.startsWith('/operator') || roleOverride === 'operator') return '/operator'
    if (location.pathname.startsWith('/nonoperator') || roleOverride === 'nonoperator') return '/nonoperator'
    return '/guru'
  }

  // Sinkronisasi ActiveTab dan KBM SubTab dengan URL Path (/guru, /operator, /nonoperator)
  useEffect(() => {
    const rawPath = location.pathname.replace(/\/+$/, '') // normalize trailing slash
    const subPath = rawPath.replace(/^\/(guru|operator|nonoperator)/, '')
    if (subPath === '/modul-ajar' || subPath === '/kbm/modul-ajar') {
      if (isNonOpUser) {
        setActiveTab('absensi')
      } else if (isOpUser) {
        setActiveTab('kbm')
        setKbmSubTab('master_siswa')
      } else {
        setActiveTab('modul_ajar')
        setKbmSubTab('modul_ajar')
      }
    } else if (subPath.startsWith('/kbm') || subPath === '/master') {
      if (isNonOpUser) {
        setActiveTab('absensi')
      } else {
        setActiveTab('kbm')
        if (isOpUser) {
          setKbmSubTab('master_siswa')
        } else if (subPath === '/kbm/presensi' || subPath === '/kbm/presensi-siswa') setKbmSubTab('presensi_siswa')
        else if (subPath === '/kbm/jurnal') setKbmSubTab('jurnal')
        else if (subPath === '/kbm/nilai') setKbmSubTab('nilai')
        else if (subPath === '/kbm/rekap') setKbmSubTab('rekap')
        else if (subPath === '/kbm/master' || subPath === '/master') setKbmSubTab('master_siswa')
        else setKbmSubTab('menu')
      }
    } else if (subPath === '/riwayat') {
      setActiveTab('riwayat')
    } else if (subPath === '/komunikasi') {
      setActiveTab('komunikasi')
    } else if (subPath === '/pengumuman') {
      setActiveTab('pengumuman')
    } else if (subPath === '/profil' || subPath === '/pengaturan') {
      setActiveTab('pengaturan')
    } else if (subPath === '') {
      setActiveTab('absensi')
    }
  }, [location.pathname, isNonOpUser, isOpUser])

  const handleTabChangeWithUrl = (newTab, subTab = null) => {
    const base = getBasePath()
    if (isNonOpUser && (newTab === 'kbm' || newTab === 'modul_ajar')) {
      setActiveTab('absensi')
      navigate(base)
      return
    }
    setActiveTab(newTab)
    if (newTab === 'absensi') navigate(base)
    else if (newTab === 'riwayat') navigate(`${base}/riwayat`)
    else if (newTab === 'komunikasi') navigate(`${base}/komunikasi`)
    else if (newTab === 'pengumuman') navigate(`${base}/pengumuman`)
    else if (newTab === 'pengaturan') navigate(`${base}/profil`)
    else if (newTab === 'modul_ajar') {
      if (isOpUser) {
        setActiveTab('kbm')
        setKbmSubTab('master_siswa')
        navigate(`${base}/kbm`)
      } else {
        setKbmSubTab('modul_ajar')
        navigate(`${base}/modul-ajar`)
      }
    }
    else if (newTab === 'kbm') {
      if (isOpUser) {
        setKbmSubTab('master_siswa')
        navigate(`${base}/kbm`)
        return
      }
      if (subTab === 'presensi_siswa') { setKbmSubTab('presensi_siswa'); navigate(`${base}/kbm/presensi`); }
      else if (subTab === 'jurnal') { setKbmSubTab('jurnal'); navigate(`${base}/kbm/jurnal`); }
      else if (subTab === 'nilai') { setKbmSubTab('nilai'); navigate(`${base}/kbm/nilai`); }
      else if (subTab === 'rekap') { setKbmSubTab('rekap'); navigate(`${base}/kbm/rekap`); }
      else if (subTab === 'master_siswa') { setKbmSubTab('master_siswa'); navigate(`${base}/kbm/master`); }
      else if (subTab === 'modul_ajar') { setKbmSubTab('modul_ajar'); navigate(`${base}/kbm/modul-ajar`); }
      else { setKbmSubTab('menu'); navigate(`${base}/kbm`); }
    }
  }

  // Helper untuk mengecek apakah penugasan guru sudah lengkap
  const checkAssignmentConfigured = () => {
    if (!user) return true
    if (isTendikUser) return true
    const tipe = localStorage.getItem(`guru_tipe_${user.id}`) || profile?.penugasan_tipe || (profile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
    if (tipe === 'tendik') return true

    const mapel = profile?.mata_pelajaran || localStorage.getItem(`guru_mapel_${user.id}`) || ''
    let assigned = assignedClasses
    if (!assigned || assigned.length === 0) {
      try {
        const raw = localStorage.getItem(`guru_assigned_classes_${user.id}`)
        assigned = raw ? JSON.parse(raw) : []
        if (!Array.isArray(assigned)) assigned = []
      } catch (e) {
        assigned = []
      }
    }
    
    if (tipe === 'guru_mapel') {
      return Boolean(mapel) && assigned.length > 0
    }
    return assigned.length > 0
  }

  // Filter daftar kelas yang diampu oleh guru ini
  let userAssignedIds = assignedClasses
  if (!userAssignedIds || userAssignedIds.length === 0) {
    if (user?.id) {
      try {
        const raw = localStorage.getItem(`guru_assigned_classes_${user.id}`)
        userAssignedIds = raw ? JSON.parse(raw) : []
        if (!Array.isArray(userAssignedIds)) userAssignedIds = []
      } catch (e) {
        userAssignedIds = []
      }
    } else {
      userAssignedIds = []
    }
  }
  
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

  // Pastikan API Key Gemini selalu terisi saat membuka tab Pengaturan / Profil
  useEffect(() => {
    if (activeTab === 'pengaturan') {
      const uId = user?.id || profile?.id
      loadSavedGeminiKeyAsync(uId, user, profile).then(k => {
        if (k) setGeminiApiKey(k)
      })
    }
  }, [activeTab, user, profile])

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
    syncServerTime().then(() => setCurrentTime(getSecureServerDate()))
    const timer = setInterval(() => setCurrentTime(getSecureServerDate()), 1000)
    
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
        if (window.location.pathname.startsWith('/operator') || window.location.pathname.startsWith('/nonoperator')) return
        const tipe = localStorage.getItem(`guru_tipe_${user.id}`) || profile?.penugasan_tipe || (profile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
        if (tipe === 'tendik' || profile?.role === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(profile?.jabatan)) return
        // Evaluasi apakah penugasan sudah diset
        const savedClasses = JSON.parse(localStorage.getItem(`guru_assigned_classes_${user?.id}`) || '[]')
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
    return getSecureLocalDateString()
  }

  const checkUnsynced = () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    const myOffline = user?.id ? offlineData.filter(d => d.user_id === user.id && d.tanggal > '2026-10-09') : []
    setUnsyncedCount(myOffline.length)
  }

  const syncOfflineData = async () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    if (offlineData.length === 0) return

    setLoading(true)
    let syncSuccessCount = 0
    const remainingOffline = []
    
    for (const record of offlineData) {
      // Abaikan data lama / duplikat uji coba sebelum 10 Okt 2026
      if (!record.user_id || !record.tanggal || record.tanggal <= '2026-10-09') {
        continue
      }
      if (user?.id && record.user_id !== user.id) {
        remainingOffline.push(record)
        continue
      }
      if (record.jenis === 'masuk') {
        const { data: exist } = await supabase.from('absensi').select('id').eq('user_id', record.user_id).eq('tanggal', record.tanggal).limit(1)
        if (!exist || exist.length === 0) {
          const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: 'hadir' })
          if (!error) syncSuccessCount++
        }
      } else if (record.jenis === 'pulang') {
        const { error } = await supabase.from('absensi').update({ waktu_pulang: record.waktu, lokasi_pulang: record.loc }).eq('user_id', record.user_id).eq('tanggal', record.tanggal)
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'sakit' || record.jenis === 'izin') {
        const { data: exist } = await supabase.from('absensi').select('id').eq('user_id', record.user_id).eq('tanggal', record.tanggal).limit(1)
        if (!exist || exist.length === 0) {
          const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: record.jenis, keterangan: record.keterangan })
          if (!error) syncSuccessCount++
        }
      } else if (record.jenis === 'tugas_luar') {
        const { data: exist } = await supabase.from('absensi').select('id').eq('user_id', record.user_id).eq('tanggal', record.tanggal).limit(1)
        if (!exist || exist.length === 0) {
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
    }
    
    if (remainingOffline.length > 0) {
      localStorage.setItem('offlineAbsensi', JSON.stringify(remainingOffline))
    } else {
      localStorage.removeItem('offlineAbsensi')
    }
    setUnsyncedCount(0)
    setLoading(false)
    if (syncSuccessCount > 0) {
      showPopup("Sinkronisasi Selesai", `${syncSuccessCount} data luring telah disinkronkan ke server.`, "success")
      fetchUser() // Refresh UI
    }
  }

  const fetchUser = async (overrideTeacherId = null) => {
    try {
      // Cek jika sedang dibuka oleh Akun Pengembang (Super Admin Mode)
      const devSession = localStorage.getItem('panrita_developer_session')
      let currentUser = null
      let currentProfile = null
      const isDev = Boolean(devSession)

      // Ambil seluruh data guru terdaftar
      const { data: profilesAll } = await supabase.from('profiles').select('id, full_name, email, role, jabatan, mata_pelajaran, foto_profil, nip')
      if (profilesAll) setAllProfiles(profilesAll)

      const activeTargetId = overrideTeacherId !== null ? overrideTeacherId : selectedViewTeacherId

      // Cek apakah ada sesi Supabase Auth resmi yang sedang aktif
      const { data: authUserData } = await supabase.auth.getUser()
      const realSupabaseUser = authUserData?.user || null

      if (isDev && (!realSupabaseUser || activeTargetId)) {
        try {
          const parsed = JSON.parse(devSession)
          if (parsed && parsed.user && parsed.expiresAt > Date.now()) {
            // Jika memilih guru tertentu untuk diinspeksi (Mode Lihat)
            if (activeTargetId && profilesAll) {
              const matched = profilesAll.find(p => p.id === activeTargetId)
              if (matched) {
                currentUser = {
                  id: matched.id,
                  email: matched.email,
                  full_name: matched.full_name || matched.email,
                  role: matched.role || 'guru',
                  isDeveloperPreview: true,
                  inspectingTeacher: true
                }
                currentProfile = { ...matched }
              }
            }

            if (!currentUser && !realSupabaseUser) {
              const isRouteOp = window.location.pathname.startsWith('/operator') || roleOverride === 'operator'
              const isRouteNonOp = window.location.pathname.startsWith('/nonoperator') || roleOverride === 'nonoperator'
              currentUser = {
                id: parsed.user.id || 'developer-master-uid',
                email: parsed.user.email || 'developer@panrita.edu',
                full_name: parsed.user.full_name || 'Pengembang Sistem (Super Admin)',
                role: isRouteNonOp ? 'nonoperator' : isRouteOp ? 'operator' : 'guru',
                isDeveloperPreview: true
              }
              currentProfile = {
                id: currentUser.id,
                full_name: currentUser.full_name,
                email: currentUser.email,
                role: currentUser.role,
                jabatan: isRouteNonOp ? 'Pustakawan' : isRouteOp ? 'Operator Sekolah' : undefined,
                penugasan_tipe: (isRouteOp || isRouteNonOp) ? 'tendik' : 'guru_kelas'
              }
            }
          }
        } catch (e) {}
      }

      if (!currentUser) {
        if (!realSupabaseUser) return navigate('/')
        currentUser = realSupabaseUser
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', realSupabaseUser.id).maybeSingle()
        currentProfile = profile

        if (profile?.role === 'admin') return navigate('/admin')
        if (profile?.role === 'kepsek') return navigate('/kepsek')
      }

      setUser(currentUser)
      if (currentProfile) setProfile(currentProfile)
      const existingGeminiKey = await loadSavedGeminiKeyAsync(currentUser.id, currentUser, currentProfile)
      setGeminiApiKey(existingGeminiKey)
      
      let { data: cls } = await supabase.from('classes').select('*').order('name', { ascending: true })
      if (!cls || cls.length === 0) {
        try {
          const defaultSDClasses = [
            { name: 'Kelas 1' },
            { name: 'Kelas 2' },
            { name: 'Kelas 3' },
            { name: 'Kelas 4' },
            { name: 'Kelas 5' },
            { name: 'Kelas 6' }
          ]
          const { data: seeded } = await supabase.from('classes').insert(defaultSDClasses).select()
          if (seeded && seeded.length > 0) {
            cls = seeded
          }
        } catch (e) {
          console.warn('Could not auto-seed classes:', e)
        }
      }
      if (cls) setClassesList(cls)

      // Sinkronisasi daftar mata pelajaran & penugasan guru dari cloud database
      await syncCloudSubjects(supabase)
      const cloudAssignments = await syncCloudTeacherAssignments(supabase)
      const myCloudAssignment = cloudAssignments?.[currentUser.id]

      // Cek apakah akun ini dikonfigurasi sebagai Tendik di cloud, route, atau profil
      const isRouteTendik = !activeTargetId && (window.location.pathname.startsWith('/operator') || window.location.pathname.startsWith('/nonoperator') || roleOverride === 'operator' || roleOverride === 'nonoperator')
      const isTendikFromCloud = isRouteTendik || myCloudAssignment?.tipe === 'tendik' || currentProfile?.role === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(myCloudAssignment?.jabatan || currentProfile?.jabatan)

      // Cari apakah guru ini sudah memiliki kelas di tabel classes Supabase (sumber utama)
      const dbMyClass = isTendikFromCloud ? null : cls?.find(c => c.teacher_id === currentUser.id)

      // Ambil data penugasan kelas guru dari database & cloud terlebih dahulu (agar tidak pernah hilang saat ganti perangkat/akun baru)
      let storedAssigned = []
      if (isTendikFromCloud) {
        storedAssigned = []
      } else if (dbMyClass) {
        storedAssigned = [dbMyClass.id]
      } else if (myCloudAssignment && Array.isArray(myCloudAssignment.assignedClasses) && myCloudAssignment.assignedClasses.length > 0) {
        storedAssigned = myCloudAssignment.assignedClasses
      } else {
        try {
          const rawAssigned = await getLocalPref(`guru_assigned_classes_${currentUser.id}`, null)
          if (rawAssigned) {
            storedAssigned = typeof rawAssigned === 'string' ? JSON.parse(rawAssigned) : rawAssigned
          }
        } catch (err) {
          console.error('Error parsing assigned classes:', err)
        }
      }
      setAssignedClasses(storedAssigned)

      // Cek apakah tipe dan mapel penugasan sudah diatur di cloud atau local
      const userTipe = isTendikFromCloud ? 'tendik' : (myCloudAssignment?.tipe || (dbMyClass ? 'guru_kelas' : await getLocalPref(`guru_tipe_${currentUser.id}`, currentProfile?.penugasan_tipe || (currentProfile?.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas'))))
      setGuruTipeState(userTipe)

      const userMapel = myCloudAssignment?.mapel || currentProfile?.mata_pelajaran || await getLocalPref(`guru_mapel_${currentUser.id}`, '')
      setGuruMapelState(userMapel)

      const defaultTendikJabatan = (window.location.pathname.startsWith('/nonoperator') || roleOverride === 'nonoperator') ? 'Pustakawan' : 'Operator Sekolah'
      const userJabatan = myCloudAssignment?.jabatan || currentProfile?.jabatan || (userTipe === 'tendik' ? defaultTendikJabatan : currentProfile?.jabatan)

      // Sinkronisasi tipe perangkat dari cloud / profil / lokal
      const userTipePerangkat = myCloudAssignment?.tipe_perangkat || currentProfile?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${currentUser.id}`) || 'android';
      localStorage.setItem(`guru_tipe_perangkat_${currentUser.id}`, userTipePerangkat);

      // Merge data penugasan ke profile state
      const mergedProfile = {
        ...(currentProfile || {}),
        penugasan_tipe: userTipe,
        jabatan: userJabatan,
        mata_pelajaran: userMapel,
        tipe_perangkat: userTipePerangkat
      }
      setProfile(mergedProfile)

      // Pastikan tersimpan sinkron di localStorage perangkat ini
      if (storedAssigned.length > 0) {
        localStorage.setItem(`guru_assigned_classes_${currentUser.id}`, JSON.stringify(storedAssigned))
      }
      if (userTipe) {
        localStorage.setItem(`guru_tipe_${currentUser.id}`, userTipe)
        localStorage.setItem(`penugasan_tipe_${currentUser.id}`, userTipe)
      }
      if (userMapel) localStorage.setItem(`guru_mapel_${currentUser.id}`, userMapel)
      if (userJabatan) {
        localStorage.setItem(`guru_jabatan_${currentUser.id}`, userJabatan)
        localStorage.setItem(`tendik_penugasan_${currentUser.id}`, userJabatan)
      }

      // Hanya tampilkan reminder penugasan jika akun guru belum pernah disetting (Tendik tidak butuh rombel kelas)
      const isTendikCheck = isTendikFromCloud || mergedProfile?.role === 'tendik' || mergedProfile?.penugasan_tipe === 'tendik' || userTipe === 'tendik' || ['Operator Dapodik', 'Operator Sekolah', 'Pustakawan', 'Bujang', 'Satpam'].includes(mergedProfile?.jabatan)
      const isConfigured = isTendikCheck
        ? true
        : (userTipe === 'guru_mapel' 
            ? (Boolean(userMapel) && storedAssigned.length > 0)
            : (storedAssigned.length > 0 || Boolean(dbMyClass)))

      if (!isConfigured) {
        setShowAssignmentReminder(true)
      } else {
        setShowAssignmentReminder(false)
      }

      // Bersihkan sisa data uji coba lama (<= 2026-10-09) pada akun Tendik (Operator / Non-Operator)
      if (isTendikCheck && currentUser.id && currentUser.id !== 'developer-master-uid' && currentUser.id !== 'admin-master-uid') {
        try {
          await supabase.from('absensi').delete().eq('user_id', currentUser.id).lte('tanggal', '2026-10-09')
        } catch {}
      }

      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      const hariKerjaVal = settings?.hari_kerja || 5
      setHariKerja(hariKerjaVal)
      const hariKerja = hariKerjaVal
      if (settings?.nama_sekolah) {
        setSchoolName(settings.nama_sekolah)
      }

      // Ambil data Kepala Sekolah dan NIP dari Pengaturan Aplikasi (cloud config, panrita_kop_surat & profiles role kepsek)
      let pName = ''
      let pNip = ''
      try {
        const kData = await loadKepsekConfigFromCloud({ supabase })
        if (kData) {
          pName = kData.kepsekNama || ''
          pNip = kData.kepsekNip || ''
        }
      } catch (e) {
        console.warn('Gagal load kepsek config:', e)
      }

      setSchoolInfoData(prev => ({
        ...prev,
        schoolName: settings?.nama_sekolah || prev.schoolName,
        principalName: pName || prev.principalName,
        principalNIP: pNip || prev.principalNIP,
        teacherName: profile?.full_name || user?.full_name || prev.teacherName,
        teacherNIP: profile?.nip || user?.nip || prev.teacherNIP
      }))
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

      const { data: absensiList } = await supabase.from('absensi').select('*').eq('user_id', currentUser.id).eq('tanggal', today).order('waktu_masuk', { ascending: false }).limit(1)
        
      const absensi = absensiList && absensiList.length > 0 ? absensiList[0] : null;

      if (absensi && absensi.waktu_masuk) {
        setHasCheckedIn(true)
        setTodayStatus(absensi.status)
        setTodayAbsensi(absensi)
      } else {
        // Also check if there's offline check-in for today belonging to currentUser
        const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
        const offlineToday = offlineData.find(d => d.user_id === currentUser.id && d.tanggal === today && (d.jenis === 'masuk' || d.jenis === 'sakit' || d.jenis === 'izin' || d.jenis === 'tugas_luar'))
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

      // Muat ulang riwayat kehadiran untuk akun aktif ini
      await loadHistory(historyMonth, currentUser, isTendikCheck)

      // Fetch Pengumuman
      const { data: pData } = await supabase.from('pengumuman')
         .select('*')
         .or(`target_type.eq.all,target_users.ilike.%${currentUser.id}%`)
         .order('created_at', { ascending: false })
         .limit(20)
         
      if (pData) {
         const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${currentUser.id}`) || '{"read":[], "deleted":[]}')
         const activePengumuman = pData.filter(p => {
           if (localData.deleted.includes(p.id)) return false
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

  const loadHistory = async (targetMonth = historyMonth, overrideUser = null, forceTendikClean = null) => {
    const activeUser = overrideUser || user
    if (!activeUser?.id || activeUser.id === 'developer-master-uid' || activeUser.id === 'admin-master-uid') {
      setHistoryList([])
      setHistoryLoading(false)
      return
    }
    setHistoryLoading(true)
    try {
      const [year, month] = targetMonth.split('-')
      const firstDay = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
      const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')

      const isCurrentUserTendik = forceTendikClean !== null ? forceTendikClean : isTendikUser

      // Jika akun Tendik (Operator / Non-Operator), pastikan data uji coba lama (<= 2026-10-09) dihapus
      if (isCurrentUserTendik) {
        try {
          await supabase.from('absensi').delete().eq('user_id', activeUser.id).lte('tanggal', '2026-10-09')
        } catch {}
      }

      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', activeUser.id)
        .gte('tanggal', firstDay)
        .lte('tanggal', lastDay)
        .order('tanggal', { ascending: false })
        .order('waktu_masuk', { ascending: false })

      if (!error && data) {
        const regAt = localStorage.getItem(`account_registered_at_${activeUser.id}`)
        const regTime = regAt ? new Date(regAt).getTime() : 0
        const seenDates = new Set()
        const duplicateIds = []
        const cleaned = []

        for (const row of data) {
          // Saring baris uji coba lama pada akun Tendik (Operator & Non-Operator)
          if (isCurrentUserTendik && row.tanggal <= '2026-10-09') {
            if (row.id) duplicateIds.push(row.id)
            continue
          }
          // Saring baris sebelum waktu registrasi akun baru
          if (regTime > 0 && row.created_at && new Date(row.created_at).getTime() < regTime - 5000) {
            if (row.id) duplicateIds.push(row.id)
            continue
          }
          // Deduplikasi baris ganda di tanggal yang sama (hanya simpan 1 baris terbaru per tanggal)
          if (seenDates.has(row.tanggal)) {
            if (row.id) duplicateIds.push(row.id)
            continue
          }
          seenDates.add(row.tanggal)
          cleaned.push(row)
        }

        if (duplicateIds.length > 0) {
          supabase.from('absensi').delete().in('id', duplicateIds).then(() => {}).catch(() => {})
        }

        setHistoryList(cleaned)
      } else {
        setHistoryList([])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'riwayat' && user?.id) {
      loadHistory(historyMonth, user)
    }
  }, [activeTab, user?.id, historyMonth, isTendikUser])

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
    // Kebijakan Keamanan: Presensi HANYA diizinkan melalui APK resmi (Android) atau Safari/Chrome asli (iPhone/iOS)
    const platformCheck = verifyAttendancePlatform(profile || user, isIncognito)

    if (!platformCheck.allowed && (jenis === 'masuk' || jenis === 'pulang' || jenis === 'sakit' || jenis === 'izin' || jenis === 'tugas_luar')) {
      const title = platformCheck.platform === 'incognito_blocked' 
        ? "Tab Samaran Terdeteksi" 
        : platformCheck.platform === 'cross_device_blocked' 
          ? "Akses Perangkat Ditolak" 
          : "Presensi Ditolak (Gunakan Aplikasi)"
      showPopup(
        title,
        platformCheck.message,
        "error"
      )
      return
    }

    setLoading(true)
    try {
      const position = await getSecureLocation({ enableHighAccuracy: true, timeout: 10000 })
      
      // Deteksi Fake GPS / Mock Location
      if (position.isMock) {
        showPopup(
          "Peringatan Fake GPS",
          "Aplikasi mendeteksi penggunaan Fake GPS / Lokasi Palsu. Silakan matikan aplikasi Fake GPS untuk melakukan presensi.",
          "error"
        )
        setLoading(false)
        return
      }

      const userLat = position.latitude
      const userLng = position.longitude
      const loc = `${userLat}, ${userLng}`
      const today = getLocalDateString()
      const now = getSecureServerIsoString()

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
          const { data: existRows } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).limit(1)
          let insData = existRows?.[0] || null
          if (!insData) {
            const { data: createdRows, error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' }).select().limit(1)
            if (error) throw error
            insData = createdRows?.[0] || null
          }
          setHasCheckedIn(true)
          setTodayStatus('hadir')
          setTodayAbsensi(insData || { user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
          showPopup("Absen Berhasil!", "Data jam masuk Anda telah tersimpan ke sistem.", "success")
        } else if (jenis === 'pulang') {
          const { data: updRows, error } = await supabase.from('absensi').update({ waktu_pulang: now, lokasi_pulang: loc }).eq('user_id', user.id).eq('tanggal', today).select().limit(1)
          if (error) throw error
          setTodayAbsensi(prev => ({ ...(prev || {}), ...(updRows?.[0] || {}), waktu_pulang: now, lokasi_pulang: loc }))
          showPopup("Pulang Tercatat!", "Terima kasih atas kerja keras Anda hari ini.", "success")
        } else if (jenis === 'sakit' || jenis === 'izin') {
          const { data: existRows } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).limit(1)
          let izinData = null
          if (existRows && existRows.length > 0) {
            const { data: updRows, error } = await supabase.from('absensi').update({ waktu_masuk: now, lokasi_masuk: loc, status: jenis, keterangan: keterangan }).eq('id', existRows[0].id).select().limit(1)
            if (error) throw error
            izinData = updRows?.[0] || null
          } else {
            const { data: createdRows, error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan }).select().limit(1)
            if (error) throw error
            izinData = createdRows?.[0] || null
          }
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
    } catch (err) {
      showPopup("Akses Lokasi Gagal", err?.message || "Mohon pastikan GPS aktif dan izin lokasi telah diberikan.", "error")
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
    const getCoordinates = async () => {
      try {
        const pos = await getSecureLocation({ timeout: 7000, enableHighAccuracy: true })
        if (pos.isMock) {
          return 'Lokasi Tugas Luar (Mock GPS Detected)'
        }
        return `${pos.latitude}, ${pos.longitude}`
      } catch {
        return 'Lokasi Tugas Luar'
      }
    }

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

  // Handler simpan profil & penugasan wajib untuk akun baru
  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    setOnboardingSaving(true);
    const fd = new FormData(e.target);
    const fullName = fd.get('onboarding_full_name');
    const nip = fd.get('onboarding_nip');
    const tipePerangkat = fd.get('onboarding_tipe_perangkat') || 'android';
    const tipePenugasan = fd.get('onboarding_tipe') || 'guru_kelas';

    let formattedJabatan = 'Guru Kelas';
    let mapel = '';
    let selectedClasses = [];

    if (tipePenugasan === 'guru_kelas') {
      const kelasWali = fd.get('onboarding_kelas_wali');
      selectedClasses = kelasWali ? [kelasWali] : [];
      const clsName = classesList.find(c => c.id === kelasWali)?.name || '';
      formattedJabatan = clsName ? `Guru Kelas ${clsName}` : 'Guru Kelas';
    } else if (tipePenugasan === 'guru_mapel') {
      mapel = fd.get('onboarding_mata_pelajaran') || '';
      selectedClasses = fd.getAll('onboarding_assigned_classes') || [];
      if (!selectedClasses || selectedClasses.length === 0) {
        setOnboardingSaving(false);
        alert('Mohon centang minimal 1 rombel kelas yang Anda ajar untuk mata pelajaran ini.');
        return;
      }
      formattedJabatan = mapel ? `Guru ${mapel} • Guru Mapel` : 'Guru Mapel';
    } else if (tipePenugasan === 'tendik') {
      formattedJabatan = fd.get('onboarding_tendik_jabatan') || 'Operator Dapodik';
      selectedClasses = [];
    }

    try {
      // 1. Update Supabase profiles
      const profileUpdates = {
        full_name: fullName,
        nip: nip || '',
        jabatan: formattedJabatan
      };
      if (mapel) profileUpdates.mata_pelajaran = mapel;

      const { error } = await supabase.from('profiles').update(profileUpdates).eq('id', user.id);
      if (error) console.warn('Profile DB update:', error);

      // 2. Save to Cloud Assignments
      await saveTeacherAssignmentToCloud({
        teacherId: user.id,
        tipe: tipePenugasan,
        mapel: mapel,
        jabatan: formattedJabatan,
        assignedClasses: selectedClasses,
        tipe_perangkat: tipePerangkat,
        supabase
      });

      // 3. Update localStorage
      localStorage.setItem(`guru_tipe_${user.id}`, tipePenugasan);
      localStorage.setItem(`guru_mapel_${user.id}`, mapel);
      localStorage.setItem(`guru_assigned_classes_${user.id}`, JSON.stringify(selectedClasses));
      localStorage.setItem(`guru_tipe_perangkat_${user.id}`, tipePerangkat);
      localStorage.setItem(`guru_penugasan_configured_${user.id}`, 'true');

      if (tipePenugasan === 'tendik') {
        const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(formattedJabatan);
        localStorage.setItem(`tendik_kategori_${user.id}`, isNonOp ? 'non_operator' : 'operator');
        localStorage.setItem(`tendik_penugasan_${user.id}`, formattedJabatan);
        localStorage.setItem(`panrita_role_${user.id}`, isNonOp ? 'nonoperator' : 'operator');
      }

      // Update classes list jika guru kelas
      if (tipePenugasan === 'guru_kelas' && selectedClasses.length > 0) {
        const newlyPickedId = selectedClasses[0];
        setClassesList(prev => prev.map(c => {
          if (c.id === newlyPickedId) return { ...c, teacher_id: user.id };
          if (c.teacher_id === user.id) return { ...c, teacher_id: null };
          return c;
        }));
      }

      // 4. Update component state
      setProfile(prev => ({
        ...prev,
        ...profileUpdates,
        penugasan_tipe: tipePenugasan,
        tipe_perangkat: tipePerangkat
      }));
      setGuruTipeState(tipePenugasan);
      setGuruMapelState(mapel);
      setAssignedClasses(selectedClasses);
      setShowAssignmentReminder(false);

      showPopup("Berhasil!", "Profil dan penugasan Anda berhasil disimpan. Akses aplikasi kini aktif!", "success");
    } catch (err) {
      alert("Gagal menyimpan profil: " + err.message);
    } finally {
      setOnboardingSaving(false);
    }
  };

  return (
    <div className={`guru-container ${isDesktop ? 'desktop-mode' : ''}`} style={{ paddingBottom: !isDesktop ? '90px' : '2rem' }}>
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

      {/* Modal Wajib Lengkapi Profil & Penugasan Akun Baru (Muncul dan Mengunci Hingga Pengguna Selesai Mengisi) */}
      {showAssignmentReminder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: '24px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              border: '1.5px solid #E2E8F0',
              textAlign: 'left'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.75rem auto',
                  border: '1.5px solid #C7D2FE'
                }}
              >
                <Briefcase size={32} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1E293B', margin: '0 0 0.35rem 0' }}>
                Lengkapi Profil & Penugasan Wajib
              </h3>
              <p style={{ fontSize: '0.825rem', color: '#64748B', lineHeight: '1.45', margin: 0 }}>
                Selamat datang! Untuk mengaktifkan fitur presensi mandiri dan akses pembelajaran, silakan lengkapi profil dan penugasan Anda terlebih dahulu.
              </p>
              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px', fontSize: '0.75rem', color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'left' }}>
                <span>⚠️</span>
                <span><strong>Wajib Diisi:</strong> Pengaturan ini diperlukan agar jenis perangkat dan rombel penugasan Anda terdaftar di sistem.</span>
              </div>
            </div>

            <form onSubmit={handleOnboardingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="input-group">
                <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Nama Lengkap & Gelar</label>
                <input 
                  type="text" 
                  name="onboarding_full_name" 
                  className="input" 
                  defaultValue={profile?.full_name || ''} 
                  placeholder="Contoh: Ahmad Yani, S.Pd." 
                  required 
                />
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>NIP / ID Pegawai</label>
                <input 
                  type="text" 
                  name="onboarding_nip" 
                  className="input" 
                  defaultValue={profile?.nip || ''} 
                  placeholder="Contoh: 198012312005011002" 
                />
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Tipe Perangkat Presensi</label>
                <select 
                  name="onboarding_tipe_perangkat" 
                  className="input" 
                  defaultValue={profile?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${user?.id}`) || 'android'}
                  style={{ fontWeight: '600' }}
                >
                  <option value="android">📱 Android (Aplikasi Resmi APK)</option>
                  <option value="iphone">🍏 iPhone (Browser Safari & Chrome)</option>
                </select>
                <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  *Pengguna Android wajib presensi di APK resmi. Pengguna iPhone dapat presensi via Safari atau Chrome iOS.
                </small>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Tipe Penugasan Guru / Pegawai</label>
                <select 
                  name="onboarding_tipe" 
                  className="input" 
                  value={onboardingTipe}
                  onChange={(e) => setOnboardingTipe(e.target.value)}
                  style={{ fontWeight: '600' }}
                >
                  <option value="guru_kelas">Guru Kelas (Wali Kelas)</option>
                  <option value="guru_mapel">Guru Mata Pelajaran (Bidang Studi)</option>
                  <option value="tendik">Tenaga Kependidikan (Tendik)</option>
                </select>
              </div>

              {onboardingTipe === 'guru_kelas' && (
                <div className="input-group">
                  <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Pilih Kelas / Rombel Binaan</label>
                  {(() => {
                    const takenMap = getClassesTakenByOtherTeachers(user?.id, allProfiles, classesList)
                    return (
                      <select name="onboarding_kelas_wali" className="input" defaultValue={assignedClasses[0] || ''} required>
                        <option value="">-- Pilih Kelas (Wali Kelas) --</option>
                        {classesList.map(c => {
                          const isTaken = Boolean(takenMap[c.id])
                          const takenBy = takenMap[c.id]?.teacherName || 'Guru Lain'
                          return (
                            <option key={c.id} value={c.id} disabled={isTaken} style={{ color: isTaken ? '#94A3B8' : 'inherit' }}>
                              {c.name} {isTaken ? `(🔒 Terkunci: ${takenBy})` : ''}
                            </option>
                          )
                        })}
                      </select>
                    )
                  })()}
                </div>
              )}

              {onboardingTipe === 'guru_mapel' && (
                <>
                  <div className="input-group">
                    <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Mata Pelajaran Utama</label>
                    <select 
                      name="onboarding_mata_pelajaran" 
                      className="input" 
                      value={onboardingMapel}
                      onChange={(e) => setOnboardingMapel(e.target.value)}
                      required
                    >
                      <option value="">-- Pilih Mata Pelajaran --</option>
                      {getCustomSubjects().map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Centang Semua Kelas yang Diajar</label>
                    <div style={{ maxHeight: '130px', overflowY: 'auto', background: '#F8FAFC', padding: '0.65rem', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {classesList.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Belum ada daftar kelas dari Admin.</span>
                      ) : (
                        classesList.map(cls => (
                          <label key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              name="onboarding_assigned_classes" 
                              value={cls.id} 
                              defaultChecked={assignedClasses.includes(cls.id)} 
                            />
                            <span style={{ fontWeight: 600, color: '#1E293B' }}>{cls.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {onboardingTipe === 'tendik' && (
                <div className="input-group">
                  <label className="input-label" style={{ fontWeight: '600', fontSize: '0.85rem' }}>Tugas & Jabatan Tendik</label>
                  <select name="onboarding_tendik_jabatan" className="input" defaultValue="Operator Dapodik" style={{ fontWeight: '600' }}>
                    <optgroup label="Akun Operator (Presensi & Master KBM)">
                      <option value="Operator Dapodik">💻 Operator Dapodik</option>
                      <option value="Operator Sekolah">🖥️ Operator Sekolah</option>
                    </optgroup>
                    <optgroup label="Akun Non-Operator (Presensi & Kehadiran)">
                      <option value="Pustakawan">📚 Pustakawan</option>
                      <option value="Bujang">🧹 Bujang (Kebersihan / Pelaksana)</option>
                      <option value="Satpam">🛡️ Satpam (Keamanan)</option>
                    </optgroup>
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={onboardingSaving}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  borderRadius: '14px',
                  fontWeight: 'bold',
                  fontSize: '0.95rem',
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <CheckCircle2 size={18} />
                <span>{onboardingSaving ? 'Menyimpan Profil...' : 'Simpan Profil & Buka Akses Aplikasi'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <GuruDesktopWrapper
        isDesktop={isDesktop}
        schoolLogo={schoolLogo}
        schoolName={schoolName}
        activeTab={activeTab}
        setActiveTab={handleTabChangeWithUrl}
        kbmSubTab={kbmSubTab}
        handleTabChangeWithUrl={handleTabChangeWithUrl}
        checkAssignmentConfigured={checkAssignmentConfigured}
        setShowAssignmentReminder={setShowAssignmentReminder}
        showPopup={showPopup}
        loadHistory={loadHistory}
        profile={profile}
        user={user}
        isTendikUser={isTendikUser}
        isOpUser={isOpUser}
        isNonOpUser={isNonOpUser}
        guruTipeState={guruTipeState}
        allProfiles={allProfiles}
        selectedViewTeacherId={selectedViewTeacherId}
        onSelectTeacher={(tId) => {
          setSelectedViewTeacherId(tId)
          fetchUser(tId)
        }}
        currentTime={currentTime}
        toggleTheme={toggleTheme}
        darkMode={darkMode}
        navigate={navigate}
      >

      {/* Header ID Card (Hanya Tampil di Mode HP, di Desktop sudah ada Sidebar + Topbar) */}
      {!isDesktop && (
        <div className="card-gradient no-print" style={{ padding: '1.15rem 1.25rem 0.85rem 1.25rem', borderRadius: '0 0 20px 20px', marginBottom: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', background: 'rgba(255,255,255,0.18)', padding: '0.2rem 0.65rem', borderRadius: '9999px', backdropFilter: 'blur(8px)' }}>
          <img src={schoolLogo || "/panrita_logo.webp"} alt="Logo" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
          <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'white', letterSpacing: '-0.02em' }}>{schoolLogo ? schoolName : 'GammaraApp'}</span>
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
              onClick={() => handleTabChangeWithUrl('komunikasi')}
              title="Pusat Komunikasi"
              style={{
                background: activeTab === 'komunikasi' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
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
              <MessageSquare size={17} />
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
      )}
      <div style={{ padding: isDesktop ? '0' : '0 1.5rem', width: '100%' }}>
        {/* Peringatan Akses Lintas Perangkat (Android di iPhone / iPhone di Android) */}
        {!crossDeviceStatus.allowed && (
          <div style={{ marginBottom: '1rem', padding: '1rem 1.25rem', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '1rem', color: '#991B1B' }}>
            <AlertCircle size={28} color="#DC2626" style={{ flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Peringatan Akses Perangkat</h4>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{crossDeviceStatus.message}</p>
            </div>
          </div>
        )}

        {/* Banner Mode Pengembang (Mode Lihat Guru) untuk Mobile / HP */}
        {user?.isDeveloperPreview && (
          <div style={{
            background: 'linear-gradient(135deg, #071C35 0%, #0F172A 100%)',
            border: '1.5px solid #00B4D8',
            borderRadius: '16px',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            boxShadow: '0 4px 15px rgba(0, 180, 216, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.68rem', background: '#00B4D8', color: '#071C35', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 800 }}>
                  SUPER ADMIN
                </span>
                <span style={{ fontSize: '0.78rem', color: '#E2E8F0', fontWeight: 700 }}>
                  Mode Lihat Akun Guru
                </span>
              </div>
              <button
                onClick={() => navigate('/pengembang')}
                style={{
                  background: 'rgba(0, 180, 216, 0.15)',
                  border: '1px solid #00B4D8',
                  color: '#00B4D8',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.6rem',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Kembali
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={16} color="#00B4D8" style={{ flexShrink: 0 }} />
              <select
                value={selectedViewTeacherId}
                onChange={(e) => {
                  setSelectedViewTeacherId(e.target.value)
                  fetchUser(e.target.value)
                }}
                style={{
                  width: '100%',
                  background: '#1E293B',
                  color: '#FFFFFF',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  padding: '0.4rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">👤 Akun Pengembang (Super Admin)</option>
                {(allProfiles || [])
                  .filter(p => p.role === 'guru' || p.role === 'guru_kelas' || p.role === 'guru_mapel' || p.role === 'tendik' || p.penugasan_tipe === 'tendik')
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.role === 'tendik' || t.penugasan_tipe === 'tendik' ? '💼' : '👨‍🏫'} {t.full_name || t.email} ({t.mata_pelajaran || t.jabatan || 'Guru'})
                    </option>
                  ))}
              </select>
            </div>
            {profile && profile.id !== 'developer-master-uid' && (
              <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#38BDF8', textAlign: 'center' }}>
                👁️ Anda sedang melihat tampilan sebagai: <strong>{profile.full_name || profile.email}</strong>
              </div>
            )}
          </div>
        )}
        
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

        {activeTab === 'absensi' && (() => {
          const platformCheck = verifyAttendancePlatform(profile || user, isIncognito)

          return (
            <div className="text-center">
              {!isHoliday && !platformCheck.allowed && (
                platformCheck.platform === 'incognito_blocked' ? (
                  <div style={{ margin: '1rem auto', maxWidth: '420px', background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: '16px', padding: '1.25rem', color: '#92400E', textAlign: 'center' }}>
                    <AlertTriangle size={36} color="#D97706" style={{ margin: '0 auto 0.5rem auto' }} />
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Mode Tab Samaran Terdeteksi</h4>
                    <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.82rem', lineHeight: 1.4 }}>{platformCheck.message}</p>
                  </div>
                ) : platformCheck.platform === 'cross_device_blocked' ? (
                  <div style={{ margin: '1rem auto', maxWidth: '420px', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '16px', padding: '1.25rem', color: '#991B1B', textAlign: 'center' }}>
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
              ) : !hasCheckedIn ? (
                platformCheck.allowed ? (
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
                ) : null
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
              ) : platformCheck.allowed ? (
                <button className="btn-clock out" onClick={() => handleAbsen('pulang')} disabled={loading}>
                  <Fingerprint size={48} strokeWidth={1.5} />
                  <span>Clock Out</span>
                </button>
              ) : null}

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
                          <Camera size={16} /> Kamera GTag
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
        )
      })()}

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
                if (guruTipe === 'tendik') {
                  selectedClasses = [];
                } else if (guruTipe === 'guru_kelas') {
                  const kelasWali = formData.get('kelas_wali');
                  if (!kelasWali) {
                    showPopup("Pilih Kelas", "Silakan pilih kelas binaan (Wali Kelas) Anda terlebih dahulu.", "error");
                    setLoading(false);
                    return;
                  }
                  // Cek apakah kelas ini sudah dipilih dan dikunci oleh guru lain
                  const takenMap = getClassesTakenByOtherTeachers(user?.id, allProfiles, classesList);
                  if (takenMap[kelasWali]) {
                    const lockOwner = takenMap[kelasWali].teacherName || 'guru lain';
                    showPopup("Kelas Terkunci", `Kelas ini sudah dipilih dan dikunci oleh ${lockOwner}. Silakan pilih kelas lain.`, "error");
                    setLoading(false);
                    return;
                  }
                  selectedClasses = [kelasWali];
                } else {
                  selectedClasses = formData.getAll('assigned_classes') || [];
                }

                // Format jabatan otomatis jika wali kelas
                if (guruTipe === 'guru_kelas' && selectedClasses.length > 0) {
                  const targetCls = classesList.find(c => c.id === selectedClasses[0]);
                  const clsName = targetCls?.name || '';
                  if (!formattedJabatan || formattedJabatan === 'Guru Kelas') {
                    formattedJabatan = clsName ? `Guru Kelas • Wali ${clsName}` : 'Guru Kelas';
                  }
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
                  // Simpan juga API key jika pengguna mengisinya di halaman profil
                  if (geminiApiKey && geminiApiKey.trim()) {
                    await saveGeminiKey(geminiApiKey, user?.id, supabase);
                  }
                  await setLocalPref(`guru_tipe_${user.id}`, guruTipe);
                  await setLocalPref(`guru_mapel_${user.id}`, mataPelajaran);
                  await setLocalPref(`guru_assigned_classes_${user.id}`, selectedClasses);
                  if (guruTipe === 'tendik') {
                    const isNonOpJabatan = ['Pustakawan', 'Bujang', 'Satpam'].includes(formattedJabatan);
                    localStorage.setItem(`tendik_kategori_${user.id}`, isNonOpJabatan ? 'non_operator' : 'operator');
                    localStorage.setItem(`tendik_penugasan_${user.id}`, formattedJabatan);
                    localStorage.setItem(`panrita_role_${user.id}`, isNonOpJabatan ? 'nonoperator' : 'operator');
                  }
                  
                  const newTipePerangkat = formData.get('tipe_perangkat') || 'android';
                  localStorage.setItem(`guru_tipe_perangkat_${user.id}`, newTipePerangkat);
                  localStorage.setItem(`guru_penugasan_configured_${user.id}`, 'true');

                  // Simpan ke Cloud Supabase & update tabel classes.teacher_id
                  await saveTeacherAssignmentToCloud({
                    teacherId: user.id,
                    tipe: guruTipe,
                    mapel: mataPelajaran,
                    jabatan: formattedJabatan,
                    assignedClasses: selectedClasses,
                    tipe_perangkat: newTipePerangkat,
                    supabase
                  });

                  // Update classesList di state komponen agar dropdown seketika mencerminkan kunci kelas
                  if (guruTipe === 'guru_kelas' && selectedClasses.length > 0) {
                    const newlyPickedId = selectedClasses[0];
                    setClassesList(prev => prev.map(c => {
                      if (c.id === newlyPickedId) return { ...c, teacher_id: user.id };
                      if (c.teacher_id === user.id) return { ...c, teacher_id: null };
                      return c;
                    }));
                  } else if (guruTipe === 'guru_mapel') {
                    setClassesList(prev => prev.map(c => c.teacher_id === user.id ? { ...c, teacher_id: null } : c));
                  }

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
                  showPopup("Tersimpan & Terkunci!", "Profil dan penugasan Anda berhasil disimpan.", "success");
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
                {!isTendikUser && (
                  <div className="input-group">
                    <label className="input-label">Jabatan Struktural / Keterangan</label>
                    <input type="text" name="jabatan" className="input" defaultValue={profile?.jabatan || ''} placeholder="Contoh: Guru Kelas V / Pembina OSIS" />
                  </div>
                )}

                <div className="input-group">
                  <label className="input-label">Tipe Perangkat Presensi Guru</label>
                  <select 
                    name="tipe_perangkat" 
                    className="input" 
                    defaultValue={profile?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${user?.id}`) || 'android'}
                  >
                    <option value="android">📱 Android (Aplikasi Resmi APK)</option>
                    <option value="iphone">🍏 iPhone (Browser Safari & Chrome)</option>
                  </select>
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    *Pengguna Android wajib presensi di APK resmi. Pengguna iPhone diizinkan presensi lewat browser Safari atau Chrome iOS.
                  </small>
                </div>

                {/* Deteksi Akun Tendik vs Guru */}
                {(() => {
                  if (isTendikUser) {
                    return (
                      <div className="input-group" style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', padding: '1rem', borderRadius: '16px', marginTop: '0.75rem' }}>
                        <label className="input-label" style={{ color: '#0369A1', fontWeight: 800 }}>
                          📋 Tugas & Penugasan Tenaga Kependidikan (Tendik)
                        </label>
                        <select 
                          name="jabatan" 
                          className="input" 
                          defaultValue={profile?.jabatan || (isNonOpUser ? 'Pustakawan' : 'Operator Dapodik')}
                          style={{ fontWeight: 700, borderColor: '#7DD3FC' }}
                        >
                          <optgroup label="Akun Operator (Presensi & KBM Siswa/Kelas)">
                            <option value="Operator Dapodik">💻 Operator Dapodik</option>
                            <option value="Operator Sekolah">🖥️ Operator Sekolah</option>
                          </optgroup>
                          <optgroup label="Akun Non-Operator (Presensi & Kehadiran)">
                            <option value="Pustakawan">📚 Pustakawan</option>
                            <option value="Bujang">🧹 Bujang (Kebersihan / Pelaksana)</option>
                            <option value="Satpam">🛡️ Satpam (Keamanan)</option>
                          </optgroup>
                        </select>
                        <input type="hidden" name="penugasan_tipe" value="tendik" />
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#0284C7', lineHeight: 1.4 }}>
                          🔒 <em>Akun Tendik tidak memiliki rombel kelas belajar siswa (tidak memilih kelas).</em>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <>
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
                          {(() => {
                            const takenMap = getClassesTakenByOtherTeachers(user?.id, allProfiles, classesList)
                            return (
                              <>
                                <select 
                                  name="kelas_wali" 
                                  className="input" 
                                  key={`wali-${assignedClasses.join(',')}`}
                                  defaultValue={assignedClasses.length > 0 ? assignedClasses[0] : ''}
                                >
                                  <option value="">-- Pilih Kelas Binaan (Wali Kelas) --</option>
                                  {classesList.map(c => {
                                    const isTaken = Boolean(takenMap[c.id])
                                    const takenBy = takenMap[c.id]?.teacherName || 'Guru Lain'
                                    return (
                                      <option 
                                        key={c.id} 
                                        value={c.id} 
                                        disabled={isTaken}
                                        style={{ color: isTaken ? '#94A3B8' : 'inherit' }}
                                      >
                                        {c.name} {isTaken ? `(🔒 Terkunci: ${takenBy})` : ''}
                                      </option>
                                    )
                                  })}
                                </select>
                                <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                  Pilih rombel kelas yang Anda bina sebagai Wali Kelas. Kelas yang sudah dipilih oleh guru kelas lain otomatis terkunci (🔒).
                                </small>
                              </>
                            )
                          })()}
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
                    </>
                  )
                })()}

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
                    const saved = await saveGeminiKey(geminiApiKey, user?.id, supabase)
                    if (profile) setProfile(prev => ({ ...prev, gemini_api_key: saved }))
                    setGeminiSavedMessage('API Key Gemini Anda berhasil disimpan secara permanen!')
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

            <button
              type="button"
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin keluar dari akun?')) {
                  localStorage.removeItem('panrita_developer_session')
                  supabase.auth.signOut().then(() => navigate('/'))
                }
              }}
              className="btn"
              style={{
                width: '100%',
                marginTop: '1.25rem',
                padding: '0.95rem',
                background: '#FEF2F2',
                color: '#EF4444',
                border: '1px solid #FCA5A5',
                borderRadius: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer'
              }}
            >
              <LogOut size={18} />
              <span>Keluar dari Akun</span>
            </button>
          </div>
        )}

        {activeTab === 'riwayat' && (
          <div className="fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>Riwayat Kehadiran</h3>
             </div>

             <RekapPresensiPegawai
               role={isTendikUser ? 'tendik' : 'guru'}
               mode="personal"
               currentUser={{ id: user?.id, ...(profile || {}) }}
               pegawaiList={profile ? [{ id: user?.id, ...profile }] : []}
               absensiData={historyList}
               loading={historyLoading}
               selectedMonth={historyMonth}
               onMonthChange={(m) => {
                 setHistoryMonth(m)
                 loadHistory(m, user)
               }}
               schoolName={schoolName}
               schoolLogo={schoolLogo}
               hariKerja={hariKerja}
               onExportExcel={downloadHistoryExcel}
               onExportPdf={downloadHistoryPDF}
             />
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

        {activeTab === 'komunikasi' && (
          <div className="fade-in">
            <PusatKomunikasi user={profile || user} supabase={supabase} darkMode={darkMode} />
          </div>
        )}
        {/* Tab KBM / Pembelajaran (Input Jurnal, Presensi Murid, Nilai, Rekap, Master KBM) */}
        {activeTab === 'kbm' && !isNonOpUser && (() => {
          const isOp = isOpUser

          // Jika Operator: langsung tampilkan Master Siswa & Kelas (dibatasi khusus menambah, mengedit & menghapus nama siswa dan kelas)
          if (isOp) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <MasterSiswaDanKelas
                  user={{ ...user, ...profile }}
                  profile={profile}
                  schoolInfo={schoolInfoData}
                  onRefresh={fetchUser}
                  isOperatorMode={true}
                />
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {kbmSubTab === 'menu' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Header Title KBM */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>
                        {isOp ? 'Master KBM (Operator Sekolah)' : 'Sistem Pembelajaran'}
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                        {isOp ? 'Kelola basis data kelas rombel dan siswa' : 'Pilih modul kegiatan belajar mengajar'}
                      </p>
                    </div>
                    {!isOp && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#4F46E5', background: '#EEF2FF', padding: '4px 10px', borderRadius: '12px' }}>
                        {filteredClassesList.length} Rombel Diampu
                      </span>
                    )}
                  </div>

                  {/* Grid Menu Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Guru: Tampilkan Modul Ajar AI, Presensi Siswa, Jurnal, Nilai, Rekap */}
                    {!isOp && (
                      <>
                        {/* Card Utama: Pembuatan Modul Ajar AI (RPM Deep Learning) */}
                        <div
                          onClick={() => handleTabChangeWithUrl('kbm', 'modul_ajar')}
                          className="card"
                          style={{
                            padding: '1.2rem 1.35rem',
                            borderRadius: '22px',
                            background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxShadow: '0 8px 20px rgba(67, 56, 202, 0.25)',
                            transition: 'all 0.2s',
                            marginBottom: '0.25rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '50px', height: '50px', borderRadius: '16px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBBF24', flexShrink: 0 }}>
                              <Sparkles size={26} />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <h4 style={{ fontSize: '1rem', fontWeight: '800', color: 'white', margin: 0 }}>Modul Ajar (RPM AI)</h4>
                                <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#FDE047', background: 'rgba(253, 224, 71, 0.2)', padding: '2px 8px', borderRadius: '8px' }}>Deep Learning</span>
                              </div>
                              <p style={{ fontSize: '0.78rem', color: '#E0E7FF', margin: '4px 0 0 0' }}>Susun Rencana Pembelajaran Mendalam, LKPD & Asesmen otomatis dengan AI</p>
                            </div>
                          </div>
                          <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                            <ChevronRight size={20} />
                          </div>
                        </div>

                        {/* Card 1: Presensi Siswa */}
                        <div
                          onClick={() => handleTabChangeWithUrl('kbm', 'presensi_siswa')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'jurnal')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'nilai')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'rekap')}
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
                      </>
                    )}

                    {/* Card 5: Master Siswa & Kelas (Bisa diakses Guru & Operator) */}
                    <div
                      onClick={() => handleTabChangeWithUrl('kbm', 'master_siswa')}
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
                      onClick={() => handleTabChangeWithUrl('kbm')}
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

                    {/* Jika Guru biasa: tampilkan tab navigasi antar sub-modul */}
                    {!isOp ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '2px 0' }}>
                        <button
                          onClick={() => handleTabChangeWithUrl('kbm', 'modul_ajar')}
                          style={{
                            padding: '5px 11px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            background: kbmSubTab === 'modul_ajar' ? '#4338CA' : '#EEF2FF',
                            color: kbmSubTab === 'modul_ajar' ? 'white' : '#4338CA',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Sparkles size={13} color={kbmSubTab === 'modul_ajar' ? '#FBBF24' : '#4338CA'} /> Modul Ajar AI
                        </button>
                        <button
                          onClick={() => handleTabChangeWithUrl('kbm', 'presensi_siswa')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'jurnal')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'nilai')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'rekap')}
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
                          onClick={() => handleTabChangeWithUrl('kbm', 'master_siswa')}
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
                    ) : (
                      <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#334155' }}>
                        ⚙️ Master KBM (Data Kelas & Siswa)
                      </span>
                    )}
                  </div>

                {kbmSubTab === 'modul_ajar' && (
                  <PembuatanModulAjar
                    user={{ ...user, ...profile }}
                    profile={profile}
                    schoolName={schoolName}
                    schoolInfo={schoolInfoData}
                    supabase={supabase}
                    onBack={() => handleTabChangeWithUrl('kbm')}
                  />
                )}

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
        )})()}

        {/* Tab Mandiri: Modul Ajar AI */}
        {activeTab === 'modul_ajar' && (
          <div className="fade-in">
            <PembuatanModulAjar
              user={{ ...user, ...profile }}
              profile={profile}
              schoolName={schoolName}
              schoolInfo={schoolInfoData}
              supabase={supabase}
              onBack={() => handleTabChangeWithUrl('kbm')}
            />
          </div>
        )}

        {/* Footer Copyright & Branding GammaraApp */}
        <footer className="guru-footer-branding no-print">
          <div className="gammara-logo" style={{ fontSize: '1.45rem', marginBottom: '0.25rem' }}>
            <span className="gammara">Gammara</span><span className="app">App</span>
          </div>
          <p className="logo-description" style={{ fontSize: '0.8rem', margin: '0 0 2px 0' }}>
            Sistem Manajemen Sekolah Terpadu
          </p>
          <p className="logo-tagline" style={{ fontSize: '0.75rem', margin: '0 0 0.4rem 0' }}>
            Sekolah Tertata, Pembelajaran Berkualitas.
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#94A3B8', fontWeight: '500' }}>
            &copy; {new Date().getFullYear()} GammaraApp. All Rights Reserved
          </p>
        </footer>
      </div>
      </GuruDesktopWrapper>

      {/* Corporate Style Bottom Navigation (Mobile App Shell: APK & Mobile Browser) */}
      {!isDesktop && (
        <nav className="bottom-nav">
          {/* 1. Presensi */}
          <button className={`nav-item ${activeTab === 'absensi' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => handleTabChangeWithUrl('absensi')}>
            <Clock size={20} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.5} /> Presensi
          </button>

          {/* 2. Pembelajaran (KBM) - Hanya untuk GURU, disembunyikan untuk SEMUA TENDIK (Operator & Non-Operator) */}
          {(!isTendikUser && !isOpUser && !isNonOpUser) && (
            <button
              className={`nav-item ${activeTab === 'kbm' || activeTab === 'modul_ajar' ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => {
                if (!checkAssignmentConfigured()) {
                  setShowAssignmentReminder(true);
                  showPopup("Penugasan Belum Diatur", "Silakan lengkapi penugasan kelas atau mata pelajaran di menu Profil terlebih dahulu sebelum membuka Pembelajaran.", "error");
                  return;
                }
                handleTabChangeWithUrl('kbm');
              }}
            >
              <BookOpen size={20} strokeWidth={activeTab === 'kbm' || activeTab === 'modul_ajar' ? 2.5 : 1.5} /> 
              Pembelajaran
            </button>
          )}

          {/* 3. GTag (Kamera Ber-watermark GPS) - Posisi Center / Tengah */}
          <button
            className="nav-item"
            style={{ flex: 1, color: '#0284C7' }}
            onClick={() => setShowCameraModal(true)}
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
            <span style={{ fontSize: '0.7rem', fontWeight: '700' }}>GTag</span>
          </button>

          {/* 4. Riwayat */}
          <button
            className={`nav-item ${activeTab === 'riwayat' ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => {
              handleTabChangeWithUrl('riwayat')
              loadHistory()
            }}
          >
            <History size={20} strokeWidth={activeTab === 'riwayat' ? 2.5 : 1.5} /> Riwayat
          </button>

          {/* 5. Profil */}
          <button className={`nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => handleTabChangeWithUrl('pengaturan')}>
            <UserCircle size={20} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.5} /> Profil
          </button>
        </nav>
      )}

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
