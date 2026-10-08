import { useState, useRef, useEffect } from 'react'
import { Camera, X, RefreshCw, Download, Share2, MapPin, Calendar, Clock, User } from 'lucide-react'

export default function CameraTimemarkModal({ isOpen, onClose, profile, user, schoolName = 'Presensia' }) {
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' (selfie) or 'environment' (belakang)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [customNote, setCustomNote] = useState('')
  const [locationText, setLocationText] = useState('Mencari lokasi GPS...')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [cameraError, setCameraError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const videoRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setCapturedPhoto(null)
      return
    }

    startCamera(facingMode)
    fetchLocation()
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000)

    return () => {
      clearInterval(timer)
      stopCamera()
    }
  }, [isOpen, facingMode])

  const fetchAddressName = async (latitude, longitude) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=id`,
        { headers: { 'User-Agent': 'PresensiaAbsensiApp/1.0' } }
      )
      if (!response.ok) throw new Error('Network error')
      const data = await response.json()
      if (data && data.address) {
        const addr = data.address
        const road = addr.road || addr.pedestrian || addr.suburb || ''
        const district = addr.city_district || addr.subdistrict || addr.county || ''
        const city = addr.city || addr.town || addr.municipality || ''
        
        const parts = [road, district, city].filter(Boolean)
        if (parts.length > 0) {
          return parts.join(', ')
        } else if (data.display_name) {
          return data.display_name.split(',').slice(0, 3).join(',')
        }
      }
    } catch (e) {
      console.warn('Reverse geocoding failed, fallback to lat/long:', e)
    }
    return `Lat: ${latitude.toFixed(5)}, Long: ${longitude.toFixed(5)}`
  }

  const fetchLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setLocationText('Mendeteksi nama lokasi...')
          const address = await fetchAddressName(lat, lng)
          setLocationText(address)
        },
        () => {
          setLocationText('GPS tidak aktif / Izin lokasi ditolak')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setLocationText('Perangkat tidak mendukung geolokasi')
    }
  }

  const startCamera = async (mode) => {
    setCameraError('')
    stopCamera()
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (err) {
      console.error(err)
      setCameraError('Gagal mengakses kamera. Mohon izinkan akses kamera di browser Anda.')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
  }

  const toggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    setIsProcessing(true)

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // Jika kamera depan (user), mirror hasil jepretan agar natural
    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, width, height)
      ctx.setTransform(1, 0, 0, 1, 0, 0) // reset transform
    } else {
      ctx.drawImage(video, 0, 0, width, height)
    }

    // Overlay Watermark / Timemark
    const overlayHeight = Math.max(120, height * 0.22)
    const overlayY = height - overlayHeight

    // Background gradient gelap di bagian bawah
    const gradient = ctx.createLinearGradient(0, overlayY - 30, 0, height)
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0)')
    gradient.addColorStop(0.3, 'rgba(15, 23, 42, 0.85)')
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, overlayY - 30, width, overlayHeight + 30)

    // Border aksen di kiri atas watermark
    ctx.fillStyle = '#10B981'
    ctx.fillRect(20, overlayY + 10, 6, overlayHeight - 30)

    // Format Text
    const teacherName = profile?.full_name || user?.email?.split('@')[0] || 'Guru'
    const nipText = profile?.nip ? ` • NIP: ${profile.nip}` : ''
    const dateFormatted = currentDateTime.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    const timeFormatted = currentDateTime.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + ' WIB'

    ctx.fillStyle = '#FFFFFF'
    ctx.textBaseline = 'top'

    // Baris 1: Nama Sekolah / Brand
    ctx.font = 'bold 22px Outfit, sans-serif'
    ctx.fillStyle = '#38BDF8'
    ctx.fillText(schoolName.toUpperCase(), 36, overlayY + 12)

    // Baris 2: Nama Guru & NIP
    ctx.font = 'bold 20px Outfit, sans-serif'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(`${teacherName}${nipText}`, 36, overlayY + 40)

    // Baris 3: Tanggal & Waktu
    ctx.font = '16px Outfit, sans-serif'
    ctx.fillStyle = '#E2E8F0'
    ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, 36, overlayY + 68)

    // Baris 4: Lokasi GPS
    ctx.font = '15px Outfit, sans-serif'
    ctx.fillStyle = '#94A3B8'
    ctx.fillText(`📍 ${locationText}`, 36, overlayY + 92)

    // Baris 5: Catatan kegiatan jika ada
    if (customNote.trim()) {
      ctx.font = 'italic 16px Outfit, sans-serif'
      ctx.fillStyle = '#FBBF24'
      ctx.fillText(`📝 Kegiatan: ${customNote.trim()}`, 36, overlayY + 116)
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setCapturedPhoto(dataUrl)
    setIsProcessing(false)
  }

  const downloadPhoto = () => {
    if (!capturedPhoto) return
    const link = document.createElement('a')
    link.href = capturedPhoto
    link.download = `Dokumentasi_Timemark_${Date.now()}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const sharePhoto = async () => {
    if (!capturedPhoto) return
    try {
      const res = await fetch(capturedPhoto)
      const blob = await res.blob()
      const file = new File([blob], `Timemark_${Date.now()}.jpg`, { type: 'image/jpeg' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Dokumentasi Presensia',
          text: `Dokumentasi Kegiatan Guru: ${profile?.full_name || 'Guru'} - ${schoolName}`
        })
      } else {
        downloadPhoto()
      }
    } catch (err) {
      console.error(err)
      downloadPhoto()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: '#0F172A',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem',
        boxSizing: 'border-box'
      }}
    >
      {/* Top Header */}
      <div style={{ width: '100%', maxWidth: '480px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
          <Camera size={22} color="#38BDF8" />
          <span style={{ fontWeight: '600', fontSize: '1rem' }}>Kamera Timemark</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: 'white',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Camera Viewfinder / Preview */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#000',
          margin: '0.75rem 0',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {cameraError ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#F87171' }}>
            <p>{cameraError}</p>
            <button onClick={() => startCamera(facingMode)} className="btn btn-primary" style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', fontSize: '0.85rem' }}>
              Coba Lagi
            </button>
          </div>
        ) : capturedPhoto ? (
          <img src={capturedPhoto} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
              }}
            />
            {/* Live Watermark Preview Pill */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(8px)',
                padding: '0.6rem 0.8rem',
                borderRadius: '12px',
                color: 'white',
                fontSize: '0.75rem',
                borderLeft: '4px solid #10B981',
                pointerEvents: 'none'
              }}
            >
              <div style={{ fontWeight: 'bold', color: '#38BDF8' }}>{schoolName}</div>
              <div>{profile?.full_name || 'Guru'} • {currentDateTime.toLocaleTimeString('id-ID')}</div>
              <div style={{ color: '#94A3B8', fontSize: '0.7rem' }}>📍 {locationText}</div>
            </div>
          </>
        )}
      </div>

      {/* Controls & Inputs */}
      <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!capturedPhoto ? (
          <>
            <input
              type="text"
              placeholder="Catatan Kegiatan (Contoh: Mengajar Kelas X-A)..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 1rem',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '0.5rem 0' }}>
              <button
                onClick={toggleCamera}
                title="Tukar Kamera"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '50%',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={22} />
              </button>

              <button
                onClick={capturePhoto}
                disabled={isProcessing}
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  border: '4px solid white',
                  background: '#EF4444',
                  boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
                  cursor: 'pointer'
                }}
              />

              <div style={{ width: '48px' }}></div>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            <button
              onClick={() => {
                setCapturedPhoto(null)
                startCamera(facingMode)
              }}
              className="btn"
              style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: '0.8rem', padding: '0.65rem 0.5rem' }}
            >
              <RefreshCw size={14} /> Ulangi
            </button>
            <button
              onClick={downloadPhoto}
              className="btn"
              style={{ background: '#10B981', color: 'white', fontSize: '0.8rem', padding: '0.65rem 0.5rem' }}
            >
              <Download size={14} /> Simpan
            </button>
            <button
              onClick={sharePhoto}
              className="btn"
              style={{ background: '#38BDF8', color: 'white', fontSize: '0.8rem', padding: '0.65rem 0.5rem' }}
            >
              <Share2 size={14} /> Bagikan
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
