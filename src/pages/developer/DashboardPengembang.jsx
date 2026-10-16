import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { 
  clearDeveloperSession, 
  updateDeveloperMasterKey,
  updateAdminAccountCredentials,
  getAdminOverrideCredentials
} from '../../lib/developerManager'
import { 
  fetchDeviceBindings, 
  resetDeviceBinding 
} from '../../lib/deviceManager'
import { 
  Activity, Shield, Smartphone, Key, Database, LogOut, 
  RefreshCw, CheckCircle2, AlertTriangle, Eye, Server, 
  Clock, Download, Users, Layers, MapPin, Trash2, Cpu,
  UserCheck, Lock, Mail, Check, EyeOff, Copy, ShieldCheck
} from 'lucide-react'
import { getCloudOverrideToken, saveCloudOverrideToken, fetchOverrideAuditLogs } from '../../lib/attendanceOverrideManager'

export default function DashboardPengembang() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('telemetry') // 'telemetry' | 'devices' | 'admin_account' | 'security' | 'database'
  
  // Metrik Sistem
  const [latency, setLatency] = useState(null)
  const [stats, setStats] = useState({
    guruCount: 0,
    classesCount: 0,
    absensiCount: 0,
    schoolName: '',
    geofenceEnabled: false,
    radius: 50
  })
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  
  // Kunci Perangkat
  const [deviceMap, setDeviceMap] = useState({})
  const [teachersList, setTeachersList] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(false)

  // Kelola Akun & Password Pimpinan (Admin / Kepsek)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [newLeaderRole, setNewLeaderRole] = useState('admin') // 'admin' | 'kepsek'
  const [newLeaderName, setNewLeaderName] = useState('')
  const [showAdminPass, setShowAdminPass] = useState(false)
  const [savingAdminAcc, setSavingAdminAcc] = useState(false)
  const [adminAccStatus, setAdminAccStatus] = useState({ type: '', text: '' })
  const [currentAdminProfile, setCurrentAdminProfile] = useState(null)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [updatingUserRole, setUpdatingUserRole] = useState(null)

  // Ganti Kode Pengembang
  const [newKey, setNewKey] = useState('')
  const [confirmKey, setConfirmKey] = useState('')
  const [keyStatus, setKeyStatus] = useState({ type: '', text: '' })
  const [savingKey, setSavingKey] = useState(false)

  // Kode Token Presensi Khusus Admin
  const [adminOverrideToken, setAdminOverrideToken] = useState('')
  const [adminOverrideExists, setAdminOverrideExists] = useState(false)
  const [adminOverrideUpdatedAt, setAdminOverrideUpdatedAt] = useState(null)
  const [showAdminOverrideToken, setShowAdminOverrideToken] = useState(false)
  const [newAdminOverrideToken, setNewAdminOverrideToken] = useState('')
  const [savingAdminOverrideToken, setSavingAdminOverrideToken] = useState(false)
  const [adminOverrideStatus, setAdminOverrideStatus] = useState({ type: '', text: '' })
  const [copiedToken, setCopiedToken] = useState(false)

  const loadAdminOverrideToken = async () => {
    try {
      const res = await getCloudOverrideToken(supabase)
      setAdminOverrideToken(res.token || '')
      setAdminOverrideExists(res.exists)
      setAdminOverrideUpdatedAt(res.updatedAt)
    } catch (e) {
      console.warn('Gagal membaca token admin override:', e)
    }
  }

  const handleUpdateAdminOverrideToken = async (e) => {
    e.preventDefault()
    setAdminOverrideStatus({ type: '', text: '' })
    if (!newAdminOverrideToken.trim()) {
      setAdminOverrideStatus({ type: 'error', text: 'Kode token baru tidak boleh kosong!' })
      return
    }
    setSavingAdminOverrideToken(true)
    try {
      await saveCloudOverrideToken(supabase, newAdminOverrideToken.trim())
      setAdminOverrideToken(newAdminOverrideToken.trim())
      setAdminOverrideExists(true)
      setAdminOverrideUpdatedAt(new Date().toISOString())
      setAdminOverrideStatus({ type: 'success', text: 'Kode Token Admin berhasil diperbarui!' })
      setNewAdminOverrideToken('')
    } catch (err) {
      setAdminOverrideStatus({ type: 'error', text: 'Gagal memperbarui token: ' + err.message })
    } finally {
      setSavingAdminOverrideToken(false)
    }
  }

  const handleCopyToken = () => {
    if (!adminOverrideToken) return
    navigator.clipboard.writeText(adminOverrideToken)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  // Silent Audit Trail Presensi Khusus
  const [auditLogs, setAuditLogs] = useState([])
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false)

  const loadAuditLogs = async () => {
    setLoadingAuditLogs(true)
    try {
      const logs = await fetchOverrideAuditLogs(supabase)
      setAuditLogs(logs)
    } catch (e) {
      console.warn('Gagal load audit logs:', e)
    } finally {
      setLoadingAuditLogs(false)
    }
  }

  useEffect(() => {
    loadSystemMetrics()
    loadDeviceRegistry()
    loadAdminAccountInfo()
    loadAdminOverrideToken()
    loadAuditLogs()
  }, [])

  const handleChangeUserRole = async (targetUserId, targetUserName, newRole) => {
    if (!window.confirm(`Ubah peran ${targetUserName} menjadi '${newRole.toUpperCase()}'?`)) return
    setUpdatingUserRole(targetUserId)
    try {
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', targetUserId)
      if (error) throw error
      alert(`Berhasil! Peran ${targetUserName} kini diubah menjadi '${newRole}'.`)
      await loadSystemMetrics()
      await loadAdminAccountInfo()
    } catch (err) {
      alert('Gagal mengubah peran: ' + err.message)
    } finally {
      setUpdatingUserRole(null)
    }
  }

  const pingLatency = async () => {
    const start = performance.now()
    try {
      await supabase.from('settings').select('id').limit(1)
      const end = performance.now()
      setLatency(Math.round(end - start))
    } catch {
      setLatency(-1)
    }
  }

  const loadSystemMetrics = async () => {
    setLoadingMetrics(true)
    await pingLatency()
    try {
      const [pRes, cRes, aRes, sRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, nip'),
        supabase.from('classes').select('id'),
        supabase.from('absensi').select('id', { count: 'exact', head: true }),
        supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      ])

      const profs = pRes.data || []
      setTeachersList(profs)

      setStats({
        guruCount: profs.filter(p => p.role === 'guru').length,
        classesCount: cRes.data?.length || 0,
        absensiCount: aRes.count || 0,
        schoolName: sRes.data?.nama_sekolah || 'Sekolah Terhubung',
        geofenceEnabled: sRes.data?.geofence_enabled || false,
        radius: sRes.data?.school_radius || 50
      })
    } catch (e) {
      console.error('Error loading metrics:', e)
    } finally {
      setLoadingMetrics(false)
    }
  }

  const loadDeviceRegistry = async () => {
    setLoadingDevices(true)
    try {
      const bindings = await fetchDeviceBindings(supabase)
      setDeviceMap(bindings)
    } catch (e) {
      console.error('Error loading devices:', e)
    } finally {
      setLoadingDevices(false)
    }
  }

  const loadAdminAccountInfo = async () => {
    try {
      // 1. Cek dari profiles
      const { data: adminProf } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .limit(1)

      // 2. Cek dari override credentials
      const override = await getAdminOverrideCredentials(supabase)
      
      if (override && override.email) {
        setAdminEmail(override.email)
        setCurrentAdminProfile({
          email: override.email,
          updatedAt: override.updatedAt,
          isOverride: true
        })
      } else if (adminProf && adminProf.length > 0) {
        setAdminEmail(adminProf[0].email || '')
        setCurrentAdminProfile(adminProf[0])
      }
    } catch (e) {
      console.warn('Error loading admin account:', e)
    }
  }

  const handleResetDevice = async (teacherId, teacherName) => {
    if (!window.confirm(`Reset kunci perangkat untuk ${teacherName}? Guru ini akan diizinkan mendaftarkan HP barunya saat presensi berikutnya.`)) return
    
    const ok = await resetDeviceBinding({ userId: teacherId, supabase })
    if (ok) {
      setDeviceMap(prev => {
        const copy = { ...prev }
        delete copy[teacherId]
        return copy
      })
      alert(`Kunci perangkat untuk ${teacherName} berhasil dibuka!`)
    } else {
      alert('Gagal membuka kunci perangkat.')
    }
  }

  const handleUpdateAdminAccount = async (e) => {
    e.preventDefault()
    setAdminAccStatus({ type: '', text: '' })

    if (!adminEmail.trim()) {
      setAdminAccStatus({ type: 'error', text: 'Email Admin tidak boleh kosong!' })
      return
    }
    if (!adminPassword || adminPassword.length < 6) {
      setAdminAccStatus({ type: 'error', text: 'Password Admin minimal 6 karakter!' })
      return
    }

    setSavingAdminAcc(true)
    try {
      await updateAdminAccountCredentials({
        email: adminEmail.trim(),
        password: adminPassword,
        supabase
      })
      setAdminAccStatus({ 
        type: 'success', 
        text: `Akun & Password Admin berhasil diperbarui! Email: ${adminEmail.trim()}` 
      })
      setAdminPassword('')
      await loadAdminAccountInfo()
    } catch (err) {
      setAdminAccStatus({ type: 'error', text: 'Gagal memperbarui akun admin: ' + err.message })
    } finally {
      setSavingAdminAcc(false)
    }
  }

  const handleUpdateMasterKey = async (e) => {
    e.preventDefault()
    setKeyStatus({ type: '', text: '' })

    if (newKey !== confirmKey) {
      setKeyStatus({ type: 'error', text: 'Konfirmasi kode tidak cocok!' })
      return
    }
    if (newKey.length < 6) {
      setKeyStatus({ type: 'error', text: 'Kode minimal 6 karakter!' })
      return
    }

    setSavingKey(true)
    try {
      await updateDeveloperMasterKey(newKey, supabase)
      setKeyStatus({ type: 'success', text: 'Kode Kunci Pengembang berhasil diperbarui dan dienkripsi!' })
      setNewKey('')
      setConfirmKey('')
    } catch (err) {
      setKeyStatus({ type: 'error', text: 'Gagal memperbarui: ' + err.message })
    } finally {
      setSavingKey(false)
    }
  }

  const handleBackupDatabase = async () => {
    try {
      const [p, c, s, a, j] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('classes').select('*'),
        supabase.from('settings').select('*'),
        supabase.from('absensi').select('*').limit(500),
        supabase.from('learning_journals').select('*').limit(500)
      ])

      const backupObj = {
        exportedAt: new Date().toISOString(),
        profiles: p.data || [],
        classes: c.data || [],
        settings: s.data || [],
        absensi: a.data || [],
        journals: j.data || []
      }

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const aElem = document.createElement('a')
      aElem.href = url
      aElem.download = `Backup_GammaraApp_${new Date().toISOString().slice(0, 10)}.json`
      aElem.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Gagal mendownload backup: ' + err.message)
    }
  }

  const handleLogout = () => {
    clearDeveloperSession()
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#071C35', color: '#F1F5F9', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Top Command Bar */}
      <header style={{ background: '#0B2545', borderBottom: '1px solid rgba(0, 180, 216, 0.25)', padding: '0.9rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(0, 180, 216, 0.15)', border: '1.5px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00B4D8' }}>
            <Cpu size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="gammara-logo on-dark" style={{ fontSize: '1.25rem' }}>
                <span className="gammara">Gammara</span><span className="app">App</span>
              </div>
              <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '20px', background: '#00BEA5', color: '#071C35', fontWeight: 800, textTransform: 'uppercase' }}>
                SUPER ADMIN
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>Konsol Kendali Pengembang & Pemeliharaan Sistem</p>
          </div>
        </div>

        {/* Action Buttons: Preview as Admin/Guru & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            onClick={() => navigate('/kepsek')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#E2E8F0', padding: '0.5rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            title="Buka panel kepala sekolah"
          >
            <Eye size={14} color="#A78BFA" />
            <span>Dashboard Kepala Sekolah</span>
          </button>
          <button
            onClick={() => navigate('/admin')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#E2E8F0', padding: '0.5rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            title="Buka panel admin sekolah"
          >
            <Eye size={14} color="#00B4D8" />
            <span>Dashboard Admin</span>
          </button>
          <button
            onClick={() => navigate('/guru')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#E2E8F0', padding: '0.5rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            title="Buka panel guru"
          >
            <Eye size={14} color="#10B981" />
            <span>Dashboard Guru</span>
          </button>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#EF4444', border: 'none', color: '#FFFFFF', padding: '0.5rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <LogOut size={14} />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        
        {/* Live Telemetry Status Banner */}
        <div style={{ background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.2)', borderRadius: '16px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: latency !== -1 ? '#10B981' : '#EF4444', boxShadow: '0 0 10px #10B981' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E2E8F0' }}>
                Supabase: {latency !== null ? (latency !== -1 ? `Online (${latency}ms)` : 'Offline') : 'Pinging...'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#94A3B8' }}>
              <Shield size={14} color="#00B4D8" />
              <span>Anti-Titip Absen: <strong>1 HP = 1 Akun Aktif</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#94A3B8' }}>
              <Clock size={14} color="#10B981" />
              <span>Sesi Pengembang: <strong>Aktif (2 Jam)</strong></span>
            </div>
          </div>
          <button
            onClick={() => { loadSystemMetrics(); loadDeviceRegistry(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '1px solid rgba(0, 180, 216, 0.4)', color: '#00B4D8', padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <RefreshCw size={13} />
            <span>Segarkan Metrik</span>
          </button>
        </div>

        {/* Tab Navigation Menu */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
          {[
            { id: 'telemetry', label: 'Ringkasan & Metrik Sistem', icon: Activity },
            { id: 'admin_account', label: 'Kelola Akun Pimpinan (Admin & Kepsek)', icon: UserCheck },
            { id: 'devices', label: `Kunci HP (${Object.keys(deviceMap).length} Terikat)`, icon: Smartphone },
            { id: 'security', label: 'Ganti Kode Kunci Pengembang', icon: Key },
            { id: 'database', label: 'Backup & Database Tool', icon: Database },
          ].map(t => {
            const Icon = t.icon
            const isActive = activeTab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '0.65rem 1rem',
                  borderRadius: '12px',
                  border: isActive ? '1px solid #00B4D8' : '1px solid transparent',
                  background: isActive ? 'rgba(0, 180, 216, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? '#00B4D8' : '#94A3B8',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* TAB 1: RINGKASAN & METRIK SISTEM */}
        {activeTab === 'telemetry' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>GURU AKTIF</span>
                  <Users size={18} color="#00B4D8" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF' }}>{stats.guruCount}</div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.2rem' }}>Pendidik terdaftar di database</div>
              </div>

              <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>KELAS / ROMBEL</span>
                  <Layers size={18} color="#10B981" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF' }}>{stats.classesCount}</div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.2rem' }}>Rombel kelas di sekolah</div>
              </div>

              <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>TOTAL LOG ABSENSI</span>
                  <Activity size={18} color="#F59E0B" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF' }}>{stats.absensiCount}</div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.2rem' }}>Data presensi tersimpan</div>
              </div>

              <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>GEOFENCE SEKOLAH</span>
                  <MapPin size={18} color="#EC4899" />
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF' }}>
                  {stats.geofenceEnabled ? `Aktif (${stats.radius}m)` : 'Non-Aktif'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '0.2rem' }}>{stats.schoolName}</div>
              </div>
            </div>

            {/* Arsitektur Sistem Card */}
            <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 800, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} color="#00B4D8" />
                <span>Status Komponen Teknis GammaraApp</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E2E8F0' }}>Otentikasi Pengembang</div>
                  <div style={{ fontSize: '0.75rem', color: '#10B981', marginTop: '0.25rem' }}>SHA-256 + Salted Master Key (Anti-Bocor)</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E2E8F0' }}>Proteksi Integritas HP</div>
                  <div style={{ fontSize: '0.75rem', color: '#10B981', marginTop: '0.25rem' }}>1 Akun = 1 HP (Mutual Device Lock Aktif)</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E2E8F0' }}>Cross-Platform Support</div>
                  <div style={{ fontSize: '0.75rem', color: '#10B981', marginTop: '0.25rem' }}>Android APK + iPhone iOS Standalone Ready</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB KHUSUS: KELOLA AKUN PIMPINAN (ADMIN & KEPALA SEKOLAH) */}
        {activeTab === 'admin_account' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Bagian 1: Buat / Reset Akun Utama Pimpinan */}
            <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '2rem 1.75rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(0, 180, 216, 0.15)', border: '2px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', color: '#00B4D8' }}>
                  <UserCheck size={30} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Pendaftaran Akun Pimpinan Baru (Admin & Kepala Sekolah)
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8', lineHeight: '1.4' }}>
                  Pendaftaran akun Administrator dan Kepala Sekolah ditutup untuk umum dan hanya dapat didaftarkan secara resmi oleh Pengembang Sistem.
                </p>
              </div>

              {/* Status Info Akun Admin Saat Ini */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>STATUS AKUN ADMIN AKTIF:</span>
                  <span style={{ fontSize: '0.72rem', background: '#00B4D8', color: '#071C35', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 800 }}>
                    TERHUBUNG
                  </span>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={16} />
                  <span>{currentAdminProfile?.email || 'Belum ada email admin tersimpan'}</span>
                </div>
                {currentAdminProfile?.updatedAt && (
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.35rem' }}>
                    Terakhir diperbarui: {new Date(currentAdminProfile.updatedAt).toLocaleString('id-ID')}
                  </div>
                )}
              </div>

              {/* Alert Status Notifikasi */}
              {adminAccStatus.text && (
                <div style={{ 
                  padding: '0.75rem 1rem', 
                  borderRadius: '12px', 
                  marginBottom: '1.25rem', 
                  fontSize: '0.82rem', 
                  fontWeight: 700, 
                  textAlign: 'center', 
                  background: adminAccStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', 
                  border: adminAccStatus.type === 'success' ? '1px solid #10B981' : '1px solid #EF4444', 
                  color: adminAccStatus.type === 'success' ? '#10B981' : '#EF4444' 
                }}>
                  {adminAccStatus.text}
                </div>
              )}

              <form onSubmit={handleUpdateAdminAccount}>
                <div style={{ marginBottom: '1.15rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Tipe Peran Akun Pimpinan
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={() => setNewLeaderRole('admin')}
                      style={{
                        padding: '0.65rem',
                        borderRadius: '10px',
                        border: newLeaderRole === 'admin' ? '2px solid #00B4D8' : '1px solid rgba(255,255,255,0.15)',
                        background: newLeaderRole === 'admin' ? 'rgba(0,180,216,0.2)' : 'rgba(255,255,255,0.05)',
                        color: newLeaderRole === 'admin' ? '#00B4D8' : '#94A3B8',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      🛡️ Administrator
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewLeaderRole('kepsek')}
                      style={{
                        padding: '0.65rem',
                        borderRadius: '10px',
                        border: newLeaderRole === 'kepsek' ? '2px solid #A78BFA' : '1px solid rgba(255,255,255,0.15)',
                        background: newLeaderRole === 'kepsek' ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                        color: newLeaderRole === 'kepsek' ? '#A78BFA' : '#94A3B8',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      🎓 Kepala Sekolah
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '1.15rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Alamat Email {newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} color="#64748B" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder={newLeaderRole === 'kepsek' ? 'kepsek@sekolah.edu' : 'admin@sekolah.edu'}
                      required
                      style={{ 
                        width: '100%', 
                        padding: '0.85rem 1rem 0.85rem 2.75rem', 
                        background: 'rgba(255,255,255,0.06)', 
                        border: '1.5px solid rgba(255,255,255,0.15)', 
                        borderRadius: '12px', 
                        color: '#FFFFFF', 
                        fontSize: '0.92rem', 
                        outline: 'none' 
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#CBD5E1' }}>
                      Password {newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Minimal 6 karakter</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} color="#64748B" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type={showAdminPass ? "text" : "password"}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Masukkan kata sandi baru"
                      required
                      minLength={6}
                      style={{ 
                        width: '100%', 
                        padding: '0.85rem 2.75rem 0.85rem 2.75rem', 
                        background: 'rgba(255,255,255,0.06)', 
                        border: '1.5px solid rgba(255,255,255,0.15)', 
                        borderRadius: '12px', 
                        color: '#FFFFFF', 
                        fontSize: '0.92rem', 
                        outline: 'none',
                        letterSpacing: showAdminPass ? 'normal' : '0.1em'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      style={{
                        position: 'absolute',
                        right: '0.9rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94A3B8',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {showAdminPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingAdminAcc}
                  style={{ 
                    width: '100%', 
                    padding: '0.95rem', 
                    background: 'linear-gradient(135deg, #0284C7 0%, #00B4D8 100%)', 
                    color: '#071C35', 
                    border: 'none', 
                    borderRadius: '14px', 
                    fontSize: '0.95rem', 
                    fontWeight: 800, 
                    cursor: savingAdminAcc ? 'not-allowed' : 'pointer', 
                    boxShadow: '0 4px 14px rgba(0, 180, 216, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Check size={18} />
                  <span>{savingAdminAcc ? 'Memproses Akun...' : `Simpan Akun ${newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}`}</span>
                </button>
              </form>
            </div>

            {/* Bagian 2: Ubah Peran Akun Terdaftar Menjadi Kepala Sekolah / Admin / Guru / Tendik */}
            <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>👥 Promosi & Pemilihan Role Akun Terdaftar</span>
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                    Pilih akun guru/tendik yang telah terdaftar untuk diubah perannya menjadi <strong>Kepala Sekolah</strong> atau <strong>Admin</strong>, atau dikembalikan semula.
                  </p>
                </div>
                <div>
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Cari nama / email akun..."
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'white',
                      fontSize: '0.82rem',
                      outline: 'none',
                      minWidth: '220px'
                    }}
                  />
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', color: '#94A3B8' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Nama Lengkap</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Email Akun</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Peran Saat Ini</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Aksi Tetapkan Peran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachersList
                      .filter(u => {
                        const q = userSearchTerm.toLowerCase()
                        return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
                      })
                      .map(u => {
                        const isKepsek = u.role === 'kepsek'
                        const isAdmin = u.role === 'admin'
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: '#FFFFFF' }}>
                              {u.full_name || '-'}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', color: '#94A3B8' }}>
                              {u.email}
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <span style={{
                                padding: '0.2rem 0.6rem',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                background: isKepsek ? 'rgba(167,139,250,0.2)' : isAdmin ? 'rgba(0,180,216,0.2)' : 'rgba(255,255,255,0.08)',
                                color: isKepsek ? '#C4B5FD' : isAdmin ? '#38BDF8' : '#CBD5E1',
                                border: isKepsek ? '1px solid #8B5CF6' : isAdmin ? '1px solid #00B4D8' : '1px solid rgba(255,255,255,0.1)'
                              }}>
                                {isKepsek ? '🎓 Kepala Sekolah' : isAdmin ? '🛡️ Admin' : u.role === 'tendik' ? '💼 Tendik' : '👨‍🏫 Guru'}
                              </span>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                {!isKepsek && (
                                  <button
                                    type="button"
                                    disabled={updatingUserRole === u.id}
                                    onClick={() => handleChangeUserRole(u.id, u.full_name || u.email, 'kepsek')}
                                    style={{
                                      padding: '0.35rem 0.6rem',
                                      borderRadius: '8px',
                                      background: '#8B5CF6',
                                      color: 'white',
                                      border: 'none',
                                      fontWeight: 700,
                                      fontSize: '0.72rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Jadikan Kepsek
                                  </button>
                                )}
                                {!isAdmin && (
                                  <button
                                    type="button"
                                    disabled={updatingUserRole === u.id}
                                    onClick={() => handleChangeUserRole(u.id, u.full_name || u.email, 'admin')}
                                    style={{
                                      padding: '0.35rem 0.6rem',
                                      borderRadius: '8px',
                                      background: '#00B4D8',
                                      color: '#071C35',
                                      border: 'none',
                                      fontWeight: 800,
                                      fontSize: '0.72rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Jadikan Admin
                                  </button>
                                )}
                                {(isKepsek || isAdmin) && (
                                  <button
                                    type="button"
                                    disabled={updatingUserRole === u.id}
                                    onClick={() => handleChangeUserRole(u.id, u.full_name || u.email, 'guru')}
                                    style={{
                                      padding: '0.35rem 0.6rem',
                                      borderRadius: '8px',
                                      background: 'rgba(255,255,255,0.1)',
                                      color: '#E2E8F0',
                                      border: '1px solid rgba(255,255,255,0.2)',
                                      fontWeight: 600,
                                      fontSize: '0.72rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Kembalikan ke Guru
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MANAJEMEN KUNCI HP */}
        {activeTab === 'devices' && (
          <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Smartphone size={20} color="#00B4D8" />
                  <span>Daftar Kunci Perangkat Guru (1 Akun = 1 HP)</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>
                  Setiap guru hanya diizinkan presensi pada ponsel yang terikat di bawah ini untuk mencegah penitipan absensi.
                </p>
              </div>
              <button
                onClick={loadDeviceRegistry}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 180, 216, 0.15)', border: '1px solid #00B4D8', color: '#00B4D8', padding: '0.5rem 0.85rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
              >
                <RefreshCw size={13} />
                <span>Segarkan Data</span>
              </button>
            </div>

            {loadingDevices ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>Memuat daftar perangkat terikat...</div>
            ) : teachersList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>Belum ada data guru.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {teachersList.map(t => {
                  const binding = deviceMap[t.id]
                  const isBound = Boolean(binding && binding.deviceId)
                  return (
                    <div
                      key={t.id}
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '12px',
                        padding: '1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}
                    >
                      <div style={{ minWidth: '220px' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FFFFFF' }}>
                          {t.full_name || t.email?.split('@')[0]}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>
                          {t.email} {t.nip && `• NIP: ${t.nip}`}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: '200px' }}>
                        {isBound ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                            <Smartphone size={14} color="#10B981" />
                            <span style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 700 }}>
                              Terkunci di: {binding.deviceName || 'Ponsel Guru'}
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '0.35rem 0.75rem', borderRadius: '8px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 600 }}>
                              Belum Terikat (Akan terkunci otomatis saat pertama kali presensi)
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        {isBound ? (
                          <button
                            onClick={() => handleResetDevice(t.id, t.full_name || t.email)}
                            style={{
                              background: '#EF4444',
                              color: 'white',
                              border: 'none',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px'
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Reset Kunci HP</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>-</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GANTI KODE KUNCI PENGEMBANG & TOKEN OVERRIDE ADMIN */}
        {activeTab === 'security' && (
          <div style={{ maxWidth: '1050px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            {/* KARTU 1: Kunci Otoritas Pengembang */}
            <div style={{ background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '2rem 1.75rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '16px', background: 'rgba(0, 180, 216, 0.15)', border: '2px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', color: '#00B4D8' }}>
                  <Key size={28} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>Perbarui Kunci Otoritas Pengembang</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                  Kode ini digunakan untuk membuka akun Pengembang. Kode baru akan otomatis dienkripsi dengan SHA-256 + Salt di cloud.
                </p>
              </div>

              {keyStatus.text && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center', background: keyStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: keyStatus.type === 'success' ? '1px solid #10B981' : '1px solid #EF4444', color: keyStatus.type === 'success' ? '#10B981' : '#EF4444' }}>
                  {keyStatus.text}
                </div>
              )}

              <form onSubmit={handleUpdateMasterKey}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Kode Kunci Pengembang Baru
                  </label>
                  <input
                    type="password"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Minimal 6 karakter rahasia"
                    required
                    style={{ width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFFFFF', fontSize: '0.92rem', outline: 'none' }}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Konfirmasi Kode Kunci Baru
                  </label>
                  <input
                    type="password"
                    value={confirmKey}
                    onChange={(e) => setConfirmKey(e.target.value)}
                    placeholder="Ulangi kode rahasia baru"
                    required
                    style={{ width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFFFFF', fontSize: '0.92rem', outline: 'none' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingKey}
                  style={{ width: '100%', padding: '0.9rem', background: 'linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)', color: '#071C35', border: 'none', borderRadius: '14px', fontSize: '0.95rem', fontWeight: 800, cursor: savingKey ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(0, 180, 216, 0.4)' }}
                >
                  {savingKey ? 'Menyimpan & Mengenkripsi...' : 'Simpan Kunci Pengembang'}
                </button>
              </form>
            </div>

            {/* KARTU 2: Token Keamanan Presensi Khusus Admin */}
            <div style={{ background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '2rem 1.75rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.15)', border: '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', color: '#EF4444' }}>
                  <ShieldCheck size={28} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>Token Presensi Khusus Admin</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                  Token ini digunakan oleh Administrator untuk membuka fitur Presensi Khusus (Clock Out Pulang Cepat & Clock In Terlambat).
                </p>
              </div>

              {/* Tampilan Token Aktif Saat Ini */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    KODE TOKEN AKTIF SAAT INI
                  </span>
                  {adminOverrideUpdatedAt && (
                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                      Update: {new Date(adminOverrideUpdatedAt).toLocaleDateString('id-ID')}
                    </span>
                  )}
                </div>

                {adminOverrideExists && adminOverrideToken ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid rgba(0, 180, 216, 0.3)' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: showAdminOverrideToken ? '2px' : '4px', color: '#00B4D8', fontFamily: 'monospace' }}>
                      {showAdminOverrideToken ? adminOverrideToken : '••••••••'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowAdminOverrideToken(!showAdminOverrideToken)}
                        title={showAdminOverrideToken ? "Sembunyikan Token" : "Lihat Token"}
                        style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#FFFFFF', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        {showAdminOverrideToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyToken}
                        title="Salin Token"
                        style={{ background: copiedToken ? '#10B981' : 'rgba(0, 180, 216, 0.2)', border: '1px solid rgba(0, 180, 216, 0.4)', color: copiedToken ? '#FFFFFF' : '#00B4D8', padding: '0.5rem 0.75rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                      >
                        {copiedToken ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedToken ? 'Disalin!' : 'Salin'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', color: '#FBBF24', fontSize: '0.8rem', textAlign: 'center' }}>
                    ⚠️ Belum Dibuat oleh Admin (Admin akan diminta membuat token saat pertama kali membuka menu di halaman admin).
                  </div>
                )}
              </div>

              {/* Status Update Token */}
              {adminOverrideStatus.text && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', fontWeight: 700, textAlign: 'center', background: adminOverrideStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: adminOverrideStatus.type === 'success' ? '1px solid #10B981' : '1px solid #EF4444', color: adminOverrideStatus.type === 'success' ? '#10B981' : '#EF4444' }}>
                  {adminOverrideStatus.text}
                </div>
              )}

              {/* Form Reset / Ganti Token Langsung oleh Pengembang */}
              <form onSubmit={handleUpdateAdminOverrideToken}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Reset / Ganti Token Admin Baru (Opsional)
                  </label>
                  <input
                    type="text"
                    value={newAdminOverrideToken}
                    onChange={(e) => setNewAdminOverrideToken(e.target.value)}
                    placeholder="Masukkan token baru untuk Admin"
                    style={{ width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFFFFF', fontSize: '0.92rem', outline: 'none' }}
                  />
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
                    Jika Admin lupa token, informasikan token aktif di atas atau buatkan token baru melalui form ini.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={savingAdminOverrideToken}
                  style={{ width: '100%', padding: '0.9rem', background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: '#FFFFFF', border: 'none', borderRadius: '14px', fontSize: '0.95rem', fontWeight: 800, cursor: savingAdminOverrideToken ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}
                >
                  {savingAdminOverrideToken ? 'Menyimpan Token...' : 'Perbarui Token Admin'}
                </button>
              </form>
            </div>

            {/* KARTU 3: Silent Audit Trail (Jejak Rekam Rahasia Presensi Khusus) */}
            <div style={{ gridColumn: '1 / -1', background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '1.75rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', border: '1.5px solid #10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                    <Activity size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>
                      Silent Audit Trail: Riwayat Presensi Khusus Admin
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>
                      Log rahasia ini hanya dapat diakses oleh Pengembang. Rekap umum & ekspor laporan guru tetap bersih 100%.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={loadAuditLogs}
                  disabled={loadingAuditLogs}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(0, 180, 216, 0.15)',
                    border: '1px solid rgba(0, 180, 216, 0.4)',
                    color: '#00B4D8',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: loadingAuditLogs ? 'not-allowed' : 'pointer'
                  }}
                >
                  <RefreshCw size={14} className={loadingAuditLogs ? 'animate-spin' : ''} />
                  <span>{loadingAuditLogs ? 'Memuat...' : 'Segarkan Log'}</span>
                </button>
              </div>

              {loadingAuditLogs ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                  <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 0.5rem auto', color: '#00B4D8' }} />
                  Memuat data riwayat audit...
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', color: '#64748B', fontSize: '0.85rem' }}>
                  Belum ada aktivitas presensi khusus yang tercatat.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                  {auditLogs.map((log) => {
                    const isClockOut = log.actionType === 'clock_out'
                    return (
                      <div
                        key={log.id}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '12px',
                          padding: '0.9rem 1.15rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              background: isClockOut ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: isClockOut ? '#EF4444' : '#10B981',
                              border: isClockOut ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)'
                            }}>
                              {isClockOut ? 'CLOCK OUT (PULANG)' : 'CLOCK IN (MASUK)'}
                            </span>
                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
                              {log.targetUserName}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                              ({log.targetUserRole})
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Oleh: <strong style={{ color: '#CBD5E1' }}>{log.adminName}</strong> • Jam Disetel: <strong style={{ color: '#38BDF8' }}>{log.targetTime}</strong> ({log.targetDate})
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Waktu Eksekusi Sistem:
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#CBD5E1', fontWeight: 600 }}>
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('id-ID') : '-'}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: BACKUP & DATABASE TOOL */}
        {activeTab === 'database' && (
          <div style={{ background: '#0B2545', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={20} color="#00B4D8" />
              <span>Pemeliharaan & Cadangan Database</span>
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.82rem', color: '#94A3B8' }}>
              Fasilitas pengembang untuk mengunduh seluruh data sekolah dalam 1 file JSON atau memeriksa integritas cloud.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.92rem', color: '#FFFFFF' }}>Snapshot Backup 1-Klik</h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                  Unduh seluruh database sekolah (Profil guru, kelas, pengaturan, riwayat absensi, dan jurnal) ke file JSON offline.
                </p>
                <button
                  onClick={handleBackupDatabase}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#10B981', color: '#FFFFFF', border: 'none', padding: '0.65rem 1.1rem', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  <Download size={15} />
                  <span>Unduh File Backup JSON</span>
                </button>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.92rem', color: '#FFFFFF' }}>Bersihkan Cache Lokal Perangkat</h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                  Menghapus cache lokal browser ini tanpa menghapus data cloud database Supabase.
                </p>
                <button
                  onClick={() => {
                    localStorage.removeItem('panrita_cloud_teacher_assignments')
                    localStorage.removeItem('panrita_kbm_subjects')
                    alert('Cache lokal berhasil dibersihkan!')
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.1)', color: '#E2E8F0', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '0.65rem 1.1rem', borderRadius: '10px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  <Trash2 size={15} />
                  <span>Bersihkan Cache Lokal</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Pengembang GammaraApp */}
        <footer style={{ marginTop: '3.5rem', padding: '1.5rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="gammara-logo on-dark" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            <span className="gammara">Gammara</span><span className="app">App</span>
          </div>
          <p className="logo-description on-dark" style={{ fontSize: '0.78rem', margin: '0 0 2px 0' }}>
            Sistem Manajemen Sekolah Terpadu
          </p>
          <p className="logo-tagline on-dark" style={{ fontSize: '0.75rem', margin: '0 0 0.4rem 0' }}>
            Sekolah Tertata, Pembelajaran Berkualitas.
          </p>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
            &copy; {new Date().getFullYear()} GammaraApp Developer Console
          </p>
        </footer>

      </div>
    </div>
  )
}
