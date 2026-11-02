import React, { useState, useEffect } from 'react'
import { 
  ShieldCheck, Lock, Key, Clock, UserCheck, Calendar, 
  X, Check, AlertCircle, Eye, EyeOff, Loader2, RefreshCw, AlertTriangle 
} from 'lucide-react'
import { 
  getCloudOverrideToken, 
  saveCloudOverrideToken, 
  verifyAdminOverrideToken, 
  executeAdminAttendanceOverride,
  getLocalDateString,
  getLocalTimeString,
  checkOverrideLockout,
  getTeacherMonthlyOverrideCount,
  getUserOverrideStats,
  submitKepsekApprovalRequest,
  BASE_ADMIN_OVERRIDE_QUOTA,
  MAX_KEPSEK_APPROVAL_QUOTA,
  getOverrideFeatureStatus
} from '../../lib/attendanceOverrideManager'

export default function AdminOverrideModal({ 
  isOpen, 
  onClose, 
  supabase, 
  currentAdmin, 
  pegawaiList = [], 
  onSuccess 
}) {
  // Hitung batasan tanggal lokal (H-1 sampai Hari Ini)
  const todayStr = getLocalDateString()
  const yesterdayObj = new Date()
  yesterdayObj.setDate(yesterdayObj.getDate() - 1)
  const yesterdayStr = getLocalDateString(yesterdayObj)

  // State Token Gate
  const [loadingTokenCheck, setLoadingTokenCheck] = useState(true)
  const [tokenExists, setTokenExists] = useState(false)
  const [isTokenVerified, setIsTokenVerified] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [featureActive, setFeatureActive] = useState(true)
  
  // State Buat Token Baru
  const [newToken, setNewToken] = useState('')
  const [confirmToken, setConfirmToken] = useState('')
  const [showNewToken, setShowNewToken] = useState(false)
  
  // State Input Token Akses
  const [inputToken, setInputToken] = useState('')
  const [showInputToken, setShowInputToken] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [savingToken, setSavingToken] = useState(false)

  // State Form Presensi Khusus
  const [selectedUserId, setSelectedUserId] = useState('')
  const [actionType, setActionType] = useState('clock_out') // 'clock_out' | 'clock_in'
  const [targetDate, setTargetDate] = useState(todayStr)
  const [targetTime, setTargetTime] = useState(() => getLocalTimeString())
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'error', text: '' }
  const [overrideReason, setOverrideReason] = useState('')

  // State Kuota 2 Tingkat Presensi Khusus
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [loadingQuota, setLoadingQuota] = useState(false)
  const [quotaConfirmed, setQuotaConfirmed] = useState(false)
  const [overrideStats, setOverrideStats] = useState({
    adminUsed: 0,
    adminRemaining: 2,
    kepsekUsed: 0,
    kepsekRemaining: 3,
    totalRemaining: 5,
    level: 1,
    canExecuteDirectly: true,
    canRequestKepsek: false,
    isExhausted: false,
    message: ''
  })

  // Pegawai yang diperbolehkan diubah: Seluruh Guru, Tendik, dan KEPSEK.
  // Akun Admin yang sedang login TIDAK DIPERBOLEHKAN (difilter keluar).
  const eligiblePegawai = (pegawaiList || []).filter(p => {
    if (!p?.id) return false
    if (p.id === currentAdmin?.id) return false // DILARANG: Tidak bisa mengubah diri sendiri
    return true
  })

  // 1. Initial check & Reset saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      checkTokenStatus()
      checkLockoutStatus()
      setFeedback(null)
      setTokenError('')
      setTargetDate(todayStr)
      setTargetTime(getLocalTimeString())
      setQuotaConfirmed(false)
    } else {
      // 2. Auto-Lock: Saat modal ditutup, sesi token langsung dikunci kembali
      setIsTokenVerified(false)
      setInputToken('')
      setNewToken('')
      setConfirmToken('')
      setFeedback(null)
      setSelectedUserId('')
      setMonthlyCount(0)
    }
  }, [isOpen])

  // Countdown timer untuk brute force lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const interval = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [lockoutSeconds])

  // Auto-Lock Timer: Kunci otomatis setelah 10 menit jika didiamkan terbuka
  useEffect(() => {
    if (!isTokenVerified) return
    const idleTimer = setTimeout(() => {
      setIsTokenVerified(false)
      setTokenError('Sesi telah kedaluwarsa demi keamanan (Auto-Lock). Silakan masukkan token kembali.')
    }, 10 * 60 * 1000) // 10 Menit

    return () => clearTimeout(idleTimer)
  }, [isTokenVerified])

  // Cek Kuota 2 Tingkat Guru / Tendik / Kepsek yang dipilih
  useEffect(() => {
    if (!selectedUserId) {
      setMonthlyCount(0)
      setQuotaConfirmed(false)
      setOverrideStats({
        adminUsed: 0,
        adminRemaining: 2,
        kepsekUsed: 0,
        kepsekRemaining: 3,
        totalRemaining: 5,
        level: 1,
        canExecuteDirectly: true,
        canRequestKepsek: false,
        isExhausted: false,
        message: ''
      })
      return
    }
    let isCurrent = true
    setLoadingQuota(true)
    getUserOverrideStats(supabase, selectedUserId, targetDate).then(stats => {
      if (isCurrent) {
        setOverrideStats(stats)
        setMonthlyCount(stats.adminUsed + stats.kepsekUsed)
        setLoadingQuota(false)
      }
    }).catch(() => {
      if (isCurrent) setLoadingQuota(false)
    })
    return () => { isCurrent = false }
  }, [selectedUserId, targetDate])

  const checkLockoutStatus = () => {
    const status = checkOverrideLockout()
    if (status.isLocked) {
      setLockoutSeconds(status.remainingSeconds)
    } else {
      setLockoutSeconds(0)
    }
  }

  const checkTokenStatus = async () => {
    setLoadingTokenCheck(true)
    try {
      const feat = await getOverrideFeatureStatus(supabase)
      setFeatureActive(feat.enabled !== false)

      const { exists } = await getCloudOverrideToken(supabase)
      setTokenExists(exists)
    } catch (e) {
      console.warn('Gagal cek status token:', e)
    } finally {
      setLoadingTokenCheck(false)
    }
  }

  const handleCreateToken = async (e) => {
    e.preventDefault()
    setTokenError('')
    if (!newToken.trim()) {
      setTokenError('Kode token tidak boleh kosong.')
      return
    }
    if (newToken.trim().length < 4) {
      setTokenError('Kode token minimal 4 karakter.')
      return
    }
    if (newToken.trim() !== confirmToken.trim()) {
      setTokenError('Konfirmasi kode token tidak cocok.')
      return
    }

    setSavingToken(true)
    try {
      await saveCloudOverrideToken(supabase, newToken.trim())
      setTokenExists(true)
      setIsTokenVerified(true)
      setTokenError('')
    } catch (err) {
      setTokenError(err.message || 'Gagal menyimpan kode token.')
    } finally {
      setSavingToken(false)
    }
  }

  const handleVerifyToken = async (e) => {
    e.preventDefault()
    setTokenError('')

    if (lockoutSeconds > 0) {
      setTokenError(`Akses dibekukan sementara. Tunggu ${Math.ceil(lockoutSeconds / 60)} menit lagi.`)
      return
    }

    if (!inputToken.trim()) {
      setTokenError('Silakan masukkan kode token.')
      return
    }

    setSavingToken(true)
    try {
      const res = await verifyAdminOverrideToken(supabase, inputToken.trim())
      if (res.success) {
        setIsTokenVerified(true)
        setTokenError('')
        setLockoutSeconds(0)
      } else {
        if (res.isLocked) {
          setLockoutSeconds(res.remainingSeconds || 15 * 60)
        }
        setTokenError(res.error || 'Kode Token salah! Silakan coba lagi.')
      }
    } catch (err) {
      setTokenError(err.message || 'Gagal verifikasi token.')
    } finally {
      setSavingToken(false)
    }
  }

  const handleSubmitOverride = async (e) => {
    e.preventDefault()
    setFeedback(null)

    if (!selectedUserId) {
      setFeedback({ type: 'error', text: 'Silakan pilih nama pegawai terlebih dahulu.' })
      return
    }

    // Validasi Tanggal (Maksimal H-1 s.d. Hari Ini)
    if (targetDate > todayStr) {
      setFeedback({ type: 'error', text: 'Tanggal tidak boleh melampaui hari ini.' })
      return
    }
    if (targetDate < yesterdayStr) {
      setFeedback({ type: 'error', text: 'Penyelarasan presensi dibatasi maksimal H-1 (Kemarin) demi keamanan data.' })
      return
    }

    // Validasi Jam (Jika hari ini, tidak boleh jam masa depan)
    if (targetDate === todayStr) {
      const currentNowTime = getLocalTimeString()
      if (targetTime > currentNowTime) {
        setFeedback({ 
          type: 'error', 
          text: `Jam presensi tidak boleh melampaui waktu sekarang (${currentNowTime}).` 
        })
        return
      }
    }

    // Validasi Alasan Presensi Khusus (Wajib Diisi)
    if (!overrideReason || !overrideReason.trim()) {
      setFeedback({ type: 'error', text: 'Alasan presensi khusus wajib diisi!' })
      return
    }

    // Validasi Tingkat Kuota
    if (overrideStats.isExhausted) {
      setFeedback({
        type: 'error',
        text: 'Kuota Presensi Khusus Habis'
      })
      return
    }

    setSubmitting(true)
    try {
      const targetEmp = eligiblePegawai.find(p => p.id === selectedUserId)
      const empName = targetEmp?.full_name || 'Pegawai'
      const empRole = targetEmp?.role === 'kepsek' ? 'Kepala Sekolah' : (targetEmp?.jabatan || targetEmp?.role || 'Guru')
      const actionLabel = actionType === 'clock_out' ? 'Clock Out (Pulang)' : 'Clock In (Masuk)'

      // TINGKAT 2: Kuota Admin Habis -> Ajukan ke Akun Kepala Sekolah
      if (overrideStats.level === 2 || !overrideStats.canExecuteDirectly) {
        await submitKepsekApprovalRequest(supabase, {
          targetUserId: selectedUserId,
          targetUserName: empName,
          targetUserRole: empRole,
          actionType,
          date: targetDate,
          timeStr: targetTime,
          reason: overrideReason.trim(),
          adminUserId: currentAdmin?.id,
          adminUserName: currentAdmin?.full_name || currentAdmin?.email || 'Administrator'
        })

        setFeedback({
          type: 'success',
          text: `Permohonan persetujuan ${actionLabel} untuk ${empName} berhasil dikirim ke akun Kepala Sekolah. Menunggu persetujuan.`
        })

        if (onSuccess) onSuccess()

        setTimeout(() => {
          setSelectedUserId('')
          setOverrideReason('')
        }, 2000)
        return
      }

      // TINGKAT 1: Kuota Langsung Masih Ada -> Eksekusi Langsung
      await executeAdminAttendanceOverride(supabase, {
        targetUserId: selectedUserId,
        targetUserName: empName,
        targetUserRole: empRole,
        actionType,
        date: targetDate,
        timeStr: targetTime,
        reason: overrideReason.trim(),
        adminUserId: currentAdmin?.id,
        adminUserName: currentAdmin?.full_name || currentAdmin?.email || 'Administrator'
      })

      setFeedback({
        type: 'success',
        text: `Berhasil! ${actionLabel} untuk ${empName} pada pukul ${targetTime} (${targetDate}) telah tersimpan dan tercatat di audit log pengembang.`
      })

      if (onSuccess) onSuccess()

      // Reset pilihan setelah 1.5 detik
      setTimeout(() => {
        setSelectedUserId('')
        setOverrideReason('')
      }, 1500)
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Gagal memproses presensi khusus.' })
    } finally {
      setSubmitting(false)
    }
  }

  const setTimeToNow = () => {
    setTargetTime(getLocalTimeString())
  }

  const handleCloseModal = () => {
    setIsTokenVerified(false)
    setInputToken('')
    setFeedback(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #E2E8F0',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header Modal */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          color: '#FFFFFF',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60A5FA'
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                Presensi Khusus / Darurat
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                Otoritas Kontrol Presensi Administrator
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '10px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFFFFF'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.5rem' }}>
          {loadingTokenCheck ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B' }}>
              <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Memeriksa status fitur & keamanan token...</p>
            </div>
          ) : !featureActive ? (
            /* SCREEN NONAKTIF: Fitur Dimatikan oleh Pengembang */
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: '#FEE2E2',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem auto'
              }}>
                <AlertTriangle size={34} />
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#0F172A', fontSize: '1.15rem', fontWeight: 800 }}>
                Fitur Presensi Khusus Dinonaktifkan
              </h3>
              <p style={{ color: '#64748B', fontSize: '0.85rem', lineHeight: '1.6', margin: '0 0 1.75rem 0' }}>
                Pengembang sistem telah menonaktifkan fitur Presensi Khusus untuk akun Administrator. Akses dispensasi jam presensi dikunci dari Panel Pengembang.
              </p>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  borderRadius: '12px',
                  background: '#0F172A',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: 'pointer'
                }}
              >
                Tutup Jendela
              </button>
            </div>
          ) : !tokenExists ? (
            /* SCREEN 1: Buat Token Baru (Akses Pertama Kali) */
            <div>
              <div style={{
                textAlign: 'center',
                padding: '1rem',
                background: '#F8FAFC',
                borderRadius: '16px',
                border: '1px dashed #CBD5E1',
                marginBottom: '1.25rem'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: '#EFF6FF',
                  color: '#2563EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.5rem auto'
                }}>
                  <Key size={24} />
                </div>
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                  Buat Kode Token Keamanan Baru
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                  Fitur ini belum memiliki kode token. Silakan buat kode token rahasia untuk mengamankan akses presensi khusus admin.
                </p>
              </div>

              {tokenError && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} />
                  <span>{tokenError}</span>
                </div>
              )}

              <form onSubmit={handleCreateToken}>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                    Kode Token Baru
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewToken ? 'text' : 'password'}
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                      placeholder="Masukkan minimal 4 karakter/PIN"
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.95rem',
                        letterSpacing: showNewToken ? 'normal' : '2px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewToken(!showNewToken)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#94A3B8'
                      }}
                    >
                      {showNewToken ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                    Konfirmasi Kode Token
                  </label>
                  <input
                    type={showNewToken ? 'text' : 'password'}
                    value={confirmToken}
                    onChange={(e) => setConfirmToken(e.target.value)}
                    placeholder="Ketik ulang kode token"
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      borderRadius: '12px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.95rem',
                      letterSpacing: showNewToken ? 'normal' : '2px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: '#F1F5F9',
                  color: '#475569',
                  fontSize: '0.75rem',
                  marginBottom: '1.25rem',
                  lineHeight: '1.4'
                }}>
                  🔒 <strong>Penting:</strong> Ingat kode token ini. Jika Anda lupa, kode token hanya dapat dilihat dan dipulihkan melalui <strong>Halaman Pengembang</strong>.
                </div>

                <button
                  type="submit"
                  disabled={savingToken}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '14px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: savingToken ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  {savingToken ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                  <span>Simpan & Aktifkan Token</span>
                </button>
              </form>
            </div>
          ) : !isTokenVerified ? (
            /* SCREEN 2: Masukkan Token untuk Membuka Akses (Dengan Proteksi Anti-Brute Force) */
            <div>
              <div style={{
                textAlign: 'center',
                padding: '1.25rem 1rem',
                background: '#F8FAFC',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                marginBottom: '1.25rem'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: lockoutSeconds > 0 ? '#FEE2E2' : '#FEF3C7',
                  color: lockoutSeconds > 0 ? '#DC2626' : '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.5rem auto'
                }}>
                  <Lock size={24} />
                </div>
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                  {lockoutSeconds > 0 ? 'Akses Terkunci Sementara' : 'Autentikasi Token Keamanan'}
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                  {lockoutSeconds > 0 
                    ? `Terdeteksi 3x percobaan salah. Silakan tunggu hingga hitung mundur selesai.` 
                    : `Masukkan kode token keamanan Administrator untuk mengakses kontrol presensi khusus.`}
                </p>
              </div>

              {lockoutSeconds > 0 && (
                <div style={{
                  padding: '0.85rem',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1.5px solid #EF4444',
                  color: '#991B1B',
                  textAlign: 'center',
                  marginBottom: '1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 800
                }}>
                  ⏳ Akses Terkunci: {Math.floor(lockoutSeconds / 60)}m {lockoutSeconds % 60}s
                </div>
              )}

              {tokenError && lockoutSeconds <= 0 && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#DC2626',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <AlertCircle size={16} />
                  <span>{tokenError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyToken}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                    Kode Token Keamanan
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showInputToken ? 'text' : 'password'}
                      value={inputToken}
                      onChange={(e) => setInputToken(e.target.value)}
                      placeholder="Masukkan kode token"
                      disabled={lockoutSeconds > 0}
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.95rem',
                        letterSpacing: showInputToken ? 'normal' : '2px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        background: lockoutSeconds > 0 ? '#F1F5F9' : '#FFFFFF',
                        cursor: lockoutSeconds > 0 ? 'not-allowed' : 'text'
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowInputToken(!showInputToken)}
                      disabled={lockoutSeconds > 0}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                        color: '#94A3B8'
                      }}
                    >
                      {showInputToken ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#64748B',
                  fontSize: '0.75rem',
                  marginBottom: '1.25rem',
                  lineHeight: '1.4'
                }}>
                  ℹ️ <strong>Lupa Kode Token?</strong> Kode token hanya dapat dilihat dan dibagikan oleh <strong>Pengembang Sistem</strong> melalui Halaman Pengembang.
                </div>

                <button
                  type="submit"
                  disabled={savingToken || lockoutSeconds > 0}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '14px',
                    background: lockoutSeconds > 0 ? '#94A3B8' : '#1E293B',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: savingToken || lockoutSeconds > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: lockoutSeconds > 0 ? 'none' : '0 4px 12px rgba(15, 23, 42, 0.2)'
                  }}
                >
                  {savingToken ? <Loader2 className="animate-spin" size={18} /> : <Key size={18} />}
                  <span>{lockoutSeconds > 0 ? 'Terkunci Sementara' : 'Buka Akses Kontrol'}</span>
                </button>
              </form>
            </div>
          ) : (
            /* SCREEN 3: Form Input Presensi Khusus / Darurat */
            <div>
              {feedback && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: feedback.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                  border: feedback.type === 'success' ? '1px solid #86EFAC' : '1px solid #FCA5A5',
                  color: feedback.type === 'success' ? '#166534' : '#DC2626',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  marginBottom: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {feedback.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                  <span>{feedback.text}</span>
                </div>
              )}

              <form onSubmit={handleSubmitOverride}>
                {/* 1. Pilih Pegawai */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                    Pilih Guru / Kepala Sekolah <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.9rem',
                      outline: 'none',
                      background: '#FFFFFF',
                      boxSizing: 'border-box'
                    }}
                    required
                  >
                    <option value="">-- Pilih Pegawai --</option>
                    {eligiblePegawai.map((p) => {
                      const isKepsek = p.role === 'kepsek'
                      const roleBadge = isKepsek ? '⭐ KEPALA SEKOLAH' : (p.jabatan || p.penugasan_tipe || 'Guru')
                      return (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({roleBadge})
                        </option>
                      )
                    })}
                  </select>
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.725rem', color: '#64748B' }}>
                    * Akun Admin tidak dapat dipilih demi integritas sistem.
                  </p>
                </div>

                {/* Indikator Kuota 2 Tingkat */}
                {selectedUserId && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    {loadingQuota ? (
                      <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Loader2 className="animate-spin" size={14} /> Memeriksa status kuota presensi khusus...
                      </div>
                    ) : overrideStats.isExhausted ? (
                      /* KETIKA TINGKAT 2 HABIS (TOTAL SUDAH 5 KALI) */
                      <div style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '14px',
                        background: '#FEF2F2',
                        border: '1.5px solid #EF4444',
                        color: '#991B1B'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertCircle size={20} color="#DC2626" />
                          <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                            Kuota Presensi Khusus Habis
                          </span>
                        </div>
                      </div>
                    ) : overrideStats.level === 2 ? (
                      /* KETIKA TINGKAT 1 HABIS (BUTUH PERSETUJUAN KEPSEK) */
                      <div style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '14px',
                        background: '#FFFBEB',
                        border: '1.5px solid #F59E0B',
                        color: '#92400E'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <AlertTriangle size={18} color="#D97706" />
                          <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                            Kuota Presensi Khusus Habis (Sudah digunakan 2x). Memerlukan persetujuan di akun Kepala Sekolah.
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.76rem', color: '#B45309' }}>
                          Sisa jatah persetujuan di akun Kepala Sekolah: <strong>{overrideStats.kepsekRemaining} / 3x</strong> bulan ini. Tekan tombol di bawah untuk mengajukan izin.
                        </p>
                      </div>
                    ) : (
                      /* TINGKAT 1 (KUOTA LANGSUNG AKTIF) */
                      <div style={{
                        padding: '0.6rem 0.85rem',
                        borderRadius: '12px',
                        background: '#F0FDF4',
                        border: '1.5px solid #86EFAC',
                        fontSize: '0.78rem',
                        color: '#166534',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Check size={15} color="#16A34A" />
                          <span>Status Kuota Langsung: <strong>Aktif</strong> ({overrideStats.adminUsed}/2x terpakai)</span>
                        </div>
                        <span style={{ fontWeight: 800, background: '#DCFCE7', padding: '0.2rem 0.55rem', borderRadius: '8px', color: '#15803D' }}>
                          Sisa: {overrideStats.adminRemaining}x
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Jenis Tindakan Presensi */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                    Tindakan Presensi <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setActionType('clock_out')}
                      style={{
                        padding: '0.75rem 0.5rem',
                        borderRadius: '12px',
                        border: actionType === 'clock_out' ? '2px solid #EF4444' : '1.5px solid #E2E8F0',
                        background: actionType === 'clock_out' ? '#FEF2F2' : '#FFFFFF',
                        color: actionType === 'clock_out' ? '#B91C1C' : '#64748B',
                        fontWeight: 700,
                        fontSize: '0.825rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>🚪</span>
                      <span>Clock Out</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 500, color: actionType === 'clock_out' ? '#DC2626' : '#94A3B8' }}>
                        (Pulang Cepat)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActionType('clock_in')}
                      style={{
                        padding: '0.75rem 0.5rem',
                        borderRadius: '12px',
                        border: actionType === 'clock_in' ? '2px solid #10B981' : '1.5px solid #E2E8F0',
                        background: actionType === 'clock_in' ? '#F0FDF4' : '#FFFFFF',
                        color: actionType === 'clock_in' ? '#047857' : '#64748B',
                        fontWeight: 700,
                        fontSize: '0.825rem',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>⏰</span>
                      <span>Clock In</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 500, color: actionType === 'clock_in' ? '#059669' : '#94A3B8' }}>
                        (Terlambat/Kendala)
                      </span>
                    </button>
                  </div>
                </div>

                {/* 3. Tanggal (Dibatasi H-1 s.d. Hari Ini) & Jam (Anti Jam Masa Depan) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                      Tanggal (Maks. H-1)
                    </label>
                    <input
                      type="date"
                      value={targetDate}
                      min={yesterdayStr}
                      max={todayStr}
                      onChange={(e) => setTargetDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                    <span style={{ fontSize: '0.675rem', color: '#64748B' }}>
                      * Hanya hari ini & kemarin
                    </span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#334155' }}>
                        Jam Presensi
                      </label>
                      <button
                        type="button"
                        onClick={setTimeToNow}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563EB',
                          fontSize: '0.725rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Sekarang
                      </button>
                    </div>
                    <input
                      type="time"
                      value={targetTime}
                      max={targetDate === todayStr ? getLocalTimeString() : '23:59'}
                      onChange={(e) => setTargetTime(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                    <span style={{ fontSize: '0.675rem', color: '#64748B' }}>
                      * Maks. jam sekarang
                    </span>
                  </div>
                </div>

                {/* 4. Alasan Presensi Khusus (Wajib Diisi) */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                    Alasan Presensi Khusus <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Contoh: Lupa Clock Out saat jam pulang, kendala jaringan di sekolah, baterai HP habis..."
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '12px',
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.875rem',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                  {/* Pilihan Cepat Alasan */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {[
                      'Lupa Clock Out saat jam pulang',
                      'Kendala sinyal/jaringan sekolah',
                      'Baterai HP habis / kendala HP',
                      'Izin kedinasan mendadak'
                    ].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setOverrideReason(chip)}
                        style={{
                          background: '#F1F5F9',
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.7rem',
                          color: '#475569',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    style={{
                      flex: 1,
                      padding: '0.875rem',
                      borderRadius: '14px',
                      background: '#F1F5F9',
                      color: '#475569',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      cursor: 'pointer'
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || overrideStats.isExhausted || !selectedUserId || !overrideReason.trim()}
                    style={{
                      flex: 2,
                      padding: '0.875rem',
                      borderRadius: '14px',
                      background: overrideStats.isExhausted 
                        ? '#94A3B8' 
                        : (overrideStats.level === 2 
                            ? 'linear-gradient(135deg, #D97706 0%, #B45309 100%)' 
                            : (actionType === 'clock_out' ? '#DC2626' : '#059669')),
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: (submitting || overrideStats.isExhausted || !selectedUserId || !overrideReason.trim()) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: overrideStats.isExhausted ? 'none' : '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                    <span>
                      {overrideStats.isExhausted 
                        ? 'Kuota Presensi Khusus Habis' 
                        : (overrideStats.level === 2 
                            ? 'Ajukan Izin ke Akun Kepala Sekolah' 
                            : 'Simpan Presensi Khusus')}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
