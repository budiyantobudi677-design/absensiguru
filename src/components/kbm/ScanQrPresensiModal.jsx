import React, { useState, useEffect, useRef } from 'react'
import jsQR from 'jsqr'
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
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'environment' (belakang) | 'user' (depan/selfie)
  const [cameraError, setCameraError] = useState(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [lastScannedStudent, setLastScannedStudent] = useState(null)
  const [recentScans, setRecentScans] = useState([])
  const [manualQuery, setManualQuery] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const animFrameIdRef = useRef(null)
  const barcodeDetectorRef = useRef(null)
  const isScanningRef = useRef(false)
  const lastScanTimeRef = useRef({})

  const currentClass = classes.find(c => String(c.id) === String(activeClassId))
  const classNameStr = currentClass?.name || 'Kelas'

  // Hitung hadir
  const totalStudents = students.length
  const presentCount = students.filter(s => (attendanceMap[s.id] || 'hadir') === 'hadir').length

  // Inisialisasi BarcodeDetector jika browser mendukung (hardware-accelerated di Chrome & Android)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] })
      } catch (e) {
        barcodeDetectorRef.current = null
      }
    }
  }, [])

  // Fungsi menyalakan kamera
  const startCamera = async (targetFacing = facingMode) => {
    setCameraError(null)
    setIsCameraActive(false)

    // Hentikan stream sebelumnya jika ada
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }

    try {
      let mediaStream = null

      // Strategi 1: Ideal facingMode dengan resolusi proporsional
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        })
      } catch (e1) {
        // Strategi 2: Fallback exact facingMode
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: targetFacing },
            audio: false
          })
        } catch (e2) {
          // Strategi 3: Fallback ke kamera default apapun yang tersedia di perangkat
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          })
        }
      }

      if (!mediaStream) {
        throw new Error('Tidak dapat memperoleh stream video dari kamera.')
      }

      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        videoRef.current.setAttribute('playsinline', 'true')
        await videoRef.current.play()
      }
      setIsCameraActive(true)
      isScanningRef.current = true
    } catch (err) {
      console.error('Camera access failed:', err)
      let msg = 'Kamera tidak dapat diakses.'
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera ditolak. Harap izinkan akses kamera di pengaturan browser/HP Anda.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Tidak ada perangkat kamera yang terdeteksi pada perangkat ini.'
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi kamera lain lalu coba lagi.'
      } else {
        msg = err.message || 'Gagal memulai kamera.'
      }
      setCameraError(msg)
      setIsCameraActive(false)
    }
  }

  // Fungsi mematikan kamera
  const stopCamera = () => {
    isScanningRef.current = false
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current)
      animFrameIdRef.current = null
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }

  // Beralih antara Kamera Depan & Kamera Belakang
  const handleSwitchCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    await startCamera(nextMode)
  }

  // Mengatur lifecycle modal
  useEffect(() => {
    if (isOpen) {
      setLastScannedStudent(null)
      startCamera(facingMode)
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [isOpen])

  // Continuous Scan Loop
  useEffect(() => {
    if (!isCameraActive || !isOpen) return

    let lastScanCheck = 0

    const scanFrame = async (timestamp) => {
      if (!isScanningRef.current) return

      // Batasi pemindaian setiap ~130ms agar tidak membebani CPU
      if (timestamp - lastScanCheck > 130) {
        lastScanCheck = timestamp

        const video = videoRef.current
        if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          let decodedString = null

          // Engine 1: Native BarcodeDetector (Super Cepat)
          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(video)
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                decodedString = barcodes[0].rawValue
              }
            } catch (e) {
              // Jika BarcodeDetector gagal pada frame tertentu, fallback ke Engine 2
            }
          }

          // Engine 2: Fallback jsQR (100% JavaScript Kompatibel di Semua Browser & HP)
          if (!decodedString) {
            try {
              let canvas = canvasRef.current
              if (!canvas) {
                canvas = document.createElement('canvas')
                canvasRef.current = canvas
              }
              const w = Math.min(video.videoWidth, 640)
              const h = Math.min(video.videoHeight, 480)
              canvas.width = w
              canvas.height = h

              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              if (ctx) {
                ctx.drawImage(video, 0, 0, w, h)
                const imageData = ctx.getImageData(0, 0, w, h)
                const qrCode = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
                if (qrCode && qrCode.data) {
                  decodedString = qrCode.data
                }
              }
            } catch (e) {
              console.warn('jsQR frame scan error:', e)
            }
          }

          if (decodedString) {
            handleDecodedQr(decodedString)
          }
        }
      }

      if (isScanningRef.current) {
        animFrameIdRef.current = requestAnimationFrame(scanFrame)
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanFrame)

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
      }
    }
  }, [isCameraActive, isOpen, students, activeClassId, selectedDate, attendanceMap])

  // Parsing dan pemrosesan kode QR yang terbaca
  const handleDecodedQr = async (decodedText) => {
    if (!decodedText) return
    const raw = String(decodedText).trim()

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
      parsedStudentId = raw
      parsedNisn = raw
    }

    // Cari siswa yang cocok di daftar kelas saat ini
    let matchedStudent = students.find(s => {
      if (parsedStudentId && String(s.id).toLowerCase() === String(parsedStudentId).toLowerCase()) return true
      if (parsedNisn && s.nisn && String(s.nisn).trim() === String(parsedNisn).trim()) return true
      if (parsedName && s.name && s.name.toLowerCase() === parsedName.toLowerCase()) return true
      return false
    })

    // Debounce scan berulang (hindari scan terus-menerus dalam 3.5 detik untuk murid yang sama)
    const now = Date.now()
    const targetKey = matchedStudent ? matchedStudent.id : raw
    if (lastScanTimeRef.current[targetKey] && now - lastScanTimeRef.current[targetKey] < 3500) {
      return
    }
    lastScanTimeRef.current[targetKey] = now

    if (matchedStudent) {
      await recordStudentAttendance(matchedStudent, 'Hadir via Scan QR')
    } else {
      // Coba cari di database jika murid mungkin terdaftar di rombel kelas lain
      searchInOtherClasses(parsedStudentId, parsedNisn, parsedName)
    }
  }

  const searchInOtherClasses = async (id, nisn, name) => {
    if (!supabase) return
    try {
      let query = supabase.from('students').select('*')
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
        const otherClassObj = classes.find(c => String(c.id) === String(otherStudent.class_id))
        const otherClassName = otherClassObj?.name || 'Kelas Lain'
        if (soundEnabled) playBeep('warning')
        setLastScannedStudent({
          student: otherStudent,
          status: 'different_class',
          message: `${otherStudent.name} terdaftar di ${otherClassName} (bukan ${classNameStr}).`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        })
      } else {
        if (soundEnabled) playBeep('warning')
        setLastScannedStudent({
          status: 'not_found',
          message: 'Data siswa tidak terdaftar di sistem sekolah.',
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
            height: '270px',
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
            {/* Video Element Langsung */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />

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
                  onClick={() => startCamera(facingMode)}
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
                  Coba Nyalakan Lagi
                </button>
              </div>
            )}

            {/* Tombol Ganti Kamera (Depan / Belakang) */}
            {isCameraActive && (
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
            {isCameraActive && !cameraError && (
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
                  width: '68%',
                  height: '68%',
                  border: '2px dashed rgba(52, 211, 153, 0.8)',
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
                    boxShadow: '0 0 10px #10B981',
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
