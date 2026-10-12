import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate, useLocation } from 'react-router-dom'
import { 
  LogOut, Clock, CheckCircle, CheckCircle2, Users, UserCircle, 
  Calendar, Fingerprint, Check, WifiOff, RefreshCw, Bell, Trash2, 
  Camera, History, Sun, Moon, MapPin, BookOpen, Layers, ArrowLeft, 
  ChevronRight, Briefcase, Sparkles, Key, Eye, EyeOff, Loader2, AlertCircle, Save, ShieldCheck
} from 'lucide-react'
import CameraTimemarkModal from '../../components/CameraTimemarkModal'
import MasterSiswaDanKelas from '../../components/kbm/MasterSiswaDanKelas'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import { getSecureServerDate, getSecureServerIsoString, getSecureLocalDateString, syncServerTime, getSecureLocation, verifyAttendancePlatform } from '../../lib/security'

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

export default function DashboardOperator() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  
  const [todayAbsensi, setTodayAbsensi] = useState(null)
  const [hasCheckedIn, setHasCheckedIn] = useState(false)
  const [todayStatus, setTodayStatus] = useState(null)
  const [izinMode, setIzinMode] = useState(null)
  const [keterangan, setKeterangan] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  // Tugas Luar State
  const [showTugasLuarModal, setShowTugasLuarModal] = useState(false)
  const [tugasLuarCatatan, setTugasLuarCatatan] = useState('')
  const [tugasLuarFoto, setTugasLuarFoto] = useState(null)
  const [cameraModeForTugasLuar, setCameraModeForTugasLuar] = useState(false)

  // Notifikasi / Pengumuman
  const [pengumumanData, setPengumumanData] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [schoolName, setSchoolName] = useState('Presensia')
  const [schoolLogo, setSchoolLogo] = useState('')
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [popup, setPopup] = useState({ show: false, title: '', message: '', type: 'success' })

  // Riwayat
  const [historyList, setHistoryList] = useState([])
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7))
  const [historyLoading, setHistoryLoading] = useState(false)

  // Geofence & Settings
  const [geofenceSettings, setGeofenceSettings] = useState({ enabled: false, lat: -5.147665, lng: 119.432732, radius: 100 })
  const [darkMode, setDarkMode] = useState(localStorage.getItem('theme_mode') === 'dark')
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 992 : false)

  const [schoolInfoData, setSchoolInfoData] = useState({
    schoolName: 'Presensia',
    principalName: '',
    principalNIP: '',
    kkm: 75,
    appMode: 'SD'
  })

  const navigate = useNavigate()
  const location = useLocation()

  // Sinkronisasi ActiveTab berdasarkan URL pathname (/operator, /operator/master, /operator/riwayat, /operator/pengumuman, /operator/profil)
  const getTabFromPath = (path) => {
    if (path.startsWith('/operator/master')) return 'master'
    if (path.startsWith('/operator/riwayat')) return 'riwayat'
    if (path.startsWith('/operator/pengumuman')) return 'pengumuman'
    if (path.startsWith('/operator/profil') || path.startsWith('/operator/pengaturan')) return 'pengaturan'
    return 'absensi'
  }

  const activeTab = getTabFromPath(location.pathname)

  const handleNavigateTab = (tab) => {
    if (tab === 'absensi') navigate('/operator')
    else if (tab === 'master') navigate('/operator/master')
    else if (tab === 'riwayat') {
      navigate('/operator/riwayat')
      loadHistory()
    }
    else if (tab === 'pengumuman') navigate('/operator/pengumuman')
    else if (tab === 'pengaturan') navigate('/operator/profil')
  }

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 992)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme_mode', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('theme_mode', 'light')
    }
  }, [darkMode])

  const showPopup = (title, message, type = 'success') => {
    setPopup({ show: true, title, message, type })
  }

  useEffect(() => {
    fetchUser()
    syncServerTime().then(() => setCurrentTime(getSecureServerDate()))
    const timer = setInterval(() => setCurrentTime(getSecureServerDate()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchUser = async () => {
    try {
      let currentUser = null
      const { data: sessData } = await supabase.auth.getSession()
      if (sessData?.session?.user) currentUser = sessData.session.user
      
      if (!currentUser) {
        const { data: { user: u } } = await supabase.auth.getUser()
        if (!u) return navigate('/')
        currentUser = u
      }

      setUser(currentUser)
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle()
      if (prof) setProfile(prof)

      // Ambil settings sekolah
      const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      if (settingsData) {
        if (settingsData.nama_sekolah) setSchoolName(settingsData.nama_sekolah)
        if (settingsData.logo_url) setSchoolLogo(settingsData.logo_url)
        setSchoolInfoData({
          schoolName: settingsData.nama_sekolah || 'Presensia',
          principalName: settingsData.nama_kepsek || '',
          principalNIP: settingsData.nip_kepsek || '',
          kkm: settingsData.kkm || 75,
          appMode: settingsData.jenjang_sekolah || 'SD'
        })
        if (settingsData.geofence_enabled !== undefined) {
          setGeofenceSettings({
            enabled: Boolean(settingsData.geofence_enabled),
            lat: settingsData.school_lat ? parseFloat(settingsData.school_lat) : -5.147665,
            lng: settingsData.school_lng ? parseFloat(settingsData.school_lng) : 119.432732,
            radius: settingsData.school_radius ? parseInt(settingsData.school_radius) : 100
          })
        }
      }

      loadTodayAttendance(currentUser.id)
      loadPengumuman()
    } catch (err) {
      console.error(err)
    }
  }

  const loadTodayAttendance = async (userId) => {
    try {
      const today = getSecureLocalDateString()
      const { data } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', userId)
        .eq('tanggal', today)
        .maybeSingle()

      if (data) {
        setTodayAbsensi(data)
        setTodayStatus(data.status)
        setHasCheckedIn(Boolean(data.waktu_masuk))
      } else {
        setTodayAbsensi(null)
        setTodayStatus(null)
        setHasCheckedIn(false)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadPengumuman = async () => {
    try {
      const { data } = await supabase.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(10)
      if (data) {
        setPengumumanData(data)
        setUnreadCount(data.length)
      }
    } catch (e) {}
  }

  const loadHistory = async (monthStr = historyMonth) => {
    if (!user) return
    setHistoryLoading(true)
    try {
      const start = `${monthStr}-01`
      const end = `${monthStr}-31`
      const { data } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', user.id)
        .gte('tanggal', start)
        .lte('tanggal', end)
        .order('tanggal', { ascending: false })
      if (data) setHistoryList(data)
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleAbsensiMasuk = async (fotoUrl = null) => {
    if (!user) return
    setLoading(true)
    try {
      const platformCheck = verifyAttendancePlatform()
      if (!platformCheck.allowed) {
        throw new Error(platformCheck.reason)
      }

      let lat = null
      let lng = null
      let locStr = null

      if (geofenceSettings.enabled) {
        const coords = await getSecureLocation()
        lat = coords.latitude
        lng = coords.longitude
        locStr = `${lat},${lng}`
      }

      const today = getSecureLocalDateString()
      const nowIso = getSecureServerIsoString()

      const insertData = {
        user_id: user.id,
        tanggal: today,
        waktu_masuk: nowIso,
        status: 'hadir',
        foto_masuk: fotoUrl || null,
        lokasi_masuk: locStr
      }

      const { data, error } = await supabase.from('absensi').upsert(insertData, { onConflict: 'user_id,tanggal' }).select().single()
      if (error) throw error

      setTodayAbsensi(data)
      setHasCheckedIn(true)
      setTodayStatus('hadir')
      showPopup('Berhasil Presensi Masuk', 'Presensi masuk Anda telah tercatat dengan aman di server.', 'success')
    } catch (err) {
      showPopup('Gagal Presensi Masuk', err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAbsensiPulang = async (fotoUrl = null) => {
    if (!user || !todayAbsensi) return
    setLoading(true)
    try {
      const platformCheck = verifyAttendancePlatform()
      if (!platformCheck.allowed) {
        throw new Error(platformCheck.reason)
      }

      let locStr = null
      if (geofenceSettings.enabled) {
        const coords = await getSecureLocation()
        locStr = `${coords.latitude},${coords.longitude}`
      }

      const nowIso = getSecureServerIsoString()
      const { data, error } = await supabase
        .from('absensi')
        .update({ waktu_pulang: nowIso, foto_pulang: fotoUrl || null, lokasi_pulang: locStr })
        .eq('id', todayAbsensi.id)
        .select()
        .single()

      if (error) throw error
      setTodayAbsensi(data)
      showPopup('Berhasil Presensi Pulang', 'Presensi kepulangan Anda telah tersimpan.', 'success')
    } catch (err) {
      showPopup('Gagal Presensi Pulang', err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    if (!window.confirm('Apakah Anda yakin ingin keluar dari akun Operator?')) return
    await supabase.auth.signOut()
    localStorage.removeItem(`panrita_role_${user?.id}`)
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #F8FAFC)', display: 'flex', flexDirection: 'column' }}>
      {/* Header Operator */}
      <header style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
        color: 'white',
        padding: '1.25rem 1.5rem',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
              <Briefcase size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#F8FAFC' }}>
                  Portal Operator Sekolah
                </h1>
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', background: '#0284C7', color: 'white', padding: '2px 8px', borderRadius: '8px' }}>
                  Dapodik
                </span>
              </div>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>
                {profile?.full_name || user?.email} • {schoolName}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setDarkMode(!darkMode)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '10px', cursor: 'pointer' }}
            >
              {darkMode ? <Sun size={18} color="#FBBF24" /> : <Moon size={18} />}
            </button>
            <button
              onClick={handleLogout}
              style={{ background: '#EF4444', border: 'none', color: 'white', padding: '0.5rem 0.9rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <LogOut size={16} /> Keluar
            </button>
          </div>
        </div>

        {/* Tab Navigasi Atas (Desktop & Mobile Nav Bar) */}
        <div style={{ maxWidth: '1200px', margin: '1rem auto 0 auto', display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            onClick={() => handleNavigateTab('absensi')}
            style={{
              background: activeTab === 'absensi' ? '#0284C7' : 'rgba(255,255,255,0.08)',
              color: 'white',
              border: 'none',
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Clock size={16} /> Presensi Harian
          </button>
          <button
            onClick={() => handleNavigateTab('master')}
            style={{
              background: activeTab === 'master' ? '#0284C7' : 'rgba(255,255,255,0.08)',
              color: 'white',
              border: 'none',
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Users size={16} /> Master Kelas &amp; Siswa
          </button>
          <button
            onClick={() => handleNavigateTab('riwayat')}
            style={{
              background: activeTab === 'riwayat' ? '#0284C7' : 'rgba(255,255,255,0.08)',
              color: 'white',
              border: 'none',
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <History size={16} /> Riwayat Absensi
          </button>
          <button
            onClick={() => handleNavigateTab('pengumuman')}
            style={{
              background: activeTab === 'pengumuman' ? '#0284C7' : 'rgba(255,255,255,0.08)',
              color: 'white',
              border: 'none',
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <Bell size={16} /> Pengumuman
          </button>
          <button
            onClick={() => handleNavigateTab('pengaturan')}
            style={{
              background: activeTab === 'pengaturan' ? '#0284C7' : 'rgba(255,255,255,0.08)',
              color: 'white',
              border: 'none',
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            <UserCircle size={16} /> Profil
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1200px', width: '100%', margin: '1.5rem auto', padding: '0 1rem', flex: 1 }}>
        {/* 1. Tab Presensi Harian */}
        {activeTab === 'absensi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Card Waktu & Status */}
            <div className="card" style={{ padding: '1.5rem', background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>WAKTU SAAT INI</span>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0F172A', marginTop: '4px' }}>
                  {currentTime.toLocaleTimeString('id-ID')}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '2px' }}>
                  {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>STATUS KEHADIRAN</span>
                <div style={{ marginTop: '6px' }}>
                  {hasCheckedIn ? (
                    <span style={{ background: '#ECFDF5', color: '#059669', padding: '6px 14px', borderRadius: '20px', fontWeight: '800', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} /> Sudah Masuk ({todayAbsensi?.waktu_masuk ? new Date(todayAbsensi.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'})
                    </span>
                  ) : (
                    <span style={{ background: '#FEF2F2', color: '#DC2626', padding: '6px 14px', borderRadius: '20px', fontWeight: '800', fontSize: '0.85rem' }}>
                      Belum Presensi
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tombol Absensi Masuk & Pulang */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.5rem', background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: '0 0 0.5rem 0' }}>Presensi Masuk</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1.25rem 0' }}>Lakukan presensi kehadiran di awal jam kerja</p>
                <button
                  disabled={hasCheckedIn || loading}
                  onClick={() => setShowCameraModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    background: hasCheckedIn ? '#E2E8F0' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: hasCheckedIn ? '#94A3B8' : 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '800',
                    fontSize: '0.9rem',
                    cursor: hasCheckedIn ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Camera size={18} /> {hasCheckedIn ? 'Sudah Presensi Masuk' : 'Ambil Foto & Masuk'}
                </button>
              </div>

              <div className="card" style={{ padding: '1.5rem', background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: '0 0 0.5rem 0' }}>Presensi Pulang</h3>
                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1.25rem 0' }}>Lakukan presensi kepulangan di akhir jam dinas</p>
                <button
                  disabled={!hasCheckedIn || Boolean(todayAbsensi?.waktu_pulang) || loading}
                  onClick={() => setShowCameraModal(true)}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    background: (!hasCheckedIn || Boolean(todayAbsensi?.waktu_pulang)) ? '#E2E8F0' : 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                    color: (!hasCheckedIn || Boolean(todayAbsensi?.waktu_pulang)) ? '#94A3B8' : 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '800',
                    fontSize: '0.9rem',
                    cursor: (!hasCheckedIn || Boolean(todayAbsensi?.waktu_pulang)) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Camera size={18} /> {todayAbsensi?.waktu_pulang ? 'Sudah Presensi Pulang' : 'Ambil Foto & Pulang'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Tab Master Kelas & Siswa */}
        {activeTab === 'master' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <MasterSiswaDanKelas
              user={{ ...user, ...profile }}
              profile={profile}
              schoolInfo={schoolInfoData}
              onRefresh={fetchUser}
            />
          </div>
        )}

        {/* 3. Tab Riwayat Absensi */}
        {activeTab === 'riwayat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem 1.25rem', background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Calendar size={20} color="#0284C7" />
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Pilih Bulan Riwayat:</label>
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(e) => {
                    setHistoryMonth(e.target.value)
                    loadHistory(e.target.value)
                  }}
                  style={{ padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            {historyLoading ? (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748B', background: 'white', borderRadius: '16px' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem auto' }} /> Memuat riwayat kehadiran...
              </div>
            ) : historyList.length === 0 ? (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748B', background: 'white', borderRadius: '16px' }}>
                Belum ada data kehadiran pada bulan {historyMonth}.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {historyList.map(item => (
                  <div key={item.id} className="card" style={{ padding: '1rem', background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: '#1E293B', fontSize: '0.92rem' }}>
                        {new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', background: item.status === 'hadir' ? '#ECFDF5' : '#FEF2F2', color: item.status === 'hadir' ? '#059669' : '#DC2626', padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                        {item.status || 'HADIR'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>MASUK</div>
                        <div style={{ fontWeight: '700', color: '#10B981', fontSize: '0.88rem' }}>
                          {item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>PULANG</div>
                        <div style={{ fontWeight: '700', color: '#0284C7', fontSize: '0.88rem' }}>
                          {item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Tab Pengumuman */}
        {activeTab === 'pengumuman' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: '0 0 0.5rem 0' }}>Pengumuman Sekolah</h3>
            {pengumumanData.length === 0 ? (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748B', background: 'white', borderRadius: '16px' }}>
                Tidak ada pengumuman saat ini.
              </div>
            ) : (
              pengumumanData.map(p => (
                <div key={p.id} className="card" style={{ padding: '1rem', background: 'white', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: '4px' }}>
                    {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#1E293B' }}>{p.pesan}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* 5. Tab Profil */}
        {activeTab === 'pengaturan' && (
          <div className="card" style={{ padding: '1.5rem', background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0', maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: '700', margin: '0 0 1rem 0' }}>Profil Akun Operator</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Nama Lengkap</label>
                <input type="text" value={profile?.full_name || ''} readOnly style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Email Akun</label>
                <input type="text" value={user?.email || ''} readOnly style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>Jabatan / Tugas</label>
                <input type="text" value={profile?.jabatan || 'Operator Dapodik / Sekolah'} readOnly style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC' }} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Camera Timemark Modal */}
      <CameraTimemarkModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        profile={profile}
        user={user}
        schoolName={schoolName}
        schoolLogo={schoolLogo}
        onSelectPhoto={async (photoUrl) => {
          setShowCameraModal(false)
          if (!hasCheckedIn) {
            await handleAbsensiMasuk(photoUrl)
          } else {
            await handleAbsensiPulang(photoUrl)
          }
        }}
      />

      {/* Popup Dialog */}
      {popup.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', maxWidth: '400px', width: '100%', padding: '1.5rem', textAlign: 'center' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '700', color: popup.type === 'error' ? '#EF4444' : '#10B981' }}>{popup.title}</h4>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.88rem', color: '#475569' }}>{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, show: false })} style={{ padding: '0.6rem 1.5rem', background: '#0284C7', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  )
}
