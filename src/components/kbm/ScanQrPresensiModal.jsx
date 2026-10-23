import React, { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { 
  X, Camera, RefreshCw, CheckCircle2, AlertCircle, 
  Volume2, VolumeX, Users, Sparkles, UserCheck, Search,
  ArrowRight, ShieldCheck, Zap
} from 'lucide-react'

// Synthesizer Web Audio API for scanner beep (Zero external mp3 needed)
function playBeep(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()
    const now = ctx.currentTime

    if (type === 'success') {
      // Cheerful 2-tone chime: 660Hz -> 880Hz
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(660, now)
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12)
      gain1.gain.setValueAtTime(0.25, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.23)
    } else if (type === 'warning') {
      // Lower double beep
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(400, now)
      gain.gain.setValueAtTime(0.2, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.16)
    }
  } catch (e) {
    // Audio might be blocked by browser policy until user interaction
  }
}

export default function ScanQrPresensiModal({
  isOpen,
  onClose,
  students = [],
  classes = [],
  activeClassId = '',
  selectedDate = '',
  attendanceMap = {},
  onAttendanceUpdated,
  supabase,
  user
}) {
  const [scannerInitialized, setScannerInitialized] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [availableCameras, setAvailableCameras] = useState([])
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0)
  const [lastScannedStudent, setLastScannedStudent] = useState(null)
  const [recentScans, setRecentScans] = useState([])
  const [manualQuery, setManualQuery] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const html5QrCodeRef = useRef(null)
  const lastScanTimeRef = useRef({})
  const containerId = 'panrita-student-qr-viewport'

  const currentClass = classes.find(c => String(c.id) === String(activeClassId))
  const classNameStr = currentClass?.name || 'Kelas'

  // Hitung hadir
  const totalStudents = students.length
  const presentCount = students.filter(s => (attendanceMap[s.id] || 'hadir') === 'hadir').length

  // Inisialisasi scanner saat modal terbuka
  useEffect(() => {
    let isMounted = true
    if (!isOpen) return

    setCameraError(null)
    setLastScannedStudent(null)

    const initScanner = async () => {
      try {
        const devices = await Html5Qrcode.getCameras()
        if (!isMounted) return

        if (!devices || devices.length === 0) {
          throw new Error('Tidak ada kamera yang ditemukan pada perangkat ini.')
        }

        setAvailableCameras(devices)

        // Cari kamera belakang (environment) secara default
        let backCameraIndex = devices.findIndex(d => 
          /back|rear|environment|belakang/i.test(d.label)
        )
        if (backCameraIndex < 0) backCameraIndex = 0
        setCurrentCameraIndex(backCameraIndex)

        const selectedDeviceId = devices[backCameraIndex].id
        await startCamera(selectedDeviceId)
      } catch (err) {
        if (!isMounted) return
        console.error('Error init camera:', err)
        setCameraError(err.message || 'Gagal mengakses kamera.')
      }
    }

    const timer = setTimeout(() => {
      initScanner()
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
      stopScanner()
    }
  }, [isOpen])

  const startCamera = async (cameraId) => {
    try {
      await stopScanner()

      const qrScanner = new Html5Qrcode(containerId)
      html5QrCodeRef.current = qrScanner

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.min(viewfinderWidth, viewfinderHeight) * 0.72
          return { width: Math.floor(edge), height: Math.floor(edge) }
        },
        aspectRatio: 1.0
      }

      await qrScanner.start(
        cameraId,
        config,
        (decodedText) => handleDecodedQr(decodedText),
        () => {} // abaikan scan error di setiap frame
      )

      setScannerInitialized(true)
      setCameraError(null)
    } catch (err) {
      console.error('Failed to start camera:', err)
      setCameraError('Gagal menyalakan kamera. Pastikan izin kamera telah diberikan di browser/aplikasi.')
    }
  }

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop()
        }
        html5QrCodeRef.current.clear()
      } catch (e) {
        console.warn('Error stopping scanner:', e)
      }
      html5QrCodeRef.current = null
      setScannerInitialized(false)
    }
  }

  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1) return
    const nextIndex = (currentCameraIndex + 1) % availableCameras.length
    setCurrentCameraIndex(nextIndex)
    await startCamera(availableCameras[nextIndex].id)
  }

  // Parsing dan pemrosesan kode QR yang terbaca
  const handleDecodedQr = async (decodedText) => {
    if (!decodedText) return
    const raw = String(decodedText).trim()

    // Ekstraksi ID atau NISN dari beragam format yang mungkin dicetak pada kartu
    let parsedStudentId = ''
    let parsedNisn = ''
    let parsedName = ''

    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const obj = JSON.parse(raw)
        parsedStudentId = obj.id || obj.student_id || ''
        parsedNisn = obj.nisn || ''
        parsedName = obj.name || obj.nama || ''
      } catch (e) {}
    } else if (raw.startsWith('SISWA:')) {
      parsedStudentId = raw.replace('SISWA:', '').trim()
    } else if (raw.startsWith('NISN:')) {
      parsedNisn = raw.replace('NISN:', '').trim()
    } else if (raw.startsWith('PANRITA:')) {
      const parts = raw.split(':')
      if (parts.length >= 3) {
        parsedStudentId = parts[2]
      } else {
        parsedStudentId = parts[1]
      }
    } else {
      // Asumsikan plain ID atau NISN
      parsedStudentId = raw
      parsedNisn = raw
    }

    // Cari siswa yang cocok di daftar kelas saat ini
    let matchedStudent = students.find(s => {
      if (parsedStudentId && String(s.id).toLowerCase() === String(parsedStudentId).toLowerCase()) return true
      if (parsedNisn && String(s.nisn).trim() === String(parsedNisn).trim()) return true
      if (parsedName && s.name && s.name.toLowerCase() === parsedName.toLowerCase()) return true
      return false
    })

    // Debounce scan berulang (hindari scan terus-menerus dalam 4 detik untuk murid yang sama)
    const now = Date.now()
    const targetKey = matchedStudent ? matchedStudent.id : raw
    if (lastScanTimeRef.current[targetKey] && now - lastScanTimeRef.current[targetKey] < 3500) {
      return
    }
    lastScanTimeRef.current[targetKey] = now

    if (matchedStudent) {
      await recordStudentAttendance(matchedStudent, 'Hadir via Scan QR')
    } else {
      // Coba cari di database jika murid mungkin terdaftar di kelas lain
      searchInOtherClasses(parsedStudentId, parsedNisn, parsedName)
    }
  }

  const searchInOtherClasses = async (id, nisn, name) => {
    if (!supabase) return
    try {
      let query = supabase.from('students').select('*, kelas(name)')
      if (id && id.length > 10) {
        query = query.eq('id', id)
      } else if (nisn) {
        query = query.eq('nisn', nisn)
      } else if (name) {
        query = query.ilike('name', `%${name}%`)
      } else {
        return
      }

      const { data, error } = await query.limit(1)
      if (!error && data && data.length > 0) {
        const otherStudent = data[0]
        const otherClassName = otherStudent.kelas?.name || 'Kelas Lain'
        if (soundEnabled) playBeep('warning')
        setLastScannedStudent({
          student: otherStudent,
          status: 'different_class',
          message: `${otherStudent.name} terdaftar di ${otherClassName} (bukan ${classNameStr}). Tetap hadirkan?`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      } else {
        if (soundEnabled) playBeep('warning')
        setLastScannedStudent({
          status: 'not_found',
          message: 'Data siswa tidak ditemukan di sistem sekolah.',
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      }
    } catch (e) {
      console.warn('Error cross-class lookup:', e)
    }
  }

  // Simpan kehadiran murid ke database
  const recordStudentAttendance = async (student, note = 'Presensi Scan QR') => {
    setSavingId(student.id)
    const isAlreadyPresent = (attendanceMap[student.id] || 'hadir') === 'hadir' && attendanceMap[student.id] !== undefined
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

    try {
      if (supabase) {
        const payload = {
          student_id: student.id,
          class_id: student.class_id || activeClassId,
          tanggal: selectedDate,
          status: 'hadir',
          teacher_id: user?.id,
          keterangan: note
        }

        const { error } = await supabase
          .from('student_attendance')
          .upsert(payload, { onConflict: 'student_id,tanggal' })

        if (error) throw error
      }

      // Notifikasi Suara & Getar
      if (soundEnabled) playBeep('success')
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 40, 80])
      }

      // Update parent state
      if (onAttendanceUpdated) {
        onAttendanceUpdated(student.id, 'hadir', student)
      }

      const scanResult = {
        student,
        status: isAlreadyPresent ? 'already_present' : 'success',
        time: timeStr,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        message: isAlreadyPresent
          ? `${student.name} telah tercatat Hadir sebelumnya.`
          : `Presensi Hadir berhasil dicatat!`
      }

      setLastScannedStudent(scanResult)

      setRecentScans(prev => {
        const filtered = prev.filter(item => item.student.id !== student.id)
        return [scanResult, ...filtered].slice(0, 5)
      })
    } catch (err) {
      console.error('Failed to save student attendance:', err)
      if (soundEnabled) playBeep('warning')
      setLastScannedStudent({
        student,
        status: 'error',
        message: 'Gagal menyimpan ke server: ' + err.message
      })
    } finally {
      setSavingId(null)
    }
  }

  if (!isOpen) return null

  // Filter siswa manual
  const manualFiltered = students.filter(s => 
    manualQuery.trim() && (
      s.name?.toLowerCase().includes(manualQuery.toLowerCase()) ||
      (s.nisn && s.nisn.includes(manualQuery))
    )
  ).slice(0, 4)

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#0F172A',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '460px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
        color: '#FFFFFF'
      }}>
        {/* Header Modal */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
            }}>
              <Camera size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Scan QR Kehadiran
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', fontWeight: 700 }}>
                  Live
                </span>
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                {classNameStr} • {selectedDate}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Toggle Suara */}
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Matikan Suara Beep' : 'Nyalakan Suara Beep'}
              style={{
                background: soundEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: soundEnabled ? '#34D399' : '#94A3B8',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Tombol Tutup */}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#CBD5E1',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Info Kehadiran Saat Ini */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 1.25rem',
          background: 'rgba(0, 0, 0, 0.25)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          fontSize: '0.78rem'
        }}>
          <span style={{ color: '#94A3B8' }}>
            Kehadiran Kelas: <strong style={{ color: '#34D399' }}>{presentCount}</strong> dari {totalStudents} Siswa
          </span>
          <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Zap size={13} color="#FBBF24" /> Auto-Save
          </span>
        </div>

        {/* Body Konten */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {/* Kamera Viewport Container */}
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1',
            maxHeight: '290px',
            borderRadius: '20px',
            overflow: 'hidden',
            background: '#020617',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            boxShadow: 'inset 0 0 25px rgba(0, 0, 0, 0.8), 0 0 20px rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.85rem'
          }}>
            {/* Target ID untuk Html5Qrcode */}
            <div id={containerId} style={{ width: '100%', height: '100%' }}></div>

            {/* Error Kamera */}
            {cameraError && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#EF4444'
              }}>
                <AlertCircle size={36} style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.82rem', margin: 0, color: '#FCA5A5', lineHeight: '1.4' }}>
                  {cameraError}
                </p>
                <button
                  type="button"
                  onClick={() => startCamera(availableCameras[0]?.id)}
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.5rem 1rem',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid #EF4444',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Coba Akses Lagi
                </button>
              </div>
            )}

            {/* Tombol Ganti Kamera (Depan / Belakang) */}
            {availableCameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                title="Ganti Kamera Depan/Belakang"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  padding: '6px 10px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                  zIndex: 20
                }}
              >
                <RefreshCw size={13} />
                <span>Ganti Kamera</span>
              </button>
            )}

            {/* Laser Scanning Animation Overlay */}
            {scannerInitialized && !cameraError && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '72%',
                  height: '72%',
                  border: '2px dashed rgba(52, 211, 153, 0.6)',
                  borderRadius: '16px',
                  position: 'relative',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #10B981, transparent)',
                    boxShadow: '0 0 8px #10B981',
                    animation: 'scanLaser 2s infinite ease-in-out'
                  }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Notifikasi Hasil Scan Terakhir */}
          {lastScannedStudent && (
            <div style={{
              background: lastScannedStudent.status === 'success'
                ? 'rgba(16, 185, 129, 0.15)'
                : lastScannedStudent.status === 'already_present'
                ? 'rgba(59, 130, 246, 0.15)'
                : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${
                lastScannedStudent.status === 'success'
                  ? '#10B981'
                  : lastScannedStudent.status === 'already_present'
                  ? '#3B82F6'
                  : '#F59E0B'
              }`,
              borderRadius: '16px',
              padding: '0.85rem 1rem',
              marginBottom: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: lastScannedStudent.status === 'success'
                    ? '#10B981'
                    : lastScannedStudent.status === 'already_present'
                    ? '#3B82F6'
                    : '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  flexShrink: 0
                }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>
                    {lastScannedStudent.student?.name || 'Siswa Terdeteksi'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#CBD5E1' }}>
                    {lastScannedStudent.message}
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700 }}>
                {lastScannedStudent.timestamp}
              </span>
            </div>
          )}

          {/* Fallback Input Manual (Jika kartu basah / lupa bawa) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '0.75rem',
            marginBottom: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.4rem' }}>
              <Search size={14} color="#94A3B8" />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
                Atau Cari Manual Siswa (Lupa Kartu)
              </span>
            </div>
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Ketik nama atau NISN siswa..."
              style={{
                width: '100%',
                padding: '0.55rem 0.85rem',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />

            {/* Hasil Pencarian Cepat */}
            {manualFiltered.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {manualFiltered.map(st => {
                  const isHadir = (attendanceMap[st.id] || 'hadir') === 'hadir' && attendanceMap[st.id] !== undefined
                  return (
                    <div
                      key={st.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.6rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '8px',
                        fontSize: '0.78rem'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{st.name}</span>
                        {st.nisn && <span style={{ color: '#94A3B8', marginLeft: '6px', fontSize: '0.7rem' }}>({st.nisn})</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => recordStudentAttendance(st, 'Hadir via Input Manual')}
                        disabled={savingId === st.id}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isHadir ? 'rgba(16, 185, 129, 0.2)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                          border: isHadir ? '1px solid #10B981' : 'none',
                          color: isHadir ? '#34D399' : '#FFFFFF',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {isHadir ? '✓ Hadir' : '+ Hadirkan'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Daftar Riwayat Scan Sesi Ini */}
          {recentScans.length > 0 && (
            <div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', display: 'block', marginBottom: '0.4rem' }}>
                Baru Saja Di-Scan:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentScans.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '10px',
                      fontSize: '0.78rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }}></span>
                      <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{item.student.name}</span>
                    </div>
                    <span style={{ color: '#64748B', fontSize: '0.7rem' }}>{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div style={{
          padding: '0.85rem 1.25rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
            Arahkan kamera ke QR Code kartu murid
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Selesai
          </button>
        </div>
      </div>

      {/* Style laser animation */}
      <style>{`
        @keyframes scanLaser {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 1; }
          100% { top: 0%; opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
