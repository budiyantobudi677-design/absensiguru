import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { 
  clearDeveloperSession, 
  updateDeveloperMasterKey,
  updateAdminAccountCredentials,
  updateLeaderAccountCredentials,
  getAdminOverrideCredentials,
  getKepsekOverrideCredentials,
  deleteUserAccountSafely
} from '../../lib/developerManager'
import { fetchDeletedAccountsRegistry, isAccountDeleted } from '../../lib/deletedAccountsManager'
import { 
  fetchDeviceBindings, 
  resetDeviceBinding 
} from '../../lib/deviceManager'
import { 
  Activity, Shield, Smartphone, Key, Database, LogOut, 
  RefreshCw, CheckCircle2, AlertTriangle, Eye, Server, 
  Clock, Download, Users, Layers, MapPin, Trash2, Cpu,
  UserCheck, Lock, Mail, Check, EyeOff, Copy, ShieldCheck,
  RotateCcw, X, UserX, Edit3, ChevronRight
} from 'lucide-react'
import { 
  getCloudOverrideToken, 
  saveCloudOverrideToken, 
  fetchOverrideAuditLogs,
  getOverrideFeatureStatus,
  setOverrideFeatureStatus
} from '../../lib/attendanceOverrideManager'
import { downloadFullSystemBackup, executeAppFactoryReset, executeExtremeResetAndDeleteAccounts } from '../../lib/appResetManager'

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
  const [currentKepsekProfile, setCurrentKepsekProfile] = useState(null)
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [updatingUserRole, setUpdatingUserRole] = useState(null)

  // State Modal Edit Akun Pimpinan (Email & Password)
  const [editingLeaderAccount, setEditingLeaderAccount] = useState(null)
  const [editLeaderEmail, setEditLeaderEmail] = useState('')
  const [editLeaderPassword, setEditLeaderPassword] = useState('')
  const [editLeaderName, setEditLeaderName] = useState('')
  const [editLeaderRole, setEditLeaderRole] = useState('admin')
  const [showEditPass, setShowEditPass] = useState(false)
  const [savingEditLeader, setSavingEditLeader] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState(null)

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

  // Status Saklar Fitur Presensi Khusus Admin
  const [overrideFeatureEnabled, setOverrideFeatureEnabled] = useState(true)
  const [overrideFeatureUpdatedAt, setOverrideFeatureUpdatedAt] = useState(null)
  const [togglingOverrideFeature, setTogglingOverrideFeature] = useState(false)
  const [overrideFeatureMsg, setOverrideFeatureMsg] = useState({ type: '', text: '' })

  const loadOverrideFeatureStatus = async () => {
    try {
      const res = await getOverrideFeatureStatus(supabase)
      setOverrideFeatureEnabled(res.enabled)
      setOverrideFeatureUpdatedAt(res.updatedAt)
    } catch (e) {
      console.warn('Gagal membaca status fitur override:', e)
    }
  }

  const handleToggleOverrideFeature = async () => {
    const nextState = !overrideFeatureEnabled
    const confirmMsg = nextState 
      ? 'Aktifkan fitur Presensi Khusus untuk akun Administrator? (Menu dan tombol akan kembali muncul di dashboard Admin)'
      : 'Nonaktifkan fitur Presensi Khusus untuk akun Administrator? (Menu dan tombol di dashboard Admin akan disembunyikan)'
    
    if (!window.confirm(confirmMsg)) return

    setTogglingOverrideFeature(true)
    setOverrideFeatureMsg({ type: '', text: '' })
    try {
      const res = await setOverrideFeatureStatus(supabase, nextState)
      setOverrideFeatureEnabled(res.enabled)
      setOverrideFeatureUpdatedAt(res.updatedAt)
      setOverrideFeatureMsg({
        type: 'success',
        text: `Fitur Presensi Khusus berhasil di-${nextState ? 'AKTIFKAN' : 'NONAKTIFKAN'} untuk Admin!`
      })
    } catch (err) {
      setOverrideFeatureMsg({
        type: 'error',
        text: 'Gagal mengubah status fitur: ' + (err.message || err)
      })
    } finally {
      setTogglingOverrideFeature(false)
    }
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
    loadOverrideFeatureStatus()
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
      const [pRes, cRes, aRes, sRes, deletedReg] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, nip'),
        supabase.from('classes').select('id'),
        supabase.from('absensi').select('id', { count: 'exact', head: true }),
        supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
        fetchDeletedAccountsRegistry(supabase)
      ])

      const rawProfs = pRes.data || []
      const profs = rawProfs.filter(p => !isAccountDeleted(p, deletedReg))
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
      const deletedReg = await fetchDeletedAccountsRegistry(supabase)

      // 1. Cek dari profiles untuk Admin
      const { data: adminProf } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')

      const validAdminProf = (adminProf || []).filter(p => !isAccountDeleted(p, deletedReg))

      // 2. Cek dari override credentials Admin
      const overrideAdmin = await getAdminOverrideCredentials(supabase)
      
      if (overrideAdmin && overrideAdmin.email && !isAccountDeleted(overrideAdmin.email, deletedReg)) {
        setCurrentAdminProfile({
          email: overrideAdmin.email,
          fullName: overrideAdmin.fullName || 'Administrator Sekolah',
          updatedAt: overrideAdmin.updatedAt,
          isOverride: true
        })
      } else if (validAdminProf.length > 0) {
        setCurrentAdminProfile(validAdminProf[0])
      } else {
        setCurrentAdminProfile(null)
      }

      // 3. Cek dari profiles untuk Kepala Sekolah
      const { data: kepsekProf } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'kepsek')

      const validKepsekProf = (kepsekProf || []).filter(p => !isAccountDeleted(p, deletedReg))

      // 4. Cek dari override credentials Kepala Sekolah
      const overrideKepsek = await getKepsekOverrideCredentials(supabase)
      if (overrideKepsek && overrideKepsek.email && !isAccountDeleted(overrideKepsek.email, deletedReg)) {
        setCurrentKepsekProfile({
          email: overrideKepsek.email,
          fullName: overrideKepsek.fullName || 'Kepala Sekolah',
          updatedAt: overrideKepsek.updatedAt,
          isOverride: true
        })
      } else if (validKepsekProf.length > 0) {
        setCurrentKepsekProfile(validKepsekProf[0])
      } else {
        setCurrentKepsekProfile(null)
      }
    } catch (e) {
      console.warn('Error loading leader accounts info:', e)
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

  const handleSelectRoleInForm = (role) => {
    setNewLeaderRole(role)
    const target = teachersList.find(u => u.role === role)
    if (target) {
      setAdminEmail(target.email || '')
      setNewLeaderName(target.full_name || '')
    } else {
      if (role === 'admin' && currentAdminProfile?.email) {
        setAdminEmail(currentAdminProfile.email)
        setNewLeaderName(currentAdminProfile.fullName || '')
      } else if (role === 'kepsek' && currentKepsekProfile?.email) {
        setAdminEmail(currentKepsekProfile.email)
        setNewLeaderName(currentKepsekProfile.fullName || '')
      } else {
        setAdminEmail('')
        setNewLeaderName('')
      }
    }
  }

  const handleUpdateAdminAccount = async (e) => {
    e.preventDefault()
    setAdminAccStatus({ type: '', text: '' })

    const roleLabel = newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Administrator'

    if (!adminEmail.trim() || !adminEmail.includes('@')) {
      setAdminAccStatus({ type: 'error', text: `Email ${roleLabel} tidak valid!` })
      return
    }
    if (!adminPassword || adminPassword.length < 6) {
      setAdminAccStatus({ type: 'error', text: `Password ${roleLabel} minimal 6 karakter!` })
      return
    }

    setSavingAdminAcc(true)
    try {
      await updateLeaderAccountCredentials({
        role: newLeaderRole,
        email: adminEmail.trim(),
        password: adminPassword,
        fullName: newLeaderName.trim() || undefined,
        supabase
      })
      setAdminAccStatus({ 
        type: 'success', 
        text: `Akun & Password ${roleLabel} berhasil diperbarui! Email: ${adminEmail.trim()}` 
      })
      setAdminPassword('')
      await loadSystemMetrics()
      await loadAdminAccountInfo()
    } catch (err) {
      setAdminAccStatus({ type: 'error', text: `Gagal memperbarui akun ${roleLabel}: ` + err.message })
    } finally {
      setSavingAdminAcc(false)
    }
  }

  const handleOpenEditLeaderModal = (u) => {
    setEditingLeaderAccount(u)
    setEditLeaderEmail(u.email || '')
    setEditLeaderPassword('')
    setEditLeaderName(u.full_name || '')
    setEditLeaderRole(u.role === 'kepsek' ? 'kepsek' : 'admin')
    setShowEditPass(false)
  }

  const handleSaveEditLeaderAccount = async (e) => {
    e.preventDefault()
    if (!editingLeaderAccount) return

    if (!editLeaderEmail.trim() || !editLeaderEmail.includes('@')) {
      alert('Format alamat email tidak valid!')
      return
    }

    if (editLeaderPassword && editLeaderPassword.length < 6) {
      alert('Password baru minimal 6 karakter!')
      return
    }

    setSavingEditLeader(true)
    const roleLabel = editLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Administrator'
    try {
      await updateLeaderAccountCredentials({
        role: editLeaderRole,
        email: editLeaderEmail.trim(),
        password: editLeaderPassword || undefined,
        fullName: editLeaderName.trim(),
        supabase,
        targetUserId: editingLeaderAccount.id
      })

      alert(`Berhasil! Data akun ${roleLabel} (${editLeaderEmail.trim()}) telah diperbarui.${editLeaderPassword ? ' Password baru telah diaktifkan.' : ''}`)
      setEditingLeaderAccount(null)
      await loadSystemMetrics()
      await loadAdminAccountInfo()
    } catch (err) {
      console.error('Error saving leader edits:', err)
      alert(`Gagal memperbarui akun ${roleLabel}: ` + (err.message || 'Terjadi kesalahan sistem.'))
    } finally {
      setSavingEditLeader(false)
    }
  }

  const handleDeleteLeaderAccount = async (u) => {
    const roleLabel = u.role === 'admin' ? 'Administrator' : (u.role === 'kepsek' ? 'Kepala Sekolah' : 'Pengguna')
    const userName = u.full_name || u.email || 'Akun'
    
    const confirmMessage = `PERINGATAN PENGEMBANG SISTEM:

Apakah Anda yakin ingin menghapus data ${roleLabel} "${userName}"?

Peringatan Penting: Tindakan ini bersifat permanen dan akan mempengaruhi data siswa dan presensi dll. yang terkait dalam sistem.

Apakah Anda yakin untuk melanjutkan penghapusan akun ${roleLabel} ini?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setDeletingUserId(u.id)
    // Optimistic removal: langsung singkirkan dari tampilan lokal seketika
    setTeachersList(prev => prev.filter(item => item.id !== u.id && item.email !== u.email))

    try {
      await deleteUserAccountSafely({
        userId: u.id,
        role: u.role || 'admin',
        email: u.email || '',
        fullName: u.full_name || '',
        deletedBy: 'Pengembang Sistem',
        supabase
      })
      alert(`Akun ${roleLabel} "${userName}" berhasil dihapus dari sistem.`)
      await loadSystemMetrics()
      await loadAdminAccountInfo()
    } catch (err) {
      console.error('Error deleting leader account:', err)
      alert(`Gagal menghapus akun ${roleLabel}: ` + (err.message || 'Terjadi kesalahan sistem.'))
      await loadSystemMetrics()
    } finally {
      setDeletingUserId(null)
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

  // Reset Total Aplikasi ke 0 & Hapus Semua Akun (Opsi 2)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetMode, setResetMode] = useState('all_accounts') // 'data_only' | 'all_accounts'
  const [resetConfirmInput, setResetConfirmInput] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [resetProgressMsg, setResetProgressMsg] = useState('')
  const [resetProgressPct, setResetProgressPct] = useState(0)
  const [resetSuccess, setResetSuccess] = useState(false)

  // Form Akun Admin Baru untuk Opsi 2 (Dibuatkan oleh Pengembang)
  const [newAdminEmail, setNewAdminEmail] = useState('admin@gammara.sch.id')
  const [newAdminPassword, setNewAdminPassword] = useState('admin123')
  const [newAdminFullName, setNewAdminFullName] = useState('Administrator Sekolah')
  const [showNewAdminPass, setShowNewAdminPass] = useState(false)
  const [createdAdminResult, setCreatedAdminResult] = useState(null)
  const [copiedAdminResult, setCopiedAdminResult] = useState(false)

  const handleBackupDatabase = async () => {
    try {
      const res = await downloadFullSystemBackup(supabase)
      alert(`Snapshot cadangan database berhasil diunduh ke file:\n${res.filename}`)
    } catch (err) {
      alert('Gagal mendownload backup: ' + err.message)
    }
  }

  const handleOpenResetModal = (mode = 'all_accounts') => {
    setResetMode(mode)
    setResetConfirmInput('')
    setResetSuccess(false)
    setResetProgressMsg('')
    setResetProgressPct(0)
    setCreatedAdminResult(null)
    setCopiedAdminResult(false)
    if (mode === 'all_accounts') {
      setNewAdminEmail('admin@gammara.sch.id')
      setNewAdminPassword('admin123')
      setNewAdminFullName('Administrator Sekolah')
    }
    setShowResetModal(true)
  }

  const handleExecuteReset = async () => {
    const requiredConfirmation = resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI'
    if (resetConfirmInput.trim() !== requiredConfirmation) {
      alert(`Ketik "${requiredConfirmation}" persis seperti yang diinstruksikan untuk konfirmasi keamanan.`)
      return
    }

    if (resetMode === 'all_accounts') {
      if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
        alert('Email Admin Baru tidak boleh kosong dan harus valid!')
        return
      }
      if (!newAdminPassword || newAdminPassword.length < 6) {
        alert('Password Admin Baru minimal 6 karakter!')
        return
      }
    }

    setIsResetting(true)
    setResetProgressPct(5)
    setResetProgressMsg('Mengunduh snapshot cadangan darurat ke perangkat...')

    try {
      // 1. Amankan data dengan otomatis mendownload snapshot cadangan sebelum wipe
      try {
        await downloadFullSystemBackup(supabase)
      } catch (backupErr) {
        console.warn('Backup otomatis sebelum reset gagal, melanjutkan reset atas konfirmasi developer:', backupErr)
      }

      // 2. Eksekusi reset sesuai mode yang dipilih
      if (resetMode === 'all_accounts') {
        const res = await executeExtremeResetAndDeleteAccounts(supabase, {
          email: newAdminEmail.trim().toLowerCase(),
          password: newAdminPassword,
          fullName: newAdminFullName.trim()
        }, (msg, pct) => {
          setResetProgressMsg(msg)
          setResetProgressPct(pct)
        })
        setCreatedAdminResult(res.newAdmin)
      } else {
        await executeAppFactoryReset(supabase, (msg, pct) => {
          setResetProgressMsg(msg)
          setResetProgressPct(pct)
        })
      }

      setResetSuccess(true)
      await loadSystemMetrics()
      await loadDeviceRegistry()
    } catch (err) {
      alert('Gagal mereset aplikasi: ' + err.message)
    } finally {
      setIsResetting(false)
    }
  }

  const handleCopyNewAdminCredentials = () => {
    if (!createdAdminResult) return
    const text = `KREDENSIAL AKUN ADMINISTRATOR GAMMARA APP\n` +
      `Email   : ${createdAdminResult.email}\n` +
      `Password: ${createdAdminResult.password}\n` +
      `Nama    : ${createdAdminResult.fullName}\n` +
      `Login   : Silakan login sebagai Admin di halaman login aplikasi.`
    navigator.clipboard.writeText(text)
    setCopiedAdminResult(true)
    setTimeout(() => setCopiedAdminResult(false), 2500)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('admin_account')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'admin_account' ? 'linear-gradient(135deg, #0284C7 0%, #00B4D8 100%)' : 'rgba(0, 180, 216, 0.15)',
              border: '1.5px solid #00B4D8',
              color: activeTab === 'admin_account' ? '#071C35' : '#38BDF8',
              padding: '0.5rem 0.95rem',
              borderRadius: '10px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 180, 216, 0.25)',
              transition: 'all 0.2s'
            }}
            title="Buka menu ganti email/password dan hapus akun admin & kepsek"
          >
            <Key size={14} />
            <span>Menu Admin & Kepsek (Ganti Email/Pass & Hapus)</span>
          </button>
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
            { id: 'admin_account', label: '🏛️ Menu Admin & Kepsek (Ganti Email/Pass & Hapus)', icon: UserCheck },
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
                  border: isActive ? '1.5px solid #00B4D8' : '1px solid transparent',
                  background: isActive ? 'rgba(0, 180, 216, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  color: isActive ? '#38BDF8' : '#94A3B8',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 800 : 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? '0 2px 8px rgba(0, 180, 216, 0.2)' : 'none'
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
            {/* Banner Akses Cepat Menu Admin & Kepsek */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              border: '1.5px solid #00B4D8',
              borderRadius: '18px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0, 180, 216, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(0, 180, 216, 0.25)', border: '1.5px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00B4D8', flexShrink: 0 }}>
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
                    Menu Kelola Akun Pimpinan (Admin & Kepala Sekolah)
                  </h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.4 }}>
                    Pengembang dapat <strong>mengganti alamat email & password</strong> akun Administrator dan Kepala Sekolah, serta <strong>menghapus akun</strong> dengan pop-up konfirmasi peringatan.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('admin_account')}
                style={{
                  background: 'linear-gradient(135deg, #0284C7 0%, #00B4D8 100%)',
                  color: '#071C35',
                  border: 'none',
                  padding: '0.75rem 1.35rem',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(0, 180, 216, 0.4)',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>Buka Menu Admin & Kepsek</span>
                <ChevronRight size={16} />
              </button>
            </div>
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
            
            {/* Header Pengenal Menu */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)',
              border: '1.5px solid #00B4D8',
              borderRadius: '20px',
              padding: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0, 180, 216, 0.15)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '16px', background: 'rgba(0, 180, 216, 0.2)', border: '2px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00B4D8', flexShrink: 0 }}>
                  <Key size={26} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF' }}>
                      Menu Ganti Email/Password & Hapus Akun Admin & Kepsek
                    </h3>
                    <span style={{ fontSize: '0.68rem', background: '#00B4D8', color: '#071C35', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>
                      KONSOL PENGEMBANG
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#CBD5E1' }}>
                    Pengembang dapat <strong>mengganti alamat email & password</strong> akun Administrator dan Kepala Sekolah, atau <strong>menghapus akun pimpinan</strong> secara permanen.
                  </p>
                </div>
              </div>
            </div>

            {/* Bagian 1: Daftar Khusus Akun Pimpinan (Admin & Kepala Sekolah) dengan Opsi Edit & Hapus */}
            {(() => {
              const leaderAccounts = teachersList.filter(u => u.role === 'admin' || u.role === 'kepsek')
              return (
                <div style={{ background: '#0B2545', border: '1.5px solid rgba(0, 180, 216, 0.35)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}>
                  <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🗑️ Menu Hapus & 🔑 Ganti Email/Pass Akun Pimpinan</span>
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8' }}>
                        Klik <strong>"Ganti Email/Pass"</strong> untuk memperbarui kredensial, atau tombol merah <strong>"Hapus Akun"</strong> untuk menghapus akun pimpinan.
                      </p>
                    </div>
                  </div>

                  {leaderAccounts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', color: '#94A3B8', fontSize: '0.85rem' }}>
                      Belum ada akun Administrator atau Kepala Sekolah yang terdaftar di database. Gunakan formulir di bawah untuk mendaftarkan akun baru.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.15rem' }}>
                      {leaderAccounts.map(leader => {
                        const isKep = leader.role === 'kepsek'
                        return (
                          <div
                            key={leader.id}
                            style={{
                              background: isKep ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0, 180, 216, 0.1)',
                              border: isKep ? '1.5px solid rgba(139, 92, 246, 0.4)' : '1.5px solid rgba(0, 180, 216, 0.4)',
                              borderRadius: '18px',
                              padding: '1.35rem',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '1rem',
                              boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                <span style={{
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '8px',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  background: isKep ? 'rgba(167,139,250,0.25)' : 'rgba(0,180,216,0.25)',
                                  color: isKep ? '#C4B5FD' : '#38BDF8',
                                  border: isKep ? '1px solid #8B5CF6' : '1px solid #00B4D8'
                                }}>
                                  {isKep ? '🎓 Kepala Sekolah' : '🛡️ Administrator'}
                                </span>
                                {leader.nip && (
                                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>NIP: {leader.nip}</span>
                                )}
                              </div>
                              <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
                                {leader.full_name || (isKep ? 'Kepala Sekolah' : 'Administrator')}
                              </h4>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Mail size={15} color="#00B4D8" />
                                <span style={{ wordBreak: 'break-all' }}>{leader.email}</span>
                              </p>
                            </div>

                            <div style={{ display: 'flex', gap: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.95rem' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenEditLeaderModal(leader)}
                                style={{
                                  flex: 1,
                                  padding: '0.65rem',
                                  borderRadius: '10px',
                                  background: isKep ? '#7C3AED' : '#0284C7',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                }}
                              >
                                <Edit3 size={14} />
                                <span>Ganti Email/Pass</span>
                              </button>

                              <button
                                type="button"
                                disabled={deletingUserId === leader.id}
                                onClick={() => handleDeleteLeaderAccount(leader)}
                                style={{
                                  padding: '0.65rem 0.95rem',
                                  borderRadius: '10px',
                                  background: '#DC2626',
                                  color: '#FFFFFF',
                                  border: 'none',
                                  fontWeight: 800,
                                  fontSize: '0.8rem',
                                  cursor: deletingUserId === leader.id ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)'
                                }}
                              >
                                <Trash2 size={14} />
                                <span>{deletingUserId === leader.id ? '...' : 'Hapus Akun'}</span>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bagian 2: Formulir Cepat Ganti Email & Password Pimpinan */}
            <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '2rem 1.75rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(0, 180, 216, 0.15)', border: '2px solid #00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', color: '#00B4D8' }}>
                  <UserCheck size={30} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Formulir Ganti Email & Password Pimpinan
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8', lineHeight: '1.4' }}>
                  Pilih tipe pimpinan di bawah, lalu masukkan email dan password baru untuk memperbarui kredensial login.
                </p>
              </div>

              {/* Status Info Akun Admin & Kepala Sekolah Saat Ini */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: 'rgba(0, 180, 216, 0.08)', border: '1px solid rgba(0, 180, 216, 0.3)', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700 }}>STATUS AKUN ADMIN:</span>
                    <span style={{ fontSize: '0.7rem', background: '#00B4D8', color: '#071C35', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 800 }}>
                      {currentAdminProfile ? 'TERHUBUNG' : 'BELUM DIATUR'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={15} />
                    <span style={{ wordBreak: 'break-all' }}>{currentAdminProfile?.email || 'Belum ada email admin'}</span>
                  </div>
                  {currentAdminProfile?.updatedAt && (
                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.35rem' }}>
                      Diperbarui: {new Date(currentAdminProfile.updatedAt).toLocaleString('id-ID')}
                    </div>
                  )}
                </div>

                <div style={{ background: 'rgba(167, 139, 250, 0.08)', border: '1px solid rgba(167, 139, 250, 0.3)', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700 }}>STATUS KEPALA SEKOLAH:</span>
                    <span style={{ fontSize: '0.7rem', background: '#A78BFA', color: '#071C35', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 800 }}>
                      {currentKepsekProfile ? 'TERHUBUNG' : 'BELUM DIATUR'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#C4B5FD', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mail size={15} />
                    <span style={{ wordBreak: 'break-all' }}>{currentKepsekProfile?.email || 'Belum ada email kepsek'}</span>
                  </div>
                  {currentKepsekProfile?.updatedAt && (
                    <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.35rem' }}>
                      Diperbarui: {new Date(currentKepsekProfile.updatedAt).toLocaleString('id-ID')}
                    </div>
                  )}
                </div>
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
                    Pilih Tipe Pimpinan untuk Diubah
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <button
                      type="button"
                      onClick={() => handleSelectRoleInForm('admin')}
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
                      onClick={() => handleSelectRoleInForm('kepsek')}
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
                    Nama Lengkap Pimpinan
                  </label>
                  <input
                    type="text"
                    value={newLeaderName}
                    onChange={(e) => setNewLeaderName(e.target.value)}
                    placeholder={newLeaderRole === 'kepsek' ? 'Nama Kepala Sekolah & Gelar' : 'Nama Administrator Sekolah'}
                    style={{ 
                      width: '100%', 
                      padding: '0.85rem 1rem', 
                      background: 'rgba(255,255,255,0.06)', 
                      border: '1.5px solid rgba(255,255,255,0.15)', 
                      borderRadius: '12px', 
                      color: '#FFFFFF', 
                      fontSize: '0.92rem', 
                      outline: 'none' 
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1.15rem' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.4rem' }}>
                    Alamat Email Baru {newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}
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
                      Password Baru {newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}
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
                  <span>{savingAdminAcc ? 'Menyimpan Kredensial...' : `Simpan Kredensial Email & Password ${newLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Admin'}`}</span>
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
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {(isKepsek || isAdmin) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditLeaderModal(u)}
                                      title={`Ganti email dan password akun ${isKepsek ? 'Kepala Sekolah' : 'Admin'}`}
                                      style={{
                                        padding: '0.35rem 0.6rem',
                                        borderRadius: '8px',
                                        background: isKepsek ? '#7C3AED' : '#0284C7',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.72rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <Edit3 size={11} />
                                      <span>Ganti Email/Pass</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={deletingUserId === u.id}
                                      onClick={() => handleDeleteLeaderAccount(u)}
                                      title={`Hapus data akun ${isKepsek ? 'Kepala Sekolah' : 'Admin'} ini dari sistem`}
                                      style={{
                                        padding: '0.35rem 0.6rem',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.2)',
                                        border: '1px solid rgba(239, 68, 68, 0.45)',
                                        color: '#F87171',
                                        fontWeight: 700,
                                        fontSize: '0.72rem',
                                        cursor: deletingUserId === u.id ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <Trash2 size={11} />
                                      <span>{deletingUserId === u.id ? '...' : 'Hapus'}</span>
                                    </button>
                                  </>
                                )}

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

            {/* KARTU 2: Saklar Kontrol & Token Presensi Khusus Admin */}
            <div style={{ background: '#0B2545', border: '1px solid rgba(0, 180, 216, 0.25)', borderRadius: '20px', padding: '2rem 1.75rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '54px', height: '54px', borderRadius: '16px', background: overrideFeatureEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `2px solid ${overrideFeatureEnabled ? '#10B981' : '#EF4444'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', color: overrideFeatureEnabled ? '#10B981' : '#EF4444', transition: 'all 0.3s' }}>
                  <ShieldCheck size={28} />
                </div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>Kontrol Fitur Presensi Khusus</h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>
                  Kendali saklar aktivasi menu Presensi Khusus (Dispensasi Pulang & Terlambat) serta token keamanan Administrator.
                </p>
              </div>

              {/* SAKLAR KENDALI ON / OFF FITUR PRESENSI KHUSUS */}
              <div style={{
                background: overrideFeatureEnabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                border: `1.5px solid ${overrideFeatureEnabled ? '#10B981' : '#EF4444'}`,
                borderRadius: '16px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                transition: 'all 0.3s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: overrideFeatureEnabled ? '#10B981' : '#EF4444',
                        boxShadow: `0 0 10px ${overrideFeatureEnabled ? '#10B981' : '#EF4444'}`
                      }}></span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.5px' }}>
                        STATUS: {overrideFeatureEnabled ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8', lineHeight: '1.4' }}>
                      {overrideFeatureEnabled 
                        ? 'Fitur & tombol Presensi Khusus tampil di akun Admin.' 
                        : 'Fitur & tombol Presensi Khusus disembunyikan total dari Admin.'}
                    </p>
                    {overrideFeatureUpdatedAt && (
                      <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.7rem', color: '#64748B' }}>
                        Terakhir diubah: {new Date(overrideFeatureUpdatedAt).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleOverrideFeature}
                    disabled={togglingOverrideFeature}
                    style={{
                      padding: '0.65rem 1.15rem',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: togglingOverrideFeature ? 'not-allowed' : 'pointer',
                      border: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: overrideFeatureEnabled
                        ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                        : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                      color: '#FFFFFF',
                      boxShadow: overrideFeatureEnabled
                        ? '0 4px 14px rgba(239, 68, 68, 0.4)'
                        : '0 4px 14px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    {togglingOverrideFeature ? (
                      'Memproses...'
                    ) : overrideFeatureEnabled ? (
                      'Matikan Fitur'
                    ) : (
                      'Aktifkan Fitur'
                    )}
                  </button>
                </div>

                {overrideFeatureMsg.text && (
                  <div style={{
                    marginTop: '0.85rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: overrideFeatureMsg.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    border: overrideFeatureMsg.type === 'success' ? '1px solid #10B981' : '1px solid #EF4444',
                    color: overrideFeatureMsg.type === 'success' ? '#10B981' : '#EF4444'
                  }}>
                    {overrideFeatureMsg.text}
                  </div>
                )}
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

              {/* KARTU 3: RESET ULANG APLIKASI (OPSI DATA ATAU HAPUS SEMUA AKUN) */}
              <div style={{
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(185, 28, 28, 0.04) 100%)',
                border: '1.5px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '16px',
                padding: '1.5rem',
                marginTop: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1.5px solid #EF4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#EF4444'
                    }}>
                      <RotateCcw size={22} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#FCA5A5' }}>
                        Zona Kritis: Reset Ulang Seluruh Aplikasi & Akun Pengguna
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>
                        Fasilitas khusus Pengembang untuk mengosongkan riwayat database atau menghapus seluruh akun lama dan membuatkan akun Admin baru.
                      </p>
                    </div>
                  </div>

                  {/* Tombol Aksi */}
                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenResetModal('all_accounts')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                        color: '#FFFFFF',
                        border: 'none',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
                      }}
                    >
                      <UserX size={16} />
                      <span>Hapus Semua Akun & Reset Total (Opsi 2)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenResetModal('data_only')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#E2E8F0',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        padding: '0.75rem 1.1rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      <RotateCcw size={15} />
                      <span>Reset Data Saja</span>
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem',
                  fontSize: '0.76rem',
                  color: '#CBD5E1',
                  background: 'rgba(0,0,0,0.25)',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>
                  <div>• <strong>Opsi 2 (Hapus Semua Akun):</strong> Seluruh akun guru/admin lama dihapus, Admin baru dibuatkan pengembang.</div>
                  <div>• <strong>Presensi & Nilai Siswa:</strong> Dikosongkan (0 baris riwayat)</div>
                  <div>• <strong>Jurnal & KBM Guru:</strong> Dikosongkan (0 baris riwayat)</div>
                  <div>• <strong>Siswa, Kelas, Libur:</strong> Dikosongkan (0 data sekolah)</div>
                  <div>• <strong>Setelan Sekolah:</strong> Kembali ke nilai bawaan SDN 173 Gammara</div>
                  <div>• <strong>Auto-Backup:</strong> Mengunduh file JSON cadangan otomatis sebelum data dihapus</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL EDIT AKUN PIMPINAN (EMAIL & PASSWORD) OLEH PENGEMBANG */}
        {editingLeaderAccount && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 28, 53, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            overflowY: 'auto'
          }}>
            <div style={{
              background: '#0B2545',
              border: '1.5px solid rgba(0, 180, 216, 0.4)',
              borderRadius: '24px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              color: '#FFFFFF'
            }}>
              {/* Header Modal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(0, 180, 216, 0.2)', color: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Key size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF' }}>
                      Edit Akun {editLeaderRole === 'kepsek' ? 'Kepala Sekolah' : 'Administrator'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                      Ubah alamat email dan kata sandi akun pimpinan
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLeaderAccount(null)}
                  style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveEditLeaderAccount}>
                {/* Badge Peran */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.35rem' }}>
                    Peran Akun
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      background: editLeaderRole === 'kepsek' ? 'rgba(167,139,250,0.25)' : 'rgba(0,180,216,0.25)',
                      color: editLeaderRole === 'kepsek' ? '#C4B5FD' : '#38BDF8',
                      border: editLeaderRole === 'kepsek' ? '1px solid #8B5CF6' : '1px solid #00B4D8'
                    }}>
                      {editLeaderRole === 'kepsek' ? '🎓 Kepala Sekolah' : '🛡️ Administrator'}
                    </span>
                  </div>
                </div>

                {/* Nama Lengkap */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.35rem' }}>
                    Nama Lengkap Pimpinan
                  </label>
                  <input
                    type="text"
                    value={editLeaderName}
                    onChange={(e) => setEditLeaderName(e.target.value)}
                    placeholder="Nama Lengkap & Gelar"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1.5px solid rgba(255,255,255,0.15)',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '0.9rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Alamat Email */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.35rem' }}>
                    Alamat Email Akun
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} color="#64748B" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      value={editLeaderEmail}
                      onChange={(e) => setEditLeaderEmail(e.target.value)}
                      placeholder="email@sekolah.edu"
                      required
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem 0.75rem 2.5rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1.5px solid rgba(255,255,255,0.15)',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Password Baru */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#CBD5E1' }}>
                      Password Baru
                    </label>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Kosongkan jika tidak diubah</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} color="#64748B" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type={showEditPass ? "text" : "password"}
                      value={editLeaderPassword}
                      onChange={(e) => setEditLeaderPassword(e.target.value)}
                      placeholder="Masukkan password baru (minimal 6 karakter)"
                      minLength={6}
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 2.5rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1.5px solid rgba(255,255,255,0.15)',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '0.9rem',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPass(!showEditPass)}
                      style={{
                        position: 'absolute',
                        right: '0.85rem',
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
                      {showEditPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Tombol Simpan & Batal */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setEditingLeaderAccount(null)}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: '#CBD5E1',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingEditLeader}
                    style={{
                      flex: 2,
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #0284C7 0%, #00B4D8 100%)',
                      color: '#071C35',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      cursor: savingEditLeader ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={16} />
                    <span>{savingEditLeader ? 'Menyimpan...' : 'Simpan Kredensial'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL DIALOG RESET ULANG APLIKASI & PENGHAPUSAN AKUN */}
        {showResetModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7, 28, 53, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            overflowY: 'auto'
          }}>
            <div style={{
              background: '#0B2545',
              border: '1.5px solid rgba(239, 68, 68, 0.5)',
              borderRadius: '24px',
              maxWidth: '560px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
              color: '#FFFFFF'
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {resetMode === 'all_accounts' ? <UserX size={22} /> : <AlertTriangle size={22} />}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#FCA5A5' }}>
                      {resetMode === 'all_accounts' ? 'Hapus Semua Akun & Reset Total (Opsi 2)' : 'Reset Riwayat Data Aplikasi ke 0'}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#94A3B8' }}>
                      {resetMode === 'all_accounts' ? 'Seluruh akun dihapus, Admin baru dibuatkan oleh Pengembang' : 'Mengosongkan data presensi & jurnal, akun login tetap ada'}
                    </p>
                  </div>
                </div>
                {!isResetting && (
                  <button
                    onClick={() => setShowResetModal(false)}
                    style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                )}
              </div>

              {/* Modal Body */}
              {resetSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', border: '2px solid #10B981', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                    <CheckCircle2 size={38} />
                  </div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>
                    {resetMode === 'all_accounts' ? 'Reset Total & Pembuatan Admin Berhasil!' : 'Reset Data Berhasil!'}
                  </h4>
                  <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.5 }}>
                    {resetMode === 'all_accounts'
                      ? 'Seluruh akun guru & admin lama telah dihapus. Seluruh data transaksi kembali ke 0 dan Akun Admin Baru telah siap digunakan!'
                      : 'Seluruh riwayat presensi, jurnal, nilai, dan data siswa telah dikosongkan ke 0. File cadangan offline telah tersimpan di perangkat Anda.'}
                  </p>

                  {/* Kartu Kredensial Admin Baru jika Opsi 2 */}
                  {createdAdminResult && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1.5px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      marginBottom: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Kredensial Akun Admin Baru (Aktif)
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyNewAdminCredentials}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: copiedAdminResult ? '#10B981' : 'rgba(16, 185, 129, 0.2)',
                            color: '#FFFFFF',
                            border: '1px solid rgba(16, 185, 129, 0.5)',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {copiedAdminResult ? <Check size={13} /> : <Copy size={13} />}
                          <span>{copiedAdminResult ? 'Tersalin!' : 'Salin Kredensial'}</span>
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94A3B8' }}>Email Admin:</span>
                          <strong style={{ color: '#FFFFFF' }}>{createdAdminResult.email}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94A3B8' }}>Password:</span>
                          <strong style={{ color: '#38BDF8', letterSpacing: '1px' }}>{createdAdminResult.password}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94A3B8' }}>Nama Pimpinan:</span>
                          <strong style={{ color: '#FFFFFF' }}>{createdAdminResult.fullName}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false)
                      window.location.reload()
                    }}
                    style={{
                      background: '#10B981',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '0.8rem 2.2rem',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    Selesai & Segarkan Halaman
                  </button>
                </div>
              ) : isResetting ? (
                <div style={{ padding: '1rem 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                    <span style={{ color: '#FCA5A5', fontWeight: 700 }}>{resetProgressMsg || 'Memproses reset...'}</span>
                    <span style={{ color: '#FFFFFF', fontWeight: 800 }}>{resetProgressPct}%</span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', overflow: 'hidden', marginBottom: '1.25rem' }}>
                    <div style={{
                      width: `${resetProgressPct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #EF4444 0%, #10B981 100%)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8', textAlign: 'center' }}>
                    Harap jangan menutup browser atau aplikasi saat proses reset sedang berlangsung.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '0.9rem 1rem',
                    marginBottom: '1.25rem',
                    fontSize: '0.78rem',
                    color: '#FCA5A5',
                    lineHeight: 1.5
                  }}>
                    {resetMode === 'all_accounts' ? (
                      <>
                        <strong>PERINGATAN TINGKAT TINGGI (OPSI 2):</strong> Seluruh akun guru/pegawai/admin lama akan dihapus permanen dari sistem. Anda wajib menentukan akun Admin baru di bawah ini agar sekolah tetap memiliki akses pimpinan resmi. Backup JSON akan otomatis diunduh terlebih dahulu.
                      </>
                    ) : (
                      <>
                        <strong>Peringatan:</strong> Seluruh transaksi presensi, nilai, jurnal, dan data sekolah akan dikembalikan ke 0. Akun guru tetap ada tanpa penugasan mapel. Backup JSON otomatis diunduh sebelum penghapusan.
                      </>
                    )}
                  </div>

                  {/* Form Pembuatan Akun Admin Baru jika Opsi 2 */}
                  {resetMode === 'all_accounts' && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '14px',
                      padding: '1rem',
                      marginBottom: '1.25rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#38BDF8' }}>
                          Tentukan Akun Admin Baru (Dibuat oleh Pengembang):
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewAdminEmail('admin@gammara.sch.id')
                            setNewAdminPassword('admin123')
                            setNewAdminFullName('Administrator Sekolah')
                          }}
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#38BDF8',
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 700
                          }}
                        >
                          Gunakan Bawaan
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '3px', fontWeight: 600 }}>
                            Email Admin Baru:
                          </label>
                          <input
                            type="email"
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            placeholder="admin@sekolah.sch.id"
                            style={{
                              width: '100%',
                              padding: '0.65rem 0.85rem',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '8px',
                              color: '#FFFFFF',
                              fontSize: '0.85rem',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '3px', fontWeight: 600 }}>
                            Password Admin Baru (min. 6 karakter):
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showNewAdminPass ? 'text' : 'password'}
                              value={newAdminPassword}
                              onChange={(e) => setNewAdminPassword(e.target.value)}
                              placeholder="Minimal 6 karakter"
                              style={{
                                width: '100%',
                                padding: '0.65rem 2.4rem 0.65rem 0.85rem',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: '8px',
                                color: '#FFFFFF',
                                fontSize: '0.85rem',
                                outline: 'none'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewAdminPass(!showNewAdminPass)}
                              style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: 0
                              }}
                            >
                              {showNewAdminPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: '#94A3B8', marginBottom: '3px', fontWeight: 600 }}>
                            Nama Lengkap Admin / Pimpinan:
                          </label>
                          <input
                            type="text"
                            value={newAdminFullName}
                            onChange={(e) => setNewAdminFullName(e.target.value)}
                            placeholder="Contoh: Administrator Sekolah"
                            style={{
                              width: '100%',
                              padding: '0.65rem 0.85rem',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '8px',
                              color: '#FFFFFF',
                              fontSize: '0.85rem',
                              outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Input Konfirmasi Keamanan */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#CBD5E1', marginBottom: '0.5rem' }}>
                      Ketik <span style={{ color: '#EF4444', fontWeight: 900, background: 'rgba(239, 68, 68, 0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                        {resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI'}
                      </span> untuk konfirmasi:
                    </label>
                    <input
                      type="text"
                      value={resetConfirmInput}
                      onChange={(e) => setResetConfirmInput(e.target.value)}
                      placeholder={resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI'}
                      style={{
                        width: '100%',
                        padding: '0.85rem 1rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: resetConfirmInput.trim() === (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI') ? '2px solid #10B981' : '1.5px solid rgba(255,255,255,0.15)',
                        borderRadius: '12px',
                        color: '#FFFFFF',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        outline: 'none',
                        letterSpacing: '0.5px'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setShowResetModal(false)}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#CBD5E1',
                        padding: '0.75rem 1.25rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={resetConfirmInput.trim() !== (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI')}
                      onClick={handleExecuteReset}
                      style={{
                        background: resetConfirmInput.trim() === (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI')
                          ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
                          : 'rgba(239, 68, 68, 0.25)',
                        color: resetConfirmInput.trim() === (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI') ? '#FFFFFF' : '#94A3B8',
                        border: 'none',
                        padding: '0.75rem 1.4rem',
                        borderRadius: '12px',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        cursor: resetConfirmInput.trim() === (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI') ? 'pointer' : 'not-allowed',
                        boxShadow: resetConfirmInput.trim() === (resetMode === 'all_accounts' ? 'HAPUS SEMUA AKUN' : 'RESET APLIKASI') ? '0 4px 14px rgba(239, 68, 68, 0.4)' : 'none'
                      }}
                    >
                      {resetMode === 'all_accounts' ? 'Mulai Hapus Akun & Reset' : 'Mulai Reset Sekarang'}
                    </button>
                  </div>
                </div>
              )}
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
