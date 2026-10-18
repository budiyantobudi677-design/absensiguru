import { useState, useEffect } from 'react'
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Download,
  Calendar,
  Clock,
  HardDrive,
  FileSpreadsheet,
  FileText,
  Database,
  HelpCircle,
  Key,
  LogOut,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Check
} from 'lucide-react'
import {
  getGDriveConfig,
  saveGDriveConfig,
  disconnectGDrive,
  requestGDriveAccessToken,
  runFullBackupToDrive,
  downloadDirectBackupBundle
} from '../../lib/googleDriveBackupManager'

export default function GoogleDriveBackupCard({ supabase, darkMode = false }) {
  const [config, setConfig] = useState(getGDriveConfig())
  const [clientIdInput, setClientIdInput] = useState(config.clientId || '')
  const [frequency, setFrequency] = useState(config.frequency || '24h')
  const [connecting, setConnecting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState(null)
  const [downloadingOffline, setDownloadingOffline] = useState(false)
  const [offlineStatus, setOfflineStatus] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)

  useEffect(() => {
    const current = getGDriveConfig()
    setConfig(current)
    setClientIdInput(current.clientId || '')
    setFrequency(current.frequency || '24h')
  }, [])

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 4000)
  }

  const isConnected = !!(config.accessToken && config.userEmail)
  const isTokenExpired = !!(config.tokenExpiresAt && Date.now() > config.tokenExpiresAt)

  // Hitung jadwal pencadangan berikutnya
  const getNextBackupText = () => {
    if (frequency === 'manual') return 'Mode Manual (Pencadangan dilakukan saat tombol ditekan)'
    if (!config.lastBackupAt) return 'Segera setelah diaktifkan'

    const intervals = {
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000
    }
    const intervalMs = intervals[frequency] || intervals['24h']
    const lastTime = new Date(config.lastBackupAt).getTime()
    const nextTime = new Date(lastTime + intervalMs)

    if (Date.now() >= nextTime.getTime()) {
      return 'Siap dicadangkan (Akan berjalan otomatis saat membuka dashboard)'
    }

    return nextTime.toLocaleString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Handler simpan interval / frekuensi
  const handleFrequencyChange = (newFreq) => {
    setFrequency(newFreq)
    const updated = saveGDriveConfig({ frequency: newFreq })
    setConfig(updated)
    showToast(`Metode pencadangan diubah ke: ${
      newFreq === '24h' ? 'Setiap 24 Jam' :
      newFreq === '48h' ? 'Setiap 2 Hari' :
      newFreq === 'weekly' ? 'Setiap Pekan' : 'Manual Saja'
    }`)
  }

  // Handler simpan Client ID
  const handleSaveClientId = () => {
    if (!clientIdInput.trim()) {
      alert('Silakan masukkan Google OAuth Client ID terlebih dahulu.')
      return
    }
    const updated = saveGDriveConfig({ clientId: clientIdInput.trim() })
    setConfig(updated)
    showToast('Google OAuth Client ID berhasil disimpan!')
  }

  // Handler koneksi Google Drive via GIS
  const handleConnect = async () => {
    const cId = clientIdInput.trim() || config.clientId
    if (!cId) {
      alert('Silakan masukkan Google OAuth Client ID terlebih dahulu.')
      return
    }

    setConnecting(true)
    try {
      const res = await requestGDriveAccessToken(cId)
      setConfig(res.config)
      showToast(`Berhasil terhubung dengan akun Google: ${res.userEmail}`)
    } catch (err) {
      alert(`Gagal menghubungkan Google Drive: ${err.message}`)
    } finally {
      setConnecting(false)
    }
  }

  // Handler disconnect
  const handleDisconnect = () => {
    if (window.confirm('Apakah Anda yakin ingin memutuskan koneksi akun Google Drive ini?')) {
      const cleared = disconnectGDrive()
      setConfig(cleared)
      showToast('Koneksi Google Drive diputuskan.', 'info')
    }
  }

  // Handler Eksekusi Backup ke Drive
  const handleRunBackup = async () => {
    if (!isConnected) {
      alert('Akun Google Drive belum terhubung. Silakan hubungkan terlebih dahulu.')
      return
    }

    if (isTokenExpired) {
      alert('Sesi Google Drive telah kedaluwarsa. Silakan klik "Hubungkan Ulang Google Drive".')
      return
    }

    setBackingUp(true)
    setBackupProgress({ step: 1, total: 6, message: 'Memulai proses pencadangan...' })

    try {
      const res = await runFullBackupToDrive({
        supabase,
        onProgress: (p) => setBackupProgress(p)
      })

      const current = getGDriveConfig()
      setConfig(current)
      showToast('Pencadangan ke Google Drive berhasil diselesaikan!')
    } catch (err) {
      alert(`Gagal mencadangkan data ke Google Drive: ${err.message}`)
      setConfig(getGDriveConfig())
    } finally {
      setBackingUp(false)
      setBackupProgress(null)
    }
  }

  // Handler Download Offline
  const handleDownloadOffline = async () => {
    setDownloadingOffline(true)
    setOfflineStatus('Menyiapkan seluruh data sekolah...')
    try {
      await downloadDirectBackupBundle(supabase, (statusText) => {
        setOfflineStatus(statusText)
      })
      showToast('Semua berkas cadangan (.xlsx & .json) berhasil diunduh ke perangkat Anda!')
    } catch (err) {
      alert(`Gagal mengunduh cadangan offline: ${err.message}`)
    } finally {
      setDownloadingOffline(false)
      setOfflineStatus(null)
    }
  }

  return (
    <div
      className="card"
      style={{
        border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
        background: darkMode ? '#1E293B' : '#FFFFFF',
        marginBottom: '2rem',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)'
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            background: toastMessage.type === 'info' ? '#3B82F6' : '#10B981',
            color: 'white',
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            marginBottom: '1rem',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 500,
            animation: 'fadeIn 0.2s ease-in'
          }}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Card */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '1.25rem',
          borderBottom: darkMode ? '1px solid #334155' : '1px solid #F1F5F9'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(66, 133, 244, 0.25)'
            }}
          >
            <Cloud size={24} color="#FFFFFF" />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
              Pencadangan Cloud Google Drive
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
              Otomatisasi pencadangan data persuratan, siswa, nilai & database sekolah
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isConnected && !isTokenExpired ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: '#ECFDF5',
                color: '#065F46',
                border: '1px solid #A7F3D0'
              }}
            >
              <CheckCircle2 size={13} color="#10B981" />
              Terhubung ke Google Drive
            </span>
          ) : isTokenExpired ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: '#FFFBEB',
                color: '#B45309',
                border: '1px solid #FDE68A'
              }}
            >
              <AlertCircle size={13} color="#F59E0B" />
              Sesi Perlu Diperbarui
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: darkMode ? '#334155' : '#F1F5F9',
                color: darkMode ? '#CBD5E1' : '#64748B'
              }}
            >
              <Cloud size={13} />
              Belum Terhubung
            </span>
          )}
        </div>
      </div>

      {/* Account Info Box (Jika Terhubung) */}
      {isConnected && (
        <div
          style={{
            margin: '1.25rem 0',
            padding: '1rem',
            borderRadius: '12px',
            background: darkMode ? '#0F172A' : '#F8FAFC',
            border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {config.userAvatar ? (
              <img
                src={config.userAvatar}
                alt="Avatar"
                style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#E0E7FF',
                  color: '#4338CA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem'
                }}
              >
                {config.userName ? config.userName.charAt(0).toUpperCase() : 'G'}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                {config.userName || 'Akun Google Sekolah'}
              </div>
              <div style={{ fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                {config.userEmail}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {config.rootFolderUrl && (
              <a
                href={config.rootFolderUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '0.78rem',
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  textDecoration: 'none',
                  fontWeight: 600,
                  border: '1px solid #C7D2FE'
                }}
              >
                <ExternalLink size={13} />
                Buka Folder Drive
              </a>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '10px',
                fontSize: '0.78rem',
                background: '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FECACA',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              <LogOut size={13} />
              Putuskan
            </button>
          </div>
        </div>
      )}

      {/* Google Client ID Configuration (Jika Belum Terhubung atau Ingin Mengganti) */}
      {!isConnected && (
        <div style={{ marginTop: '1.25rem' }}>
          <div className="input-group">
            <label
              className="input-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.85rem'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={14} color="#6366F1" />
                Google OAuth Client ID
              </span>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#4F46E5',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <HelpCircle size={13} />
                {showGuide ? 'Tutup Panduan' : 'Panduan Membuat Client ID'}
                {showGuide ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="Contoh: 123456789-xxxx.apps.googleusercontent.com"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleSaveClientId}
                className="btn"
                style={{
                  background: '#F1F5F9',
                  color: '#1E293B',
                  fontSize: '0.8rem',
                  padding: '0 1rem',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1'
                }}
              >
                Simpan
              </button>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                color: darkMode ? '#94A3B8' : '#64748B',
                marginTop: '4px',
                display: 'block'
              }}
            >
              Client ID dari Google Cloud Console dengan cakupan <code>drive.file</code> (hanya mengakses berkas yang dibuat PanritaEdu).
            </span>
          </div>

          {/* Panduan Buat Client ID */}
          {showGuide && (
            <div
              style={{
                padding: '1rem',
                borderRadius: '12px',
                background: darkMode ? '#0F172A' : '#F0FDF4',
                border: darkMode ? '1px solid #1E293B' : '1px solid #BBF7D0',
                marginBottom: '1rem',
                fontSize: '0.78rem',
                color: darkMode ? '#E2E8F0' : '#166534',
                lineHeight: '1.6'
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} /> Langkah Cepat Mendapatkan Google Client ID (Gratis 2 Menit):
              </div>
              <ol style={{ paddingLeft: '1.25rem', margin: '4px 0 0 0' }}>
                <li>Buka <strong>Google Cloud Console</strong> (<a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>console.cloud.google.com</a>).</li>
                <li>Buat Proyek baru atau pilih proyek sekolah Anda.</li>
                <li>Buka menu <strong>APIs & Services &gt; Library</strong>, cari dan aktifkan <strong>Google Drive API</strong>.</li>
                <li>Buka menu <strong>Credentials &gt; Create Credentials &gt; OAuth client ID</strong>.</li>
                <li>Pilih Application Type: <strong>Web application</strong>.</li>
                <li>Pada <strong>Authorized JavaScript origins</strong>, tambahkan URL asal aplikasi Anda (misal URL hosting atau <code>http://localhost:5173</code>).</li>
                <li>Salin <strong>Client ID</strong> yang muncul, tempelkan pada kolom di atas, lalu klik <strong>Hubungkan Google Drive</strong>.</li>
              </ol>
            </div>
          )}

          {/* Tombol Hubungkan Google */}
          <button
            type="button"
            disabled={connecting || !clientIdInput.trim()}
            onClick={handleConnect}
            className="btn"
            style={{
              width: '100%',
              padding: '0.85rem',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4285F4 0%, #1A73E8 100%)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(66, 133, 244, 0.3)',
              cursor: (connecting || !clientIdInput.trim()) ? 'not-allowed' : 'pointer',
              marginBottom: '1.25rem'
            }}
          >
            {connecting ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Menghubungkan ke Google...</span>
              </>
            ) : (
              <>
                <Cloud size={16} />
                <span>Hubungkan Akun Google Drive</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Sesi Expired Action */}
      {isConnected && isTokenExpired && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#92400E' }}>
            Sesi otorisasi Google Drive telah habis demi keamanan. Silakan otorisasi ulang:
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="btn"
            style={{
              background: '#D97706',
              color: 'white',
              fontSize: '0.78rem',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            {connecting ? 'Menyambung...' : 'Perbarui Sesi'}
          </button>
        </div>
      )}

      {/* PENGATURAN INTERVAL PENCADANGAN */}
      <div style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
        <label
          className="input-label"
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: darkMode ? '#F1F5F9' : '#1E293B',
            marginBottom: '0.65rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Clock size={15} color="#4F46E5" />
          Metode & Frekuensi Pencadangan Otomatis
        </label>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px'
          }}
        >
          {[
            { id: '24h', label: 'Setiap 24 Jam', sub: 'Harian Otomatis', icon: Clock },
            { id: '48h', label: 'Setiap 2 Hari', sub: 'Per 48 Jam', icon: Calendar },
            { id: 'weekly', label: 'Setiap Pekan', sub: 'Mingguan (7 Hari)', icon: Calendar },
            { id: 'manual', label: 'Manual Saja', sub: 'Saat Tombol Ditekan', icon: HardDrive }
          ].map((item) => {
            const isSelected = frequency === item.id
            const IconComponent = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleFrequencyChange(item.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: isSelected
                    ? '2px solid #4F46E5'
                    : (darkMode ? '1px solid #334155' : '1px solid #E2E8F0'),
                  background: isSelected
                    ? (darkMode ? '#1E1B4B' : '#EEF2FF')
                    : (darkMode ? '#0F172A' : '#FAFAFA'),
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}>
                  <IconComponent size={15} color={isSelected ? '#4F46E5' : '#64748B'} />
                  {isSelected && <Check size={14} color="#4F46E5" strokeWidth={3} />}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isSelected ? '#4338CA' : (darkMode ? '#F8FAFC' : '#1E293B') }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  {item.sub}
                </div>
              </button>
            )
          })}
        </div>

        {/* Info Jadwal Berikutnya */}
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.85rem',
            borderRadius: '10px',
            background: darkMode ? '#0F172A' : '#F8FAFC',
            border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
            fontSize: '0.76rem',
            color: darkMode ? '#94A3B8' : '#64748B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '6px'
          }}
        >
          <span>Pencadangan Berikutnya:</span>
          <strong style={{ color: darkMode ? '#F8FAFC' : '#1E293B' }}>{getNextBackupText()}</strong>
        </div>
      </div>

      {/* STATUS PENCADANGAN TERAKHIR */}
      <div
        style={{
          padding: '1rem',
          borderRadius: '12px',
          background: darkMode ? '#0F172A' : '#F8FAFC',
          border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: darkMode ? '#F8FAFC' : '#1E293B', marginBottom: '8px' }}>
          Status Cadangan Terakhir
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.78rem' }}>
          <div>
            <span style={{ color: darkMode ? '#94A3B8' : '#64748B' }}>Waktu Cadangan: </span>
            <strong style={{ color: darkMode ? '#F8FAFC' : '#1E293B' }}>
              {config.lastBackupAt
                ? new Date(config.lastBackupAt).toLocaleString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Belum pernah dicadangkan'}
            </strong>
          </div>
          <div>
            <span style={{ color: darkMode ? '#94A3B8' : '#64748B' }}>Ringkasan: </span>
            <strong
              style={{
                color: config.lastBackupStatus === 'success'
                  ? '#10B981'
                  : (config.lastBackupStatus === 'failed' ? '#EF4444' : (darkMode ? '#CBD5E1' : '#64748B'))
              }}
            >
              {config.lastBackupSummary || 'Menunggu pencadangan pertama'}
            </strong>
          </div>
        </div>

        {/* Progress Bar Saat Pencadangan Aktif */}
        {backingUp && backupProgress && (
          <div style={{ marginTop: '1rem', animation: 'fadeIn 0.2s ease-in' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
              <span style={{ fontWeight: 600, color: '#4F46E5' }}>{backupProgress.message}</span>
              <span>{Math.round((backupProgress.step / backupProgress.total) * 100)}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(backupProgress.step / backupProgress.total) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #4F46E5 0%, #10B981 100%)',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* KONTEN BERKAS YANG DICADANGKAN */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: darkMode ? '#94A3B8' : '#64748B', marginBottom: '8px' }}>
          Struktur Berkas Cadangan di Google Drive:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: darkMode ? '#0F172A' : '#F1F5F9', fontSize: '0.74rem' }}>
            <FileSpreadsheet size={16} color="#10B981" />
            <span>01. Data Siswa & Rombel (.xlsx)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: darkMode ? '#0F172A' : '#F1F5F9', fontSize: '0.74rem' }}>
            <FileSpreadsheet size={16} color="#3B82F6" />
            <span>02. Legger & Nilai Siswa (.xlsx)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: darkMode ? '#0F172A' : '#F1F5F9', fontSize: '0.74rem' }}>
            <FileSpreadsheet size={16} color="#F59E0B" />
            <span>03. Rekap Presensi Harian (.xlsx)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: darkMode ? '#0F172A' : '#F1F5F9', fontSize: '0.74rem' }}>
            <FileText size={16} color="#6366F1" />
            <span>04. Arsip Persuratan Resmi (.docx)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: darkMode ? '#0F172A' : '#F1F5F9', fontSize: '0.74rem' }}>
            <Database size={16} color="#EC4899" />
            <span>05. Snapshot Database Recovery (.json)</span>
          </div>
        </div>
      </div>

      {/* TOMBOL AKSI UTAMA */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {/* Tombol Cadangkan ke Drive */}
        <button
          type="button"
          disabled={backingUp || !isConnected || isTokenExpired}
          onClick={handleRunBackup}
          className="btn"
          style={{
            flex: '1 1 220px',
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: '0.85rem',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
            cursor: (backingUp || !isConnected || isTokenExpired) ? 'not-allowed' : 'pointer'
          }}
        >
          {backingUp ? (
            <>
              <RefreshCw size={16} className="spin" />
              <span>Sedang Mencadangkan ke Drive...</span>
            </>
          ) : (
            <>
              <Cloud size={16} />
              <span>🚀 Cadangkan Sekarang ke Google Drive</span>
            </>
          )}
        </button>

        {/* Tombol Buka Folder Drive */}
        {config.rootFolderUrl && (
          <a
            href={config.rootFolderUrl}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '12px',
              background: '#F1F5F9',
              color: '#1E293B',
              fontWeight: 600,
              fontSize: '0.82rem',
              border: '1px solid #CBD5E1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textDecoration: 'none'
            }}
          >
            <ExternalLink size={15} />
            <span>Folder Drive</span>
          </a>
        )}

        {/* Tombol Cadangan Offline Direct Download */}
        <button
          type="button"
          disabled={downloadingOffline}
          onClick={handleDownloadOffline}
          className="btn"
          style={{
            flex: '1 1 180px',
            padding: '0.85rem 1.25rem',
            borderRadius: '12px',
            background: darkMode ? '#334155' : '#F8FAFC',
            color: darkMode ? '#F8FAFC' : '#334155',
            fontWeight: 600,
            fontSize: '0.82rem',
            border: darkMode ? '1px solid #475569' : '1px solid #CBD5E1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: downloadingOffline ? 'not-allowed' : 'pointer'
          }}
        >
          {downloadingOffline ? (
            <>
              <RefreshCw size={15} className="spin" />
              <span>{offlineStatus || 'Mengunduh...'}</span>
            </>
          ) : (
            <>
              <Download size={15} />
              <span>📥 Unduh Cadangan Offline (.xlsx & .json)</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
