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

  // Pengaturan Template Layout Watermark ('modern' | 'card' | 'academic' | 'stamp' | 'idbadge' | 'classic')
  const [layoutTemplate, setLayoutTemplate] = useState(() => {
    return localStorage.getItem('timemark_layout_template') || 'modern'
  })

  // Pengaturan Rasio Aspek Foto ('3:4' | '9:16' | '1:1' | '16:9')
  const [aspectRatio, setAspectRatio] = useState(() => {
    return localStorage.getItem('timemark_aspect_ratio') || '3:4'
  })

  // Pengaturan Ukuran Teks / Skala Watermark ('small' | 'normal' | 'large' | 'xlarge')
  const [watermarkScale, setWatermarkScale] = useState(() => {
    return localStorage.getItem('timemark_watermark_scale') || 'normal'
  })

  // Pengaturan Pilihan Ikon Utama (🎓, 🏫, 🪪, 🏛️, ⭐, 🇮🇩)
  const [customIcon, setCustomIcon] = useState(() => {
    return localStorage.getItem('timemark_custom_icon') || '🎓'
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

  const handleScaleChange = (scale) => {
    setWatermarkScale(scale)
    localStorage.setItem('timemark_watermark_scale', scale)
  }

  const handleIconChange = (icon) => {
    setCustomIcon(icon)
    localStorage.setItem('timemark_custom_icon', icon)
  }

  const getScaleMultiplier = (scale) => {
    switch (scale) {
      case 'small': return 0.85
      case 'large': return 1.35
      case 'xlarge': return 1.70
      default: return 1.05
    }
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
    } else if (aspectRatio === '9:16') {
      // Potret 9:16 (Story / Layar Penuh HP Vertikal)
      if (targetWidth > targetHeight) {
        // Source landscape, crop width to 9:16
        const calcWidth = Math.round((targetHeight * 9) / 16)
        sourceX = Math.round((targetWidth - calcWidth) / 2)
        sourceWidth = calcWidth
      } else {
        const calcHeight = Math.round((targetWidth * 16) / 9)
        if (calcHeight <= targetHeight) {
          sourceY = Math.round((targetHeight - calcHeight) / 2)
          sourceHeight = calcHeight
        }
      }
      targetWidth = 1080
      targetHeight = 1920
    } else if (aspectRatio === '3:4') {
      // Potret 3:4 (Standar)
      if (targetWidth > targetHeight) {
        const calcWidth = Math.round((targetHeight * 3) / 4)
        sourceX = Math.round((targetWidth - calcWidth) / 2)
        sourceWidth = calcWidth
      }
      targetWidth = 960
      targetHeight = 1280
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

    // Hitung Skala Proporsional Canvas (Memperbesar Teks Watermark)
    const scaleMultiplier = getScaleMultiplier(watermarkScale)
    const baseFactor = (targetWidth / 720) * scaleMultiplier

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
    const activeIcon = customIcon || '🎓'

    // 2. Render Watermark Based on layoutTemplate ('modern' | 'card' | 'academic' | 'stamp' | 'idbadge' | 'classic')
    if (layoutTemplate === 'card') {
      // TEMA BADGE / KARTU (Box Mengambang Kanan Bawah)
      const boxWidth = Math.min(targetWidth - (30 * baseFactor), Math.round(500 * baseFactor))
      const boxHeight = Math.round((showTeacherName ? 160 : 130) * baseFactor)
      const boxX = targetWidth - boxWidth - (20 * baseFactor)
      const boxY = targetHeight - boxHeight - (20 * baseFactor)

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16 * baseFactor)
      ctx.fill()
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)'
      ctx.lineWidth = Math.max(2, 2 * baseFactor)
      ctx.stroke()

      // Header aksen baris hijau
      ctx.fillStyle = '#10B981'
      ctx.fillRect(boxX, boxY + (12 * baseFactor), 5 * baseFactor, boxHeight - (24 * baseFactor))

      let curY = boxY + (14 * baseFactor)
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(20 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#38BDF8'
      ctx.fillText(`${activeIcon} ${displayTitle}`, boxX + (18 * baseFactor), curY)
      curY += 26 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(17 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`👤 ${teacherName}${nipText}`, boxX + (18 * baseFactor), curY)
        curY += 24 * baseFactor
      }

      ctx.font = `${Math.round(15 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, boxX + (18 * baseFactor), curY)
      curY += 22 * baseFactor

      ctx.font = `${Math.round(14 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`📍 ${locationText}`, boxX + (18 * baseFactor), curY)
      curY += 22 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(14 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FBBF24'
        ctx.fillText(`📝 ${customNote.trim()}`, boxX + (18 * baseFactor), curY)
      }
    } else if (layoutTemplate === 'academic') {
      // TEMA AKADEMIK & PENDIDIKAN (🎓 Royal Navy & Gold, Emblem Edukasi)
      const boxWidth = Math.min(targetWidth - (30 * baseFactor), Math.round(540 * baseFactor))
      const boxHeight = Math.round((showTeacherName ? 175 : 145) * baseFactor)
      const boxX = (targetWidth - boxWidth) / 2
      const boxY = targetHeight - boxHeight - (25 * baseFactor)

      // Background navy mewah
      ctx.fillStyle = 'rgba(11, 25, 44, 0.94)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 18 * baseFactor)
      ctx.fill()
      // Border emas
      ctx.strokeStyle = '#F59E0B'
      ctx.lineWidth = Math.max(2.5, 2.5 * baseFactor)
      ctx.stroke()

      // Emblem Badge Lingkaran di Kiri
      const emblemSize = 46 * baseFactor
      const emblemX = boxX + (36 * baseFactor)
      const emblemY = boxY + (boxHeight / 2)

      ctx.beginPath()
      ctx.arc(emblemX, emblemY, emblemSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#F59E0B'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2 * baseFactor
      ctx.stroke()

      // Gambar icon di dalam emblem
      ctx.font = `${Math.round(24 * baseFactor)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(activeIcon, emblemX, emblemY)
      ctx.textAlign = 'left'

      // Konten Teks di Samping Kanan Emblem
      const textLeft = emblemX + (emblemSize / 2) + (16 * baseFactor)
      let curY = boxY + (15 * baseFactor)
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(20 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FDE047'
      ctx.fillText(displayTitle, textLeft, curY)
      curY += 26 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`Pendidik: ${teacherName}${nipText}`, textLeft, curY)
        curY += 24 * baseFactor
      }

      ctx.font = `${Math.round(14 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} • ⏰ ${timeFormatted}`, textLeft, curY)
      curY += 22 * baseFactor

      ctx.font = `${Math.round(13 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`📍 ${locationText}`, textLeft, curY)
      curY += 20 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(13 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#38BDF8'
        ctx.fillText(`📝 ${customNote.trim()}`, textLeft, curY)
      }
    } else if (layoutTemplate === 'stamp') {
      // TEMA STEMPEL KEDINASAN RESMI (🏛️ Formal Stamp Verification)
      const boxWidth = Math.min(targetWidth - (30 * baseFactor), Math.round(520 * baseFactor))
      const boxHeight = Math.round((showTeacherName ? 165 : 135) * baseFactor)
      const boxX = targetWidth - boxWidth - (20 * baseFactor)
      const boxY = targetHeight - boxHeight - (20 * baseFactor)

      // Background semi-dark
      ctx.fillStyle = 'rgba(15, 23, 42, 0.90)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 12 * baseFactor)
      ctx.fill()

      // Double Border Formal Kedinasan (Merah Marun / Ruby)
      ctx.strokeStyle = '#EF4444'
      ctx.lineWidth = 2.5 * baseFactor
      ctx.strokeRect(boxX + (4 * baseFactor), boxY + (4 * baseFactor), boxWidth - (8 * baseFactor), boxHeight - (8 * baseFactor))
      ctx.strokeStyle = '#B91C1C'
      ctx.lineWidth = 1 * baseFactor
      ctx.strokeRect(boxX + (8 * baseFactor), boxY + (8 * baseFactor), boxWidth - (16 * baseFactor), boxHeight - (16 * baseFactor))

      // Stempel Badge 'VERIFIKASI SAH' di kanan atas box
      const stampW = 140 * baseFactor
      const stampH = 26 * baseFactor
      const stampX = boxX + boxWidth - stampW - (14 * baseFactor)
      const stampY = boxY + (14 * baseFactor)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
      ctx.fillRect(stampX, stampY, stampW, stampH)
      ctx.strokeStyle = '#EF4444'
      ctx.strokeRect(stampX, stampY, stampW, stampH)
      ctx.font = `bold ${Math.round(11 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FCA5A5'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✓ TERVERIFIKASI SAH', stampX + (stampW / 2), stampY + (stampH / 2))
      ctx.textAlign = 'left'

      let curY = boxY + (16 * baseFactor)
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(18 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`${activeIcon} ${displayTitle}`, boxX + (16 * baseFactor), curY)
      curY += 28 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#F87171'
        ctx.fillText(`PEGAWAI: ${teacherName}${nipText}`, boxX + (16 * baseFactor), curY)
        curY += 24 * baseFactor
      }

      ctx.font = `${Math.round(14 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`WAKTU : ${dateFormatted} | ${timeFormatted}`, boxX + (16 * baseFactor), curY)
      curY += 22 * baseFactor

      ctx.font = `${Math.round(13 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`LOKASI: ${locationText}`, boxX + (16 * baseFactor), curY)
      curY += 20 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(13 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FDE047'
        ctx.fillText(`AGENDA: ${customNote.trim()}`, boxX + (16 * baseFactor), curY)
      }
    } else if (layoutTemplate === 'idbadge') {
      // TEMA ID CARD GURU / ASN (🪪 Kartu Pegawai dengan Barcode & Badge)
      const boxWidth = Math.min(targetWidth - (30 * baseFactor), Math.round(520 * baseFactor))
      const boxHeight = Math.round((showTeacherName ? 165 : 135) * baseFactor)
      const boxX = (20 * baseFactor)
      const boxY = targetHeight - boxHeight - (20 * baseFactor)

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16 * baseFactor)
      ctx.fill()
      ctx.strokeStyle = '#0284C7'
      ctx.lineWidth = 2 * baseFactor
      ctx.stroke()

      // Header strip kartu
      ctx.fillStyle = '#0284C7'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, 28 * baseFactor, [16 * baseFactor, 16 * baseFactor, 0, 0])
      ctx.fill()

      ctx.font = `bold ${Math.round(13 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${activeIcon} KARTU BUKTI KEHADIRAN PENDIDIK`, boxX + (16 * baseFactor), boxY + (14 * baseFactor))

      // Mini barcode dekoratif di kanan header
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : '#0284C7'
        ctx.fillRect(boxX + boxWidth - (60 * baseFactor) + (i * 2.5 * baseFactor), boxY + (6 * baseFactor), 1.8 * baseFactor, 16 * baseFactor)
      }

      let curY = boxY + (36 * baseFactor)
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(18 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#38BDF8'
      ctx.fillText(displayTitle, boxX + (16 * baseFactor), curY)
      curY += 24 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`Nama: ${teacherName}${nipText}`, boxX + (16 * baseFactor), curY)
        curY += 24 * baseFactor
      }

      ctx.font = `${Math.round(14 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`Jam : ${dateFormatted} • ${timeFormatted}`, boxX + (16 * baseFactor), curY)
      curY += 22 * baseFactor

      ctx.font = `${Math.round(13 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`GPS : ${locationText}`, boxX + (16 * baseFactor), curY)
      curY += 20 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(13 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FBBF24'
        ctx.fillText(`Info: ${customNote.trim()}`, boxX + (16 * baseFactor), curY)
      }
    } else if (layoutTemplate === 'classic') {
      // TEMA KLASIK (📷 Tanpa Box Hitam, Teks Drop Shadow Tajam)
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
      ctx.shadowBlur = 10 * baseFactor
      ctx.shadowOffsetX = 3 * baseFactor
      ctx.shadowOffsetY = 3 * baseFactor

      let curY = targetHeight - ((showTeacherName ? 170 : 135) * baseFactor)
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(24 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FDE047'
      ctx.fillText(`${activeIcon} ${displayTitle}`, 28 * baseFactor, curY)
      curY += 30 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(20 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`👤 ${teacherName}${nipText}`, 28 * baseFactor, curY)
        curY += 28 * baseFactor
      }

      ctx.font = `${Math.round(18 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, 28 * baseFactor, curY)
      curY += 26 * baseFactor

      ctx.font = `${Math.round(16 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📍 ${locationText}`, 28 * baseFactor, curY)
      curY += 26 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#38BDF8'
        ctx.fillText(`📝 ${customNote.trim()}`, 28 * baseFactor, curY)
      }

      // Reset shadow
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    } else {
      // TEMA MODERN (Modern Strip Gradien Bawah)
      const overlayHeight = Math.max(150 * baseFactor, targetHeight * 0.22)
      const overlayY = targetHeight - overlayHeight

      const gradient = ctx.createLinearGradient(0, overlayY - (30 * baseFactor), 0, targetHeight)
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0)')
      gradient.addColorStop(0.3, 'rgba(15, 23, 42, 0.88)')
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0.96)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, overlayY - (30 * baseFactor), targetWidth, overlayHeight + (30 * baseFactor))

      ctx.fillStyle = '#10B981'
      ctx.fillRect(20 * baseFactor, overlayY + (12 * baseFactor), 6 * baseFactor, overlayHeight - (32 * baseFactor))

      let currentY = overlayY + (14 * baseFactor)
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'top'

      ctx.font = `bold ${Math.round(23 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#38BDF8'
      ctx.fillText(`${activeIcon} ${displayTitle}`, 36 * baseFactor, currentY)
      currentY += 30 * baseFactor

      if (showTeacherName) {
        ctx.font = `bold ${Math.round(20 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`👤 ${teacherName}${nipText}`, 36 * baseFactor, currentY)
        currentY += 28 * baseFactor
      }

      ctx.font = `${Math.round(17 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, 36 * baseFactor, currentY)
      currentY += 26 * baseFactor

      ctx.font = `${Math.round(16 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      ctx.fillText(`📍 ${locationText}`, 36 * baseFactor, currentY)
      currentY += 26 * baseFactor

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FBBF24'
        ctx.fillText(`📝 Kegiatan: ${customNote.trim()}`, 36 * baseFactor, currentY)
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

          {/* Rasio Foto (3:4, 9:16, 1:1, 16:9) */}
          <div style={{ marginTop: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              📐 Rasio Foto (Ukuran Bingkai)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
              {[
                { id: '3:4', label: '3:4' },
                { id: '9:16', label: '9:16 Full' },
                { id: '1:1', label: '1:1 Kotak' },
                { id: '16:9', label: '16:9 Lebar' }
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleAspectRatioChange(r.id)}
                  style={{
                    padding: '0.45rem 0.1rem',
                    borderRadius: '8px',
                    border: aspectRatio === r.id ? '1px solid #38BDF8' : '1px solid #475569',
                    background: aspectRatio === r.id ? '#0284C7' : '#0F172A',
                    color: 'white',
                    fontSize: '0.72rem',
                    fontWeight: aspectRatio === r.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pengaturan Ukuran Teks / Memperbesar Watermark */}
          <div style={{ marginTop: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              🔍 Ukuran Watermark (Perbesar Teks)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
              {[
                { id: 'small', label: 'Ringkas' },
                { id: 'normal', label: 'Standar' },
                { id: 'large', label: 'Besar' },
                { id: 'xlarge', label: 'Ekstra' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleScaleChange(s.id)}
                  style={{
                    padding: '0.45rem 0.1rem',
                    borderRadius: '8px',
                    border: watermarkScale === s.id ? '1px solid #F59E0B' : '1px solid #475569',
                    background: watermarkScale === s.id ? '#D97706' : '#0F172A',
                    color: 'white',
                    fontSize: '0.72rem',
                    fontWeight: watermarkScale === s.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pilihan Ikon Utama Watermark */}
          <div style={{ marginTop: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              ✨ Pilihan Ikon Watermark
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.35rem' }}>
              {[
                { icon: '🎓', label: 'Guru' },
                { icon: '🏫', label: 'Sekolah' },
                { icon: '🪪', label: 'ID' },
                { icon: '🏛️', label: 'Dinas' },
                { icon: '⭐', label: 'Bintang' },
                { icon: '🇮🇩', label: 'RI' }
              ].map((item) => (
                <button
                  key={item.icon}
                  type="button"
                  onClick={() => handleIconChange(item.icon)}
                  title={item.label}
                  style={{
                    padding: '0.4rem 0.2rem',
                    borderRadius: '8px',
                    border: customIcon === item.icon ? '1px solid #10B981' : '1px solid #475569',
                    background: customIcon === item.icon ? '#059669' : '#0F172A',
                    color: 'white',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
                  }}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Template Layout Watermark (Modern, Card, Academic, Stamp, IDBadge, Classic) */}
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'block', marginBottom: '0.4rem' }}>
              🎨 Desain Watermark (Tema Cetak)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {[
                { id: 'modern', label: 'Modern Strip' },
                { id: 'card', label: 'Badge Card' },
                { id: 'academic', label: '🎓 Akademik' },
                { id: 'stamp', label: '🏛️ Stempel Sah' },
                { id: 'idbadge', label: '🪪 ID Card ASN' },
                { id: 'classic', label: '📷 Klasik Drop' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleLayoutChange(t.id)}
                  style={{
                    padding: '0.5rem 0.2rem',
                    borderRadius: '8px',
                    border: layoutTemplate === t.id ? '1px solid #38BDF8' : '1px solid #475569',
                    background: layoutTemplate === t.id ? '#0284C7' : '#0F172A',
                    color: 'white',
                    fontSize: '0.72rem',
                    fontWeight: layoutTemplate === t.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center'
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
          aspectRatio: aspectRatio === '1:1' ? '1 / 1' : aspectRatio === '16:9' ? '16 / 9' : aspectRatio === '9:16' ? '9 / 16' : '3 / 4',
          maxHeight: aspectRatio === '9:16' ? '64vh' : '58vh',
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

            {/* Live Watermark Preview Pill disesuaikan dengan template & ukuran */}
            {layoutTemplate === 'card' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  maxWidth: '80%',
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '1px solid rgba(56, 189, 248, 0.5)',
                  borderLeft: '4px solid #10B981',
                  borderRadius: '12px',
                  padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : watermarkScale === 'large' ? '0.6rem 0.85rem' : '0.5rem 0.75rem',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.85rem' : watermarkScale === 'large' ? '0.78rem' : '0.72rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#38BDF8' }}>
                  {customIcon} {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div>👤 {profile?.full_name || 'Guru'}</div>}
                <div style={{ color: '#E2E8F0', fontSize: '0.68rem' }}>
                  📅 {currentDateTime.toLocaleDateString('id-ID')} | ⏰ {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>📍 {locationText}</div>
              </div>
            ) : layoutTemplate === 'academic' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: 'rgba(11, 25, 44, 0.94)',
                  border: '1.5px solid #F59E0B',
                  borderRadius: '12px',
                  padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : '0.55rem 0.8rem',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem'
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#F59E0B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  flexShrink: 0
                }}>
                  {customIcon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', color: '#FDE047' }}>
                    {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                  </div>
                  {showTeacherName && <div style={{ fontSize: '0.7rem' }}>Pendidik: {profile?.full_name || 'Guru'}</div>}
                  <div style={{ color: '#E2E8F0', fontSize: '0.65rem' }}>
                    {currentDateTime.toLocaleDateString('id-ID')} • {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.62rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📍 {locationText}
                  </div>
                </div>
              </div>
            ) : layoutTemplate === 'stamp' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  maxWidth: '85%',
                  background: 'rgba(15, 23, 42, 0.92)',
                  border: '2px solid #EF4444',
                  boxShadow: 'inset 0 0 0 2px #B91C1C',
                  borderRadius: '10px',
                  padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : '0.55rem 0.8rem',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 'bold', color: '#FFFFFF' }}>{customIcon} {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}</span>
                  <span style={{ background: 'rgba(239,68,68,0.25)', border: '1px solid #EF4444', color: '#FCA5A5', fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 'bold' }}>
                    TERVERIFIKASI
                  </span>
                </div>
                {showTeacherName && <div style={{ color: '#F87171', fontSize: '0.7rem', fontWeight: '600' }}>PEGAWAI: {profile?.full_name || 'Guru'}</div>}
                <div style={{ color: '#E2E8F0', fontSize: '0.65rem' }}>
                  WAKTU: {currentDateTime.toLocaleDateString('id-ID')} | {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                </div>
                <div style={{ color: '#94A3B8', fontSize: '0.62rem' }}>LOKASI: {locationText}</div>
              </div>
            ) : layoutTemplate === 'idbadge' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.94)',
                  border: '1.5px solid #0284C7',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ background: '#0284C7', padding: '0.25rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.68rem', color: '#FFF' }}>{customIcon} KARTU BUKTI KEHADIRAN PENDIDIK</span>
                  <span style={{ letterSpacing: '2px', fontSize: '0.55rem' }}>|||| ||| ||</span>
                </div>
                <div style={{ padding: '0.5rem 0.75rem' }}>
                  <div style={{ fontWeight: 'bold', color: '#38BDF8' }}>
                    {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                  </div>
                  {showTeacherName && <div style={{ fontSize: '0.7rem' }}>Nama: {profile?.full_name || 'Guru'}</div>}
                  <div style={{ color: '#E2E8F0', fontSize: '0.65rem' }}>
                    Jam : {currentDateTime.toLocaleDateString('id-ID')} • {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.62rem' }}>GPS : {locationText}</div>
                </div>
              </div>
            ) : layoutTemplate === 'classic' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  textShadow: '0 2px 5px rgba(0,0,0,0.95)',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.9rem' : watermarkScale === 'large' ? '0.82rem' : '0.75rem',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#FDE047', fontSize: watermarkScale === 'xlarge' ? '1.05rem' : '0.85rem' }}>
                  {customIcon} {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div style={{ fontWeight: '600' }}>👤 {profile?.full_name || 'Guru'}</div>}
                <div>📅 {currentDateTime.toLocaleDateString('id-ID')} | ⏰ {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}</div>
                <div style={{ color: '#E2E8F0', fontSize: '0.68rem' }}>📍 {locationText}</div>
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  background: 'rgba(15, 23, 42, 0.82)',
                  backdropFilter: 'blur(8px)',
                  padding: watermarkScale === 'xlarge' ? '0.8rem 1rem' : watermarkScale === 'large' ? '0.7rem 0.9rem' : '0.6rem 0.8rem',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.85rem' : watermarkScale === 'large' ? '0.78rem' : '0.72rem',
                  borderLeft: '4px solid #10B981',
                  pointerEvents: 'none'
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#38BDF8', fontSize: watermarkScale === 'xlarge' ? '0.95rem' : '0.82rem' }}>
                  {customIcon} {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                </div>
                {showTeacherName && <div>👤 {profile?.full_name || 'Guru'}</div>}
                <div style={{ color: '#E2E8F0' }}>
                  📅 {currentDateTime.toLocaleDateString('id-ID')} | ⏰ {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
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
