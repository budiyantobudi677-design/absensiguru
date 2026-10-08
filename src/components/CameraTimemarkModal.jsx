import { useState, useRef, useEffect } from 'react'
import { Camera, X, RefreshCw, Download, Share2, MapPin, Calendar, Clock, User, Settings, CheckSquare, Square } from 'lucide-react'

export default function CameraTimemarkModal({ isOpen, onClose, profile, user, schoolName = 'Presensia' }) {
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' (selfie) or 'environment' (belakang)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [customNote, setCustomNote] = useState('')
  const [locationText, setLocationText] = useState('Mencari lokasi GPS...')
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [cameraError, setCameraError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Judul paling atas kustom yang tersimpan di localStorage
  const [customTitle, setCustomTitle] = useState(() => {
    return localStorage.getItem('timemark_custom_title') || schoolName || 'Presensia'
  })
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  // Pengaturan tampilkan/sembunyikan nama guru
  const [showTeacherName, setShowTeacherName] = useState(() => {
    const saved = localStorage.getItem('timemark_show_teacher_name')
    return saved !== null ? saved === 'true' : true
  })

  // Pengaturan Template Layout Watermark ('modern' | 'card' | 'classic')
  const [layoutTemplate, setLayoutTemplate] = useState(() => {
    return localStorage.getItem('timemark_layout_template') || 'modern'
  })

  // Pengaturan Rasio Aspek Foto ('3:4' | '1:1' | '16:9')
  const [aspectRatio, setAspectRatio] = useState(() => {
    return localStorage.getItem('timemark_aspect_ratio') || '3:4'
  })

  // Deteksi Zona Waktu Indonesia Otomatis (WIB / WITA / WIT)
  const getTimeZoneLabel = () => {
    const offset = -new Date().getTimezoneOffset() / 60
    if (offset >= 8.5) return 'WIT'
    if (offset >= 7.5) return 'WITA'
    return 'WIB'
  }

  const handleTitleChange = (newVal) => {
    setCustomTitle(newVal)
    localStorage.setItem('timemark_custom_title', newVal)
  }

  const handleToggleTeacherName = () => {
    const nextVal = !showTeacherName
    setShowTeacherName(nextVal)
    localStorage.setItem('timemark_show_teacher_name', nextVal.toString())
  }

  const handleLayoutChange = (tpl) => {
    setLayoutTemplate(tpl)
    localStorage.setItem('timemark_layout_template', tpl)
  }

  const handleAspectRatioChange = (ratio) => {
    setAspectRatio(ratio)
    localStorage.setItem('timemark_aspect_ratio', ratio)
  }

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

    // 1. Calculate Target Dimensions Based on Aspect Ratio
    let targetWidth = video.videoWidth || 1280
    let targetHeight = video.videoHeight || 720
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = targetWidth
    let sourceHeight = targetHeight

    if (aspectRatio === '1:1') {
      const minDim = Math.min(targetWidth, targetHeight)
      sourceX = (targetWidth - minDim) / 2
      sourceY = (targetHeight - minDim) / 2
      sourceWidth = minDim
      sourceHeight = minDim
      targetWidth = 1080
      targetHeight = 1080
    } else if (aspectRatio === '3:4') {
      // Potret 3:4
      if (targetWidth > targetHeight) {
        // Source is landscape, crop to 3:4 portrait
        const calcWidth = Math.round((targetHeight * 3) / 4)
        sourceX = Math.round((targetWidth - calcWidth) / 2)
        sourceWidth = calcWidth
        targetWidth = 900
        targetHeight = 1200
      }
    } else if (aspectRatio === '16:9') {
      // Widescreen 16:9
      const calcHeight = Math.round((targetWidth * 9) / 16)
      if (calcHeight <= targetHeight) {
        sourceY = Math.round((targetHeight - calcHeight) / 2)
        sourceHeight = calcHeight
      }
      targetWidth = 1280
      targetHeight = 720
    }

    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')

    // Draw video frame to canvas with aspect ratio cropping
    if (facingMode === 'user') {
      ctx.translate(targetWidth, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    } else {
      ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
    }

    // Format Text
    const teacherName = profile?.full_name || user?.email?.split('@')[0] || 'Guru'
    const nipText = profile?.nip ? ` • NIP: ${profile.nip}` : ''
    const dateFormatted = currentDateTime.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    const tzLabel = getTimeZoneLabel()
    const timeFormatted = `${currentDateTime.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })} ${tzLabel}`
    const displayTitle = (customTitle || schoolName || 'PRESENSIA').toUpperCase()

    // 2. Render Watermark Based on layoutTemplate ('modern' | 'card' | 'classic')
    if (layoutTemplate === 'card') {
      // TEMA BADGE / KARTU (Box mengambang di pojok kanan bawah)
      const boxWidth = Math.min(targetWidth - 40, 480)
      const boxHeight = showTeacherName ? 150 : 125
      const boxX = targetWidth - boxWidth - 20
      const boxY = targetHeight - boxHeight - 20

      // Rounded rectangle background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16)
      ctx.fill()
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
      ctx.lineWidth = 2
      ctx.stroke()

      // Header aksen baris
      ctx.fillStyle = '#10B981'
      ctx.fillRect(boxX, boxY + 12, 5, boxHeight - 24)

      let curY = boxY + 14
      ctx.textBaseline = 'top'

      ctx.font = 'bold 20px Outfit, sans-serif'
      ctx.fillStyle = '#38BDF8'
      ctx.fillText(displayTitle, boxX + 18, curY)
      curY += 26

      if (showTeacherName) {
        ctx.font = 'bold 17px Outfit, sans-serif'
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`${teacherName}${nipText}`, boxX + 18, curY)
        curY += 24
      }

      ctx.font = '15px Outfit, sans-serif'
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, boxX + 18, curY)
      curY += 22

      ctx.font = '14px Outfit, sans-serif'
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`📍 ${locationText}`, boxX + 18, curY)
      curY += 22

      if (customNote.trim()) {
        ctx.font = 'italic 14px Outfit, sans-serif'
        ctx.fillStyle = '#FBBF24'
        ctx.fillText(`📝 ${customNote.trim()}`, boxX + 18, curY)
      }
    } else if (layoutTemplate === 'classic') {
      // TEMA KLASIK (Tanpa kotak hitam pekat, teks dengan shadow di kiri bawah)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      let curY = targetHeight - (showTeacherName ? 145 : 120)
      ctx.textBaseline = 'top'

      ctx.font = 'bold 22px Outfit, sans-serif'
      ctx.fillStyle = '#FDE047'
      ctx.fillText(displayTitle, 28, curY)
      curY += 28

      if (showTeacherName) {
        ctx.font = 'bold 19px Outfit, sans-serif'
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`${teacherName}${nipText}`, 28, curY)
        curY += 26
      }

      ctx.font = '17px Outfit, sans-serif'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, 28, curY)
      curY += 24

      ctx.font = '15px Outfit, sans-serif'
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📍 ${locationText}`, 28, curY)
      curY += 24

      if (customNote.trim()) {
        ctx.font = 'italic 16px Outfit, sans-serif'
        ctx.fillStyle = '#38BDF8'
        ctx.fillText(`📝 ${customNote.trim()}`, 28, curY)
      }

      // Reset shadow
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      // TEMA MODERN (Gradien gelap di bawah)
      const overlayHeight = Math.max(130, targetHeight * 0.22)
      const overlayY = targetHeight - overlayHeight

      const gradient = ctx.createLinearGradient(0, overlayY - 30, 0, targetHeight)
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0)')
      gradient.addColorStop(0.3, 'rgba(15, 23, 42, 0.85)')
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.95)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, overlayY - 30, targetWidth, overlayHeight + 30)

      ctx.fillStyle = '#10B981'
      ctx.fillRect(20, overlayY + 10, 6, overlayHeight - 30)

      let currentY = overlayY + 12
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'top'

      ctx.font = 'bold 22px Outfit, sans-serif'
      ctx.fillStyle = '#38BDF8'
      ctx.fillText(displayTitle, 36, currentY)
      currentY += 28

      if (showTeacherName) {
        ctx.font = 'bold 20px Outfit, sans-serif'
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`${teacherName}${nipText}`, 36, currentY)
        currentY += 28
      }

      ctx.font = '16px Outfit, sans-serif'
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, 36, currentY)
      currentY += 24

      ctx.font = '15px Outfit, sans-serif'
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`📍 ${locationText}`, 36, currentY)
      currentY += 24

      if (customNote.trim()) {
        ctx.font = 'italic 16px Outfit, sans-serif'
        ctx.fillStyle = '#FBBF24'
        ctx.fillText(`📝 Kegiatan: ${customNote.trim()}`, 36, currentY)
      }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setIsEditingTitle(!isEditingTitle)}
            title="Pengaturan Watermark"
            style={{
              background: isEditingTitle ? '#38BDF8' : 'rgba(255,255,255,0.15)',
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
            <Settings size={18} />
          </button>
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
      </div>

      {/* Settings Panel Drawer */}
      {isEditingTitle && (
        <div
          style={{
            width: '100%',
            maxWidth: '480px',
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '16px',
            padding: '1rem',
            boxSizing: 'border-box',
            marginTop: '0.5rem',
            color: 'white',
            zIndex: 20
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.3rem' }}>
              Judul Timemark Paling Atas (Tersimpan otomatis)
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Contoh: SMKN 1 MAKASSAR / PRESENSIA"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #475569',
                background: '#0F172A',
                color: 'white',
                fontSize: '0.85rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div
            onClick={handleToggleTeacherName}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
              borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>Tampilkan Nama Guru di Foto</span>
            {showTeacherName ? (
              <CheckSquare size={20} color="#10B981" />
            ) : (
              <Square size={20} color="#94A3B8" />
            )}
          </div>

          {/* Rasio Foto (3:4, 1:1, 16:9) */}
          <div style={{ marginTop: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              📐 Rasio Foto (Ukuran Bingkai)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: '3:4', label: '3:4 (Standar)' },
                { id: '1:1', label: '1:1 (Persegi)' },
                { id: '16:9', label: '16:9 (Lebar)' }
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleAspectRatioChange(r.id)}
                  style={{
                    padding: '0.45rem 0.2rem',
                    borderRadius: '8px',
                    border: aspectRatio === r.id ? '1px solid #38BDF8' : '1px solid #475569',
                    background: aspectRatio === r.id ? '#0284C7' : '#0F172A',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: aspectRatio === r.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template Layout Watermark (Modern, Card, Classic) */}
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              🎨 Desain Watermark (Tema Cetak)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[
                { id: 'modern', label: 'Modern' },
                { id: 'card', label: 'Badge Card' },
                { id: 'classic', label: 'Klasik' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleLayoutChange(t.id)}
                  style={{
                    padding: '0.45rem 0.2rem',
                    borderRadius: '8px',
                    border: layoutTemplate === t.id ? '1px solid #10B981' : '1px solid #475569',
                    background: layoutTemplate === t.id ? '#059669' : '#0F172A',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: layoutTemplate === t.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Camera Viewfinder / Preview */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '480px',
          aspectRatio: aspectRatio === '1:1' ? '1 / 1' : aspectRatio === '16:9' ? '16 / 9' : '3 / 4',
          maxHeight: '58vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '24px',
          overflow: 'hidden',
          background: '#000',
          margin: '0.5rem 0',
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

            {/* Live Watermark Preview Pill disesuaikan dengan template */}
            {layoutTemplate === 'card' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  maxWidth: '75%',
                  background: 'rgba(15, 23, 42, 0.90)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderLeft: '4px solid #10B981',
                  borderRadius: '12px',
                  padding: '0.5rem 0.75rem',
                  color: 'white',
                  fontSize: '0.72rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#38BDF8' }}>
                  {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div>{profile?.full_name || 'Guru'}</div>}
                <div style={{ color: '#E2E8F0', fontSize: '0.68rem' }}>
                  {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>📍 {locationText}</div>
              </div>
            ) : layoutTemplate === 'classic' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                  color: 'white',
                  fontSize: '0.72rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#FDE047', fontSize: '0.8rem' }}>
                  {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div style={{ fontWeight: '600' }}>{profile?.full_name || 'Guru'}</div>}
                <div>{currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}</div>
                <div style={{ color: '#E2E8F0', fontSize: '0.68rem' }}>📍 {locationText}</div>
              </div>
            ) : (
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
                  fontSize: '0.72rem',
                  borderLeft: '4px solid #10B981',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#38BDF8' }}>
                  {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div>{profile?.full_name || 'Guru'}</div>}
                <div style={{ color: '#E2E8F0' }}>
                  {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>📍 {locationText}</div>
              </div>
            )}
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
