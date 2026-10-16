import React, { useState, useEffect } from 'react'
import { 
  ShieldCheck, Lock, Key, Clock, UserCheck, Calendar, 
  X, Check, AlertCircle, Eye, EyeOff, Loader2, RefreshCw 
} from 'lucide-react'
import { 
  getCloudOverrideToken, 
  saveCloudOverrideToken, 
  verifyAdminOverrideToken, 
  executeAdminAttendanceOverride 
} from '../../lib/attendanceOverrideManager'

export default function AdminOverrideModal({ 
  isOpen, 
  onClose, 
  supabase, 
  currentAdmin, 
  pegawaiList = [], 
  onSuccess 
}) {
  // State Token Gate
  const [loadingTokenCheck, setLoadingTokenCheck] = useState(true)
  const [tokenExists, setTokenExists] = useState(false)
  const [isTokenVerified, setIsTokenVerified] = useState(false)
  
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
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [targetTime, setTargetTime] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'error', text: '' }

  // Pegawai yang diperbolehkan diubah: Seluruh Guru, Tendik, dan KEPSEK.
  // Akun Admin yang sedang login TIDAK DIPERBOLEHKAN (difilter keluar).
  const eligiblePegawai = (pegawaiList || []).filter(p => {
    if (!p?.id) return false
    if (p.id === currentAdmin?.id) return false // DILARANG: Tidak bisa mengubah diri sendiri
    return true
  })

  useEffect(() => {
    if (isOpen) {
      checkTokenStatus()
      setFeedback(null)
      setTokenError('')
    } else {
      // Reset input fields saat modal ditutup
      setInputToken('')
      setNewToken('')
      setConfirmToken('')
      setFeedback(null)
    }
  }, [isOpen])

  const checkTokenStatus = async () => {
    setLoadingTokenCheck(true)
    try {
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
      } else {
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

    setSubmitting(true)
    try {
      await executeAdminAttendanceOverride(supabase, {
        targetUserId: selectedUserId,
        actionType,
        date: targetDate,
        timeStr: targetTime,
        adminUserId: currentAdmin?.id
      })

      const targetEmp = eligiblePegawai.find(p => p.id === selectedUserId)
      const empName = targetEmp?.full_name || 'Pegawai'
      const actionLabel = actionType === 'clock_out' ? 'Clock Out (Pulang Cepat)' : 'Clock In (Masuk)'

      setFeedback({
        type: 'success',
        text: `Berhasil! ${actionLabel} untuk ${empName} pada pukul ${targetTime} telah tersimpan.`
      })

      if (onSuccess) onSuccess()

      // Reset pilihan setelah 1.5 detik
      setTimeout(() => {
        setSelectedUserId('')
      }, 1500)
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Gagal menyimpan presensi khusus.' })
    } finally {
      setSubmitting(false)
    }
  }

  const setTimeToNow = () => {
    const d = new Date()
    setTargetTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
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
            onClick={onClose}
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
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Memeriksa keamanan token...</p>
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
                      placeholder="Masukkan 4-8 karakter/PIN"
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
            /* SCREEN 2: Masukkan Token untuk Membuka Akses */
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
                  background: '#FEF3C7',
                  color: '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.5rem auto'
                }}>
                  <Lock size={24} />
                </div>
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: 700, color: '#1E293B' }}>
                  Autentikasi Token Keamanan
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', lineHeight: '1.4' }}>
                  Masukkan kode token keamanan Administrator untuk mengakses kontrol presensi khusus.
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
                      style={{
                        width: '100%',
                        padding: '0.75rem 2.5rem 0.75rem 1rem',
                        borderRadius: '12px',
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.95rem',
                        letterSpacing: showInputToken ? 'normal' : '2px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowInputToken(!showInputToken)}
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
                  disabled={savingToken}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '14px',
                    background: '#1E293B',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: savingToken ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
                  }}
                >
                  {savingToken ? <Loader2 className="animate-spin" size={18} /> : <Key size={18} />}
                  <span>Buka Akses Kontrol</span>
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

                {/* 3. Tanggal & Jam */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem' }}>
                      Tanggal
                    </label>
                    <input
                      type="date"
                      value={targetDate}
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
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <label style={{ fontSize: '0.825rem', fontWeight: 700, color: '#334155' }}>
                        Jam
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
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
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
                    disabled={submitting}
                    style={{
                      flex: 2,
                      padding: '0.875rem',
                      borderRadius: '14px',
                      background: actionType === 'clock_out' ? '#DC2626' : '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: actionType === 'clock_out' 
                        ? '0 4px 12px rgba(220, 38, 38, 0.25)' 
                        : '0 4px 12px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                    <span>Simpan Presensi</span>
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
