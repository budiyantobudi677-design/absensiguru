import { useState, useRef, useEffect } from 'react'
import { Camera, X, RefreshCw, Download, Share2, MapPin, Calendar, Clock, User, Settings, CheckSquare, Square } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { getSecureServerDate, syncServerTime, getSecureLocation } from '../lib/security'

export default function CameraTimemarkModal({ isOpen, onClose, profile, user, schoolName = 'GammaraApp', schoolLogo = '', onSelectPhoto = null }) {
  const [stream, setStream] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' (selfie) or 'environment' (belakang)
  const [capturedPhotos, setCapturedPhotos] = useState([]) // Array multi-shot (maks 10 foto)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [isFlashActive, setIsFlashActive] = useState(false)
  const [customNote, setCustomNote] = useState('')

  const activePhoto = capturedPhotos[selectedPhotoIndex] || capturedPhotos[capturedPhotos.length - 1] || null
  const [locationText, setLocationText] = useState('Mencari lokasi GPS...')
  const [currentDateTime, setCurrentDateTime] = useState(() => getSecureServerDate())
  const [cameraError, setCameraError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isFetchingLocation, setIsFetchingLocation] = useState(false)

  // Data Geolokasi Terperinci (Koordinat, Elevasi, Arah Kompas, Akurasi)
  const [geoData, setGeoData] = useState({
    latitude: null,
    longitude: null,
    altitude: 64.6,
    heading: null,
    accuracy: null
  })
  const [compassHeading, setCompassHeading] = useState(227)

  // Deteksi Otomatis Rotasi HP (Landscape jika HP diputar 90 derajat)
  const [isDeviceLandscape, setIsDeviceLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > window.innerHeight
    }
    return false
  })
  // Sudut rotasi virtual ketika layar sistem HP terkunci potret (90 = CCW / Primary, -90 = CW / Reverse)
  const [virtualRotationAngle, setVirtualRotationAngle] = useState(90)
  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844
  }))

  const isSystemLandscape = typeof window !== 'undefined' && windowDimensions.width > windowDimensions.height
  const isLandscape = isDeviceLandscape || isSystemLandscape
  const isVirtualLandscape = isLandscape && !isSystemLandscape

  // Judul / Status Timemark kustom yang tersimpan di localStorage (Merubah teks "Hadir", "Selesai", dll.)
  const [customTitle, setCustomTitle] = useState(() => {
    return localStorage.getItem('timemark_custom_title') || 'Selesai'
  })
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  // Pengaturan tampilkan/sembunyikan nama guru
  const [showTeacherName, setShowTeacherName] = useState(() => {
    const saved = localStorage.getItem('timemark_show_teacher_name')
    return saved !== null ? saved === 'true' : true
  })

  // Pengaturan tampilkan/sembunyikan peta mini di timemark
  const [showMapInTimemark, setShowMapInTimemark] = useState(() => {
    const saved = localStorage.getItem('timemark_show_map')
    return saved !== null ? saved === 'true' : false
  })

  const handleToggleShowMap = () => {
    const nextVal = !showMapInTimemark
    setShowMapInTimemark(nextVal)
    localStorage.setItem('timemark_show_map', nextVal.toString())
  }

  // Pengaturan Template Layout Watermark ('panritaedu' | 'panrita_split' | 'geotag' | 'logo' | 'modern' | 'card' | 'academic' | 'stamp' | 'idbadge' | 'classic')
  const [layoutTemplate, setLayoutTemplate] = useState(() => {
    const saved = localStorage.getItem('timemark_layout_template')
    if (!saved || saved === 'modern') {
      localStorage.setItem('timemark_layout_template', 'panritaedu')
      return 'panritaedu'
    }
    return saved
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

  // Listener Sensor Orientasi & Kompas (Mendeteksi Rotasi Fisik HP 90 Derajat Walau Auto-Rotate Layar Terkunci)
  useEffect(() => {
    if (!isOpen) return

    const handleOrientation = (e) => {
      // 1. Arah Kompas Dinamis
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        setCompassHeading(Math.round(e.webkitCompassHeading))
      } else if (e.alpha !== null && e.alpha !== undefined) {
        const heading = (360 - Math.round(e.alpha)) % 360
        setCompassHeading(heading)
      }

      // 2. Deteksi Rotasi Fisik HP 90 Derajat (Landscape) via accelerometer gamma & beta
      // HP Potret: |beta| tinggi (~70-90°), |gamma| rendah (~0-20°).
      // HP Landscape (dimiringkan 90° mendatar): |gamma| tinggi (> 35°).
      if (e.gamma !== null && e.gamma !== undefined && e.beta !== null && e.beta !== undefined) {
        const absGamma = Math.abs(e.gamma)
        const absBeta = Math.abs(e.beta)

        if (absGamma > 34 && absBeta < 68) {
          setIsDeviceLandscape(true)
          if (e.gamma < -20) {
            setVirtualRotationAngle(90) // CCW (earpiece di kiri, charger di kanan)
          } else if (e.gamma > 20) {
            setVirtualRotationAngle(-90) // CW (earpiece di kanan, charger di kiri)
          }
        } else if (absBeta > 52 && absGamma < 28) {
          setIsDeviceLandscape(false)
        } else if (typeof window !== 'undefined') {
          // Fallback ke orientasi layar sistem jika didukung
          setIsDeviceLandscape(window.innerWidth > window.innerHeight)
        }
      }
    }

    const checkOrientation = () => {
      if (typeof window !== 'undefined') {
        setWindowDimensions({ width: window.innerWidth, height: window.innerHeight })
        const isLand = window.innerWidth > window.innerHeight
        setIsDeviceLandscape(isLand)
      }
    }

    window.addEventListener('deviceorientation', handleOrientation, true)
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', checkOrientation)
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true)
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', checkOrientation)
      }
    }
  }, [isOpen])

  // Helper Konversi Singkatan Arah Kompas (Contoh: 227 -> SW)
  const getCompassShortDir = (deg) => {
    if (deg === null || deg === undefined || isNaN(deg)) return 'SW'
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    const idx = Math.round(((deg % 360) / 22.5)) % 16
    return directions[idx] || 'SW'
  }

  // Helper Konversi Koordinat Desimal ke Format Foto Referensi (Contoh: 5.125379°S, 119.530402°E)
  const formatCoordDecimalCard = (lat, lng) => {
    if (lat === null || lat === undefined || isNaN(lat)) return '5.125379°S, 119.530402°E'
    const latDir = lat >= 0 ? 'N' : 'S'
    const lngDir = lng >= 0 ? 'E' : 'W'
    const latStr = Math.abs(lat).toFixed(6)
    const lngStr = Math.abs(lng).toFixed(6)
    return `${latStr}°${latDir}, ${lngStr}°${lngDir}`
  }

  // Format Koordinat ke Derajat Menit Detik (DMS)
  const formatCoordDMS = (coord, isLat) => {
    if (coord === null || coord === undefined || isNaN(coord)) return '-'
    const absolute = Math.abs(coord)
    const degrees = Math.floor(absolute)
    const minutesNotTruncated = (absolute - degrees) * 60
    const minutes = Math.floor(minutesNotTruncated)
    const seconds = Math.floor((minutesNotTruncated - minutes) * 60)
    const direction = isLat ? (coord >= 0 ? 'LU' : 'LS') : (coord >= 0 ? 'BT' : 'BB')
    return `${degrees}°${minutes}'${seconds}" ${direction}`
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

  // Helper Konversi Koordinat GPS ke Posisi Sub-Tile Presisi (Grid 2x2 Tile @ Zoom 17)
  // Memastikan titik koordinat (lat, lng) berada tepat 100% di titik tengah pin merah peta mini (tanpa bergeser ke pusat tile)
  const getExactTilePosition = (lat, lng, zoom = 17) => {
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return null
    const scale = Math.pow(2, zoom)
    const u = ((lng + 180) / 360) * scale
    const latRad = (lat * Math.PI) / 180
    const v = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale

    const tileX = Math.floor(u)
    const tileY = Math.floor(v)
    const fx = u - tileX
    const fy = v - tileY

    const startX = fx < 0.5 ? tileX - 1 : tileX
    const startY = fy < 0.5 ? tileY - 1 : tileY

    const normX = u - startX // Selalu di rentang [0.5, 1.5)
    const normY = v - startY // Selalu di rentang [0.5, 1.5)
    const centerPx = normX * 256
    const centerPy = normY * 256

    return {
      zoom,
      startX,
      startY,
      normX,
      normY,
      centerPx,
      centerPy,
      tiles: [
        { dx: 0, dy: 0, x: startX, y: startY },
        { dx: 1, dy: 0, x: startX + 1, y: startY },
        { dx: 0, dy: 1, x: startX, y: startY + 1 },
        { dx: 1, dy: 1, x: startX + 1, y: startY + 1 }
      ]
    }
  }

  const getSingleTileUrl = (x, y, zoom = 17) =>
    `https://mt1.google.com/vt/lyrs=m&x=${x}&y=${y}&z=${zoom}&hl=id`

  const getSingleFallbackTileUrl = (x, y, zoom = 17) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${y}/${x}`

  const loadSingleTileImage = (x, y, zoom = 17) => {
    return new Promise((resolve) => {
      let resolved = false
      const onDone = (res) => {
        if (!resolved) {
          resolved = true
          resolve(res)
        }
      }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => onDone(img)
      img.onerror = () => {
        const fallbackImg = new Image()
        fallbackImg.crossOrigin = 'anonymous'
        fallbackImg.onload = () => onDone(fallbackImg)
        fallbackImg.onerror = () => onDone(null)
        fallbackImg.src = getSingleFallbackTileUrl(x, y, zoom)
        setTimeout(() => onDone(null), 1500)
      }
      img.src = getSingleTileUrl(x, y, zoom)
      setTimeout(() => onDone(null), 1800)
    })
  }

  // Pre-load & Gabungkan Grid 2x2 Tile Peta dengan Titik Koordinat Tepat di Tengah Canvas
  const loadMapImage = async (lat, lng) => {
    const pos = getExactTilePosition(lat, lng, 17)
    if (!pos) return null
    try {
      const loadedTiles = await Promise.all(
        pos.tiles.map((t) => loadSingleTileImage(t.x, t.y, pos.zoom))
      )
      if (loadedTiles.every((img) => img === null)) return null

      // Gabungkan 2x2 tile pada kanvas 512x512
      const stitchCanvas = document.createElement('canvas')
      stitchCanvas.width = 512
      stitchCanvas.height = 512
      const sCtx = stitchCanvas.getContext('2d')
      sCtx.fillStyle = '#E2E8F0'
      sCtx.fillRect(0, 0, 512, 512)

      pos.tiles.forEach((t, idx) => {
        const img = loadedTiles[idx]
        if (img) {
          sCtx.drawImage(img, t.dx * 256, t.dy * 256, 256, 256)
        }
      })

      // Potong (crop) area 224x168 (rasio 4:3) yang berpusat persis di (centerPx, centerPy)
      const cropW = 224
      const cropH = 168
      const outCanvas = document.createElement('canvas')
      outCanvas.width = cropW
      outCanvas.height = cropH
      const outCtx = outCanvas.getContext('2d')
      outCtx.drawImage(
        stitchCanvas,
        pos.centerPx - cropW / 2,
        pos.centerPy - cropH / 2,
        cropW,
        cropH,
        0,
        0,
        cropW,
        cropH
      )
      return outCanvas
    } catch {
      return null
    }
  }

  // Helper Gambar Mini Map Kotak Presisi di Canvas Watermark Foto
  const drawCanvasMiniMap = (ctx, x, y, width, height, mapImage, baseFactor) => {
    ctx.save()
    const radius = 8 * baseFactor

    // 1. Clipping area kotak membulat
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
    ctx.clip()

    if (mapImage) {
      ctx.drawImage(mapImage, x, y, width, height)
    } else {
      // Fallback Grafis Radar GPS Taktis jika offline / tanpa jaringan
      ctx.fillStyle = '#1E293B'
      ctx.fillRect(x, y, width, height)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.lineWidth = 1 * baseFactor
      const step = 16 * baseFactor
      for (let gx = x; gx < x + width; gx += step) {
        ctx.beginPath()
        ctx.moveTo(gx, y)
        ctx.lineTo(gx, y + height)
        ctx.stroke()
      }
      for (let gy = y; gy < y + height; gy += step) {
        ctx.beginPath()
        ctx.moveTo(x, gy)
        ctx.lineTo(x + width, gy)
        ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
      ctx.beginPath()
      ctx.arc(x + width / 2, y + height / 2, 20 * baseFactor, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()

    // 2. Garis Tepi (Border Card Peta)
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.lineWidth = 2 * baseFactor
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'
    ctx.shadowBlur = 4 * baseFactor
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, radius)
    ctx.stroke()
    ctx.restore()

    // 3. Ikon Pin Lokasi Merah di Titik Pusat Peta
    const pinX = x + width / 2
    const pinY = y + height / 2
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
    ctx.shadowBlur = 5 * baseFactor

    ctx.fillStyle = '#EF4444'
    ctx.beginPath()
    ctx.arc(pinX, pinY - 5 * baseFactor, 6.5 * baseFactor, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(pinX - 5 * baseFactor, pinY - 3 * baseFactor)
    ctx.lineTo(pinX, pinY + 4 * baseFactor)
    ctx.lineTo(pinX + 5 * baseFactor, pinY - 3 * baseFactor)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(pinX, pinY - 5 * baseFactor, 2.2 * baseFactor, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // 4. Badge Mini "MAP" di Sudut Kiri Bawah
    ctx.save()
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
    const badgeW = 38 * baseFactor
    const badgeH = 13 * baseFactor
    const badgeX = x + 3 * baseFactor
    const badgeY = y + height - badgeH - (3 * baseFactor)
    ctx.beginPath()
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3 * baseFactor)
    ctx.fill()
    ctx.fillStyle = '#38BDF8'
    ctx.font = `bold ${Math.round(8 * baseFactor)}px Outfit, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MAP', badgeX + badgeW / 2, badgeY + badgeH / 2)
    ctx.restore()
  }

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const viewfinderRef = useRef(null)
  const cameraRequestIdRef = useRef(0)
  const isSwitchingCameraRef = useRef(false)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)
  const [vfSize, setVfSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!viewfinderRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect) {
          setVfSize({
            width: Math.round(entry.contentRect.width),
            height: Math.round(entry.contentRect.height)
          })
        }
      }
    })
    observer.observe(viewfinderRef.current)
    return () => observer.disconnect()
  }, [isOpen, isLandscape])

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setCapturedPhotos([])
      setSelectedPhotoIndex(0)
      setIsReviewMode(false)
      return
    }

    syncServerTime().then(() => setCurrentDateTime(getSecureServerDate()))
    fetchLocation()
    const timer = setInterval(() => setCurrentDateTime(getSecureServerDate()), 1000)

    // Pemantauan GPS High-Accuracy Berkelanjutan (Memperbaiki titik lokasi kasar BTS menjadi presisi satelit secara real-time)
    let watchId = null
    let lastGeocodedLat = null
    let lastGeocodedLng = null
    let bestWatchedAccuracy = Infinity

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const acc = pos.coords.accuracy || 999
          const alt = pos.coords.altitude
          const head = pos.coords.heading

          // Hanya terima update jika akurasi lebih baik atau sudah cukup tajam (<= 35m)
          if (acc <= bestWatchedAccuracy + 10 || acc <= 35) {
            if (acc < bestWatchedAccuracy) bestWatchedAccuracy = acc

            setGeoData((prev) => ({
              latitude: lat,
              longitude: lng,
              altitude: alt !== null && !isNaN(alt) ? Math.round(alt) : prev.altitude,
              accuracy: Math.round(acc),
              heading: head !== null && !isNaN(head) ? Math.round(head) : prev.heading
            }))

            if (head !== null && !isNaN(head)) {
              setCompassHeading(Math.round(head))
            }

            // Hitung jarak pergeseran dari titik geocoding sebelumnya
            let movedMeters = Infinity
            if (lastGeocodedLat !== null && lastGeocodedLng !== null) {
              const R = 6371000
              const dLat = ((lat - lastGeocodedLat) * Math.PI) / 180
              const dLon = ((lng - lastGeocodedLng) * Math.PI) / 180
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((lastGeocodedLat * Math.PI) / 180) *
                  Math.cos((lat * Math.PI) / 180) *
                  Math.sin(dLon / 2) *
                  Math.sin(dLon / 2)
              movedMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            }

            // Jika lokasi bergeser > 10m dari titik sebelumnya, perbarui nama tempat detail (SD/Masjid/Jalan)
            if (movedMeters > 10) {
              lastGeocodedLat = lat
              lastGeocodedLng = lng
              fetchAddressName(lat, lng).then((address) => {
                if (address) setLocationText(address)
              })
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      )
    }

    return () => {
      clearInterval(timer)
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId)
      }
      stopCamera()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode)
    }
  }, [isOpen])

  // Pastikan stream kamera tetap terhubung dan aktif saat kembali dari review mode
  useEffect(() => {
    if (isOpen && !isReviewMode) {
      if (videoRef.current) {
        const activeStream = streamRef.current || stream
        if (activeStream && activeStream.active && activeStream.getVideoTracks().some((t) => t.readyState === 'live')) {
          if (videoRef.current.srcObject !== activeStream) {
            videoRef.current.srcObject = activeStream
          }
          videoRef.current.play().catch(console.warn)
        } else if (!activeStream && !cameraError) {
          startCamera(facingMode)
        }
      }
    }
  }, [isOpen, isReviewMode])

  const fetchAddressName = async (latitude, longitude) => {
    const calcDistMeters = (lat1, lon1, lat2, lon2) => {
      if ([lat1, lon1, lat2, lon2].some((v) => v === null || v === undefined || isNaN(v))) return Infinity
      const R = 6371000
      const dLat = ((lat2 - lat1) * Math.PI) / 180
      const dLon = ((lon2 - lon1) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const isValidPoiName = (name) => {
      if (!name || typeof name !== 'string') return false
      const trimmed = name.trim()
      if (trimmed.length < 3) return false
      if (/^(rumah|home|house|kos|kost|counter|lokasi|jalan|jl\.?)$/i.test(trimmed)) return false
      return true
    }

    const isImportantLandmark = (placeName = '', placeType = '') => {
      const landmarkTypeRegex = /School|Education|College|University|Library|Mosque|Place of Worship|Church|Temple|Synagogue|Religious|Government|City Hall|Courthouse|Police|Post Office|Hospital|Medical|Clinic|Health|Park|Stadium|Sports|Museum|Bank|Community Center/i
      const landmarkNameRegex = /\b(SD|SDN|SDI|SDIT|SMP|SMPN|SMPIT|SMA|SMAN|SMK|SMKN|MI|MIN|MIS|MTs|MTsN|MTsS|MA|MAN|MAS|TK|PAUD|RA|SLB|UPT|UPTD|Sekolah|Madrasah|Pesantren|Kampus|Universitas|Institut|Politeknik|STIE|STKIP|STIKES|Masjid|Mesjid|Musholla|Musala|Mushalla|Langgar|Surau|Gereja|Pura|Vihara|Klenteng|Kantor|Dinas|Balai|Kelurahan|Kecamatan|Desa|Kabupaten|Walikota|Bupati|Gubernur|DPRD|KUA|Koramil|Polsek|Polres|Polda|Puskesmas|Posyandu|RS|RSUD|RSU|RSIA|Rumah Sakit|Klinik|Apotek|Bank|BRI|BNI|Mandiri|BCA|BSI|BTN|BPD|Lapangan|Taman|Gedung|Aula|Asrama|Pasar|Terminal|Stasiun|Bandara|Pelabuhan)\b/i
      return landmarkTypeRegex.test(placeType) || landmarkNameRegex.test(placeName)
    }

    const buildDeduplicatedAddress = (parts) => {
      const result = []
      for (const raw of parts) {
        if (!raw || typeof raw !== 'string') continue
        const clean = raw.trim()
        if (!clean) continue
        const lower = clean.toLowerCase()
        const isDuplicate = result.some((existing) => {
          const exLower = existing.toLowerCase()
          return exLower === lower || exLower.includes(lower) || lower.includes(exLower)
        })
        if (!isDuplicate) {
          result.push(clean)
        }
      }
      return result.join(', ')
    }

    // 1. Prioritas Utama: ArcGIS World Geocode & POI Detection (Mendeteksi nama SD/Sekolah, Masjid, Kantor, Toko, Jalan & Kelurahan)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)

      const poiUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=pjson&category=POI&location=${longitude},${latitude}&distance=100&maxLocations=15&outFields=PlaceName,Place_addr,Type,StAddr,Nbrhd,City,Subregion,Region`
      const revUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=POI,PointAddress,StreetAddress,StreetName&location=${longitude},${latitude}&langCode=id`

      const [poiResp, revResp] = await Promise.allSettled([
        fetch(poiUrl, { signal: controller.signal }),
        fetch(revUrl, { signal: controller.signal })
      ])
      clearTimeout(timer)

      let poiCandidates = []
      if (poiResp.status === 'fulfilled' && poiResp.value.ok) {
        const poiJson = await poiResp.value.json()
        if (Array.isArray(poiJson?.candidates)) {
          poiCandidates = poiJson.candidates
            .map((c) => ({
              placeName: c.attributes?.PlaceName || c.address || '',
              type: c.attributes?.Type || '',
              stAddr: c.attributes?.StAddr || '',
              nbrhd: c.attributes?.Nbrhd || '',
              city: c.attributes?.City || '',
              subregion: c.attributes?.Subregion || '',
              region: c.attributes?.Region || '',
              dist: calcDistMeters(latitude, longitude, c.location?.y, c.location?.x)
            }))
            .filter((c) => isValidPoiName(c.placeName))
            .sort((a, b) => a.dist - b.dist)
        }
      }

      let revAddr = null
      if (revResp.status === 'fulfilled' && revResp.value.ok) {
        const revJson = await revResp.value.json()
        revAddr = revJson?.address || null
      }

      // Pilih nama tempat terbaik:
      // Utamakan landmark penting (Sekolah/SD/SMP/SMA, Masjid/Musholla, Kantor, Puskesmas, dll.) dalam radius 90m
      let selectedPoi = poiCandidates.find((c) => isImportantLandmark(c.placeName, c.type) && c.dist <= 90)

      // Jika tidak ada di daftar kandidat tetapi reverseGeocode mengembalikan landmark penting dalam radius 90m
      if (!selectedPoi && revAddr && isValidPoiName(revAddr.PlaceName)) {
        const revDist = calcDistMeters(latitude, longitude, revAddr.Y, revAddr.X)
        if (isImportantLandmark(revAddr.PlaceName, revAddr.Type) && revDist <= 90) {
          selectedPoi = {
            placeName: revAddr.PlaceName,
            stAddr: revAddr.Address || '',
            nbrhd: revAddr.Neighborhood || revAddr.District || '',
            city: revAddr.City || '',
            subregion: revAddr.Subregion || revAddr.MetroArea || ''
          }
        }
      }

      // Jika bukan landmark utama, ambil tempat/POI terdekat (Toko, Gedung, Cafe, Tempat Umum, dll.) dalam radius 55m
      if (!selectedPoi) {
        if (poiCandidates.length > 0 && poiCandidates[0].dist <= 55) {
          selectedPoi = poiCandidates[0]
        } else if (revAddr && isValidPoiName(revAddr.PlaceName)) {
          const revDist = calcDistMeters(latitude, longitude, revAddr.Y, revAddr.X)
          if (revDist <= 60) {
            selectedPoi = {
              placeName: revAddr.PlaceName,
              stAddr: revAddr.Address || '',
              nbrhd: revAddr.Neighborhood || revAddr.District || '',
              city: revAddr.City || '',
              subregion: revAddr.Subregion || revAddr.MetroArea || ''
            }
          }
        }
      }

      const placeName = selectedPoi?.placeName || ''
      const street = selectedPoi?.stAddr || revAddr?.Address || ''
      const neighborhood = selectedPoi?.nbrhd || revAddr?.Neighborhood || revAddr?.District || ''
      const subdistrict = selectedPoi?.city || revAddr?.City || ''
      const city = selectedPoi?.subregion || revAddr?.Subregion || revAddr?.MetroArea || ''

      const formatted = buildDeduplicatedAddress([placeName, street, neighborhood, subdistrict, city])
      if (formatted) {
        return formatted
      }
    } catch (e) {
      // Lanjut ke fallback berikutnya
    }

    // 2. Fallback ke OpenStreetMap Nominatim (zoom=18 untuk detail nama gedung/sekolah/masjid)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&namedetails=1&accept-language=id`,
        { signal: controller.signal }
      )
      clearTimeout(timer)
      if (response.ok) {
        const data = await response.json()
        if (data && data.address) {
          const addr = data.address
          const poiName =
            data.name ||
            addr.amenity ||
            addr.school ||
            addr.college ||
            addr.university ||
            addr.place_of_worship ||
            addr.building ||
            addr.office ||
            addr.shop ||
            addr.tourism ||
            addr.leisure ||
            ''
          const road = addr.road || addr.pedestrian || addr.residential || ''
          const village = addr.village || addr.suburb || addr.neighbourhood || ''
          const district = addr.city_district || addr.subdistrict || addr.municipality || ''
          const city = addr.city || addr.town || addr.county || ''

          const formatted = buildDeduplicatedAddress([poiName, road, village, district, city])
          if (formatted) {
            return formatted
          } else if (data.display_name) {
            return data.display_name.split(',').slice(0, 4).join(',').trim()
          }
        }
      }
    } catch (e) {
      // Fallback ke BigDataCloud
    }

    // 3. Fallback Terakhir ke BigDataCloud Reverse Geocoding Client
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`,
        { signal: controller.signal }
      )
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json()
        const locality = data.locality || data.neighbourhood || ''
        const city = data.city || data.localityInfo?.administrative?.[2]?.name || ''
        const province = data.principalSubdivision || ''
        const formatted = buildDeduplicatedAddress([locality, city, province])
        if (formatted) {
          return formatted
        }
      }
    } catch (e) {
      console.warn('Reverse geocoding failed, fallback to lat/long:', e)
    }

    return `Lat: ${latitude.toFixed(5)}, Long: ${longitude.toFixed(5)}`
  }

  const fetchLocation = async () => {
    setIsFetchingLocation(true)
    setLocationText('Mencari sinyal GPS...')
    try {
      const pos = await getSecureLocation({ enableHighAccuracy: true, timeout: 8000 })
      const lat = pos.latitude
      const lng = pos.longitude
      const alt = pos.altitude
      const acc = pos.accuracy
      const head = pos.heading

      if (pos.isMock) {
        setLocationText('⚠️ PERINGATAN: Terdeteksi Fake GPS / Lokasi Palsu!')
        setCameraError('Aplikasi mendeteksi lokasi palsu (Fake GPS/Mock Provider). Harap matikan aplikasi lokasi palsu untuk melanjutkan.')
        setIsFetchingLocation(false)
        return
      }

      setGeoData({
        latitude: lat,
        longitude: lng,
        altitude: alt !== null && !isNaN(alt) ? Math.round(alt) : null,
        accuracy: acc !== null && !isNaN(acc) ? Math.round(acc) : null,
        heading: head !== null && !isNaN(head) ? Math.round(head) : null
      })

      if (head !== null && !isNaN(head)) {
        setCompassHeading(Math.round(head))
      }

      // Langsung tampilkan koordinat secara instan agar watermark kamera tidak pernah 'stuck' menunggu API geocoding
      const coordFallback = `Lat: ${lat.toFixed(5)}, Long: ${lng.toFixed(5)}`
      setLocationText(coordFallback)
      setIsFetchingLocation(false)

      // Cari nama jalan/wilayah di latar belakang secara asynchronous
      fetchAddressName(lat, lng).then((address) => {
        if (address) {
          setLocationText(address)
        }
      })
    } catch (err) {
      console.warn('Get location failed:', err)
      setIsFetchingLocation(false)
      setLocationText('GPS belum terdeteksi (Ketuk untuk coba lagi)')
    }
  }

  const stopCamera = () => {
    // 1. Pause video element dan bersihkan srcObject jika masih ada
    if (videoRef.current) {
      try {
        videoRef.current.pause()
      } catch (e) {}
      if (videoRef.current.srcObject) {
        try {
          const tracks = videoRef.current.srcObject.getTracks()
          if (tracks) {
            tracks.forEach((track) => {
              track.stop()
              track.enabled = false
            })
          }
        } catch (e) {}
        videoRef.current.srcObject = null
      }
    }
    // 2. Hentikan semua track di streamRef
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
          track.enabled = false
        })
      } catch (e) {
        console.warn('Error stopping streamRef tracks:', e)
      }
      streamRef.current = null
    }
    // 3. Hentikan semua track di state stream
    if (stream) {
      try {
        stream.getTracks().forEach((track) => {
          track.stop()
          track.enabled = false
        })
      } catch (e) {}
      setStream(null)
    }
  }

  const startCamera = async (mode) => {
    const requestId = ++cameraRequestIdRef.current
    setCameraError('')
    stopCamera()

    // Beri jeda 350ms agar hardware sensor Android/iOS dan Webview benar-benar bersih melepaskan lock
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (requestId !== cameraRequestIdRef.current) return

    let mediaStream = null
    const targetFacing = mode || facingMode || 'environment'

    const tryGetUserMedia = async (constraints, maxRetries = 2) => {
      let attempt = 0
      while (attempt <= maxRetries) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints)
        } catch (err) {
          attempt++
          if (attempt <= maxRetries && (err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.name === 'AbortError')) {
            // Hardware masih transisi dari sensor sebelumnya pada Android/iOS, beri jeda progresif
            await new Promise((res) => setTimeout(res, attempt * 350))
            if (requestId !== cameraRequestIdRef.current) return null
            continue
          }
          throw err
        }
      }
      return null
    }

    // Daftar strategi constraint dari yang paling kompatibel hingga fallback fleksibel
    // Khusus kamera depan ('user'), tidak memasang ukuran piksel tetap yang kaku agar tidak ditolak sensor selfie ponsel
    const constraintAttempts = [
      // 1. Constraint standar ideal facingMode (sangat kompatibel untuk kamera depan di Android WebView & iOS)
      { video: { facingMode: { ideal: targetFacing } }, audio: false },
      // 2. Constraint exact facingMode
      { video: { facingMode: targetFacing }, audio: false },
      // 3. Constraint resolusi proporsional
      {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: targetFacing === 'user' ? 720 : 1280 },
          height: { ideal: targetFacing === 'user' ? 1280 : 720 }
        },
        audio: false
      }
    ]

    for (const c of constraintAttempts) {
      try {
        mediaStream = await tryGetUserMedia(c)
        if (mediaStream) break
      } catch (e) {
        console.warn('Percobaan constraint kamera gagal, mencoba alternatif berikutnya:', e)
        await new Promise((res) => setTimeout(res, 200))
        if (requestId !== cameraRequestIdRef.current) return
      }
    }

    // 4. Jika masih belum berhasil, coba enumerasi perangkat fisik
    if (!mediaStream) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoDevices = devices.filter((d) => d.kind === 'videoinput')

        let targetDevice = null
        if (targetFacing === 'user') {
          targetDevice =
            videoDevices.find((d) => /front|user|depan|selfie|face|secondary/i.test(d.label)) ||
            (videoDevices.length > 1 && videoDevices.find((d, idx) => idx > 0 && !/back|rear|belakang|main/i.test(d.label))) ||
            (videoDevices.length > 1 ? videoDevices[videoDevices.length - 1] : videoDevices[0])
        } else {
          targetDevice =
            videoDevices.find((d) => /back|rear|environment|belakang|main/i.test(d.label)) ||
            videoDevices[0]
        }

        if (targetDevice && targetDevice.deviceId) {
          mediaStream = await tryGetUserMedia({
            video: { deviceId: { ideal: targetDevice.deviceId } },
            audio: false
          })
        }
      } catch (errDev) {
        console.warn('Percobaan enumerasi kamera fisik gagal:', errDev)
      }
    }

    // 5. Fallback pamungkas: General video constraint agar kamera tetap menyala tanpa error
    if (!mediaStream) {
      try {
        mediaStream = await tryGetUserMedia({ video: true, audio: false })
      } catch (errFinal) {
        console.error('Semua percobaan inisialisasi kamera gagal:', errFinal)
        if (requestId === cameraRequestIdRef.current) {
          setCameraError('Gagal mengakses kamera perangkat. Pastikan izin kamera telah diberikan di browser/aplikasi Anda.')
        }
        return
      }
    }

    if (requestId !== cameraRequestIdRef.current) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop())
      }
      return
    }

    if (mediaStream) {
      streamRef.current = mediaStream
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.warn)
        }
        videoRef.current.play().catch(console.warn)
      }
    }
  }

  // Helper Kembali ke Kamera tanpa Layar Hitam (Anti Blank Screen)
  const returnToCamera = () => {
    setIsReviewMode(false)
    const activeStream = streamRef.current || stream
    if (videoRef.current && activeStream && activeStream.active && activeStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      if (videoRef.current.srcObject !== activeStream) {
        videoRef.current.srcObject = activeStream
      }
      videoRef.current.play().catch(() => {
        startCamera(facingMode)
      })
    } else {
      startCamera(facingMode)
    }
  }

  const toggleCamera = async () => {
    if (isSwitchingCameraRef.current) return
    isSwitchingCameraRef.current = true
    setIsSwitchingCamera(true)
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    try {
      await startCamera(nextMode)
    } finally {
      setTimeout(() => {
        isSwitchingCameraRef.current = false
        setIsSwitchingCamera(false)
      }, 500)
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current) return
    setIsProcessing(true)

    const video = videoRef.current
    const canvas = document.createElement('canvas')

    // 1. Calculate Target Dimensions Based on Device Rotation (Landscape saat HP diputar 90 derajat)
    let effectiveAspectRatio = aspectRatio

    if (isLandscape) {
      if (aspectRatio === '3:4' || aspectRatio === '4:3') effectiveAspectRatio = '4:3'
      else if (aspectRatio === '9:16' || aspectRatio === '16:9') effectiveAspectRatio = '16:9'
      else if (aspectRatio !== '1:1') effectiveAspectRatio = '4:3'
    }

    let targetWidth = isLandscape ? 1280 : (video.videoWidth || 960)
    let targetHeight = isLandscape ? (effectiveAspectRatio === '16:9' ? 720 : 960) : (video.videoHeight || 1280)
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = video.videoWidth || (isLandscape ? 1280 : 960)
    let sourceHeight = video.videoHeight || (isLandscape ? 960 : 1280)

    if (effectiveAspectRatio === '1:1') {
      const minDim = Math.min(sourceWidth, sourceHeight)
      sourceX = (sourceWidth - minDim) / 2
      sourceY = (sourceHeight - minDim) / 2
      sourceWidth = minDim
      sourceHeight = minDim
      targetWidth = 1080
      targetHeight = 1080
    } else if (effectiveAspectRatio === '9:16') {
      if (sourceWidth > sourceHeight) {
        const calcWidth = Math.round((sourceHeight * 9) / 16)
        sourceX = Math.round((sourceWidth - calcWidth) / 2)
        sourceWidth = calcWidth
      } else {
        const calcHeight = Math.round((sourceWidth * 16) / 9)
        if (calcHeight <= sourceHeight) {
          sourceY = Math.round((sourceHeight - calcHeight) / 2)
          sourceHeight = calcHeight
        }
      }
      targetWidth = 1080
      targetHeight = 1920
    } else if (effectiveAspectRatio === '3:4') {
      if (sourceWidth > sourceHeight) {
        const calcWidth = Math.round((sourceHeight * 3) / 4)
        sourceX = Math.round((sourceWidth - calcWidth) / 2)
        sourceWidth = calcWidth
      }
      targetWidth = 960
      targetHeight = 1280
    } else if (effectiveAspectRatio === '4:3') {
      // Landscape 4:3
      if (sourceHeight > sourceWidth && !isVirtualLandscape) {
        const calcHeight = Math.round((sourceWidth * 3) / 4)
        sourceY = Math.round((sourceHeight - calcHeight) / 2)
        sourceHeight = calcHeight
      } else if (!isVirtualLandscape) {
        const calcWidth = Math.round((sourceHeight * 4) / 3)
        if (calcWidth <= sourceWidth) {
          sourceX = Math.round((sourceWidth - calcWidth) / 2)
          sourceWidth = calcWidth
        }
      }
      targetWidth = 1280
      targetHeight = 960
    } else if (effectiveAspectRatio === '16:9') {
      // Landscape 16:9
      if (!isVirtualLandscape) {
        const calcHeight = Math.round((sourceWidth * 9) / 16)
        if (calcHeight <= sourceHeight) {
          sourceY = Math.round((sourceHeight - calcHeight) / 2)
          sourceHeight = calcHeight
        }
      }
      targetWidth = 1280
      targetHeight = 720
    }

    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')

    // Muat logo sekolah jika ada (untuk template 'logo')
    let loadedSchoolLogo = null
    if (schoolLogo) {
      try {
        loadedSchoolLogo = await new Promise((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = schoolLogo
          setTimeout(() => resolve(null), 1800)
        })
      } catch {
        loadedSchoolLogo = null
      }
    }

    // Muat tile peta jika fitur tampilkan peta di timemark aktif
    let loadedMapImg = null
    if (showMapInTimemark) {
      try {
        const lat = geoData.latitude !== null ? geoData.latitude : -5.125379
        const lng = geoData.longitude !== null ? geoData.longitude : 119.530402
        loadedMapImg = await loadMapImage(lat, lng)
      } catch (mapErr) {
        console.warn('Gagal memuat tile peta, menggunakan fallback vector:', mapErr)
        loadedMapImg = null
      }
    }

    // Draw video frame to canvas with aspect ratio cropping
    if (isVirtualLandscape) {
      ctx.save()
      ctx.translate(targetWidth / 2, targetHeight / 2)
      const rotAngle = virtualRotationAngle === -90 ? 90 : -90
      ctx.rotate((rotAngle * Math.PI) / 180)
      if (facingMode === 'user') {
        ctx.scale(-1, 1)
      }
      const vW = video.videoWidth || 720
      const vH = video.videoHeight || 1280
      // Frame video diputar 90 derajat sehingga vH memetakan ke targetWidth dan vW memetakan ke targetHeight
      const scale = Math.max(targetWidth / vH, targetHeight / vW)
      const drawW = vW * scale
      const drawH = vH * scale
      ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()
    } else {
      if (facingMode === 'user') {
        ctx.translate(targetWidth, 0)
        ctx.scale(-1, 1)
        ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      } else {
        ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight)
      }
    }

    // Hitung Skala Proporsional Canvas (Memastikan ukuran watermark tetap kecil dan konsisten baik potret maupun landscape)
    const scaleMultiplier = getScaleMultiplier(watermarkScale)
    const referenceDim = isLandscape ? Math.min(targetWidth, targetHeight) : targetWidth
    const baseFactor = (referenceDim / (isLandscape ? 680 : 720)) * scaleMultiplier * (isLandscape ? 0.72 : 1.0)
    const mapW = Math.round(112 * baseFactor)
    const mapH = Math.round(84 * baseFactor)

    // Format Text
    const teacherName = profile?.full_name || user?.email?.split('@')[0] || 'Guru'
    const nipText = profile?.nip ? ` • NIP: ${profile.nip}` : ''
    const dayName = currentDateTime.toLocaleDateString('id-ID', { weekday: 'long' })
    const dateFormattedOnly = currentDateTime.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    const dateFormatted = `${dayName}, ${dateFormattedOnly}`
    const tzLabel = getTimeZoneLabel()
    const hoursMinutes = currentDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    const timeFormatted = `${currentDateTime.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })} ${tzLabel}`
    const displayTitle = (customTitle || schoolName || 'PRESENSIA').toUpperCase()
    const activeIcon = customIcon || '🎓'

    // Teks status presensi mengikuti apa yang diisi di menu pengaturan (merubah Hadir, Selesai, dll.)
    const displayStatus = customTitle.trim() || 'Hadir'
    const displayAddress = locationText
    const displayCompass = `${compassHeading}°${getCompassShortDir(compassHeading)}`
    const displayAltitude = geoData.altitude ? `${geoData.altitude} m` : '64.6 m'
    const displayCoords = formatCoordDecimalCard(geoData.latitude !== null ? geoData.latitude : -5.125379, geoData.longitude !== null ? geoData.longitude : 119.530402)

    // Helper: Gambar Logo Teks GammaraApp & Subjudul "100% foto asli" di Bagian Kanan Atas Foto
    const drawPanritaEduBrand = () => {
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)'
      ctx.shadowBlur = 6 * baseFactor
      ctx.shadowOffsetX = 1.5 * baseFactor
      ctx.shadowOffsetY = 1.5 * baseFactor

      const topMargin = 22 * baseFactor
      const rightMargin = targetWidth - (24 * baseFactor)

      const brandFontSize = Math.round(25 * baseFactor)
      ctx.font = `800 ${brandFontSize}px Poppins, sans-serif`
      const gammaraWidth = ctx.measureText('Gammara').width
      const appWidth = ctx.measureText('App').width
      const totalBrandWidth = gammaraWidth + appWidth

      const startBrandX = rightMargin - totalBrandWidth

      // Gambar "Gammara" (Putih Bersih di watermark foto)
      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('Gammara', startBrandX, topMargin)

      // Gambar "App" (Toska / Cyan Khas GammaraApp #00BEA5)
      ctx.fillStyle = '#00BEA5'
      ctx.fillText('App', startBrandX + gammaraWidth, topMargin)

      // Gambar Subjudul "100% foto asli"
      const subBrandFontSize = Math.round(13 * baseFactor)
      ctx.font = `500 ${subBrandFontSize}px Poppins, sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.textAlign = 'right'
      ctx.fillText('100% foto asli', rightMargin, topMargin + brandFontSize + (4 * baseFactor))

      ctx.restore()
    }

    // 2. Render Watermark Based on layoutTemplate ('panritaedu' | 'panrita_split' | 'geotag' | 'logo' | 'modern' | 'card' | 'academic' | 'stamp' | 'idbadge' | 'classic')
    if (layoutTemplate === 'panritaedu') {
      // ========================================================
      // TEMA PANRITAEDU (Badge Jam Kotak Gelap + Ceklis Oranye di Kiri Bawah)
      // ========================================================
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
      ctx.shadowBlur = 6 * baseFactor
      ctx.shadowOffsetX = 2 * baseFactor
      ctx.shadowOffsetY = 2 * baseFactor

      const leftX = 26 * baseFactor

      // 1. Badge Jam Kotak Membulat + Lingkaran Ceklis Oranye
      const timeFontSize = Math.round(36 * baseFactor)
      ctx.font = `900 ${timeFontSize}px Outfit, sans-serif`
      const timeTextWidth = ctx.measureText(hoursMinutes).width
      const checkCircleRadius = 14 * baseFactor
      const badgePaddingX = 14 * baseFactor
      const badgePaddingY = 8 * baseFactor
      const badgeWidth = timeTextWidth + (checkCircleRadius * 2) + (badgePaddingX * 2) + (10 * baseFactor)
      const badgeHeight = timeFontSize + (badgePaddingY * 2) + (4 * baseFactor)
      
      // Hitung teks detail alamat terlebih dahulu untuk penempatan presisi di kiri bawah
      const statusFontSize = Math.round(24 * baseFactor)
      const dateFontSize = Math.round(18 * baseFactor)
      const teacherFontSize = Math.round(16 * baseFactor)
      const addressFontSize = Math.round(15 * baseFactor)
      const textStartX = leftX + (14 * baseFactor)
      const maxAddrWidth = targetWidth - textStartX - (35 * baseFactor)
      const words = displayAddress.split(' ')
      let lines = []
      let tempLine = ''

      ctx.font = `normal ${addressFontSize}px Outfit, sans-serif`
      for (let w = 0; w < words.length; w++) {
        const testLine = tempLine ? `${tempLine} ${words[w]}` : words[w]
        if (ctx.measureText(testLine).width > maxAddrWidth && tempLine) {
          lines.push(tempLine)
          tempLine = words[w]
        } else {
          tempLine = testLine
        }
      }
      if (tempLine) lines.push(tempLine)

      // Hitung tinggi total aktual konten watermark di kiri bawah
      let detailContentHeight = statusFontSize + (6 * baseFactor) + dateFontSize + (6 * baseFactor)
      if (showTeacherName) detailContentHeight += teacherFontSize + (4 * baseFactor)
      detailContentHeight += lines.length * (addressFontSize + (4 * baseFactor))

      const mapSpacing = showMapInTimemark ? (mapH + (10 * baseFactor)) : 0
      const totalActualHeight = badgeHeight + (14 * baseFactor) + detailContentHeight + mapSpacing
      const bottomMargin = 20 * baseFactor
      const startBadgeY = targetHeight - totalActualHeight - bottomMargin + mapSpacing

      // Gambar Mini Map jika opsi aktif
      if (showMapInTimemark) {
        const mapX = leftX
        const mapY = startBadgeY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

      // Background Badge Jam (Kotak gelap rounded)
      ctx.fillStyle = 'rgba(38, 24, 18, 0.88)'
      ctx.beginPath()
      ctx.roundRect(leftX, startBadgeY, badgeWidth, badgeHeight, 10 * baseFactor)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1 * baseFactor
      ctx.stroke()

      // Teks Jam di dalam badge
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `900 ${timeFontSize}px Outfit, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(hoursMinutes, leftX + badgePaddingX, startBadgeY + (badgeHeight / 2))

      // Lingkaran Centang Oranye di samping jam
      const checkCenterX = leftX + badgePaddingX + timeTextWidth + (10 * baseFactor) + checkCircleRadius
      const checkCenterY = startBadgeY + (badgeHeight / 2)
      ctx.beginPath()
      ctx.arc(checkCenterX, checkCenterY, checkCircleRadius, 0, Math.PI * 2)
      ctx.fillStyle = '#F59E0B'
      ctx.fill()

      // Tanda Ceklis Putih di dalam lingkaran
      ctx.fillStyle = '#1E1B18'
      ctx.font = `bold ${Math.round(16 * baseFactor)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✓', checkCenterX, checkCenterY)

      // 2. Garis Aksen Vertikal Oranye & Detail Teks
      const lineX = leftX
      const lineStartY = startBadgeY + badgeHeight + (12 * baseFactor)
      let curTextY = lineStartY

      // 3. Teks Status (contoh: Selesai / Hadir)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${statusFontSize}px Outfit, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(displayStatus, textStartX, curTextY)
      curTextY += statusFontSize + (6 * baseFactor)

      // 4. Hari dan Tanggal Lengkap
      ctx.font = `600 ${dateFontSize}px Outfit, sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
      ctx.fillText(dateFormatted, textStartX, curTextY)
      curTextY += dateFontSize + (6 * baseFactor)

      // 5. Nama Guru
      if (showTeacherName) {
        ctx.font = `500 ${teacherFontSize}px Outfit, sans-serif`
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
        ctx.fillText(`Guru: ${teacherName}${nipText}`, textStartX, curTextY)
        curTextY += teacherFontSize + (4 * baseFactor)
      }

      // 6. Alamat Lengkap GPS
      ctx.font = `normal ${addressFontSize}px Outfit, sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
      for (let l = 0; l < lines.length; l++) {
        ctx.fillText(lines[l], textStartX, curTextY)
        curTextY += addressFontSize + (4 * baseFactor)
      }

      // Garis vertikal oranye di sebelah kiri blok teks detail
      const lineEndY = curTextY
      ctx.fillStyle = '#F59E0B'
      ctx.beginPath()
      ctx.roundRect(lineX, lineStartY, 4 * baseFactor, Math.max(30 * baseFactor, lineEndY - lineStartY), 2 * baseFactor)
      ctx.fill()

      ctx.restore()
    } else if (layoutTemplate === 'panrita_split') {
      // ========================================================
      // TEMA PANRITA SPLIT / JAM BESAR (Sesuai Foto Referensi 1 Pengguna)
      // ========================================================
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
      ctx.shadowBlur = 6 * baseFactor
      ctx.shadowOffsetX = 2 * baseFactor
      ctx.shadowOffsetY = 2 * baseFactor

      const leftX = 26 * baseFactor
      const bottomAreaY = targetHeight - (28 * baseFactor)

      // Ukuran font jam besar
      const bigTimeFontSize = Math.round(48 * baseFactor)
      ctx.font = `300 ${bigTimeFontSize}px Outfit, sans-serif`
      const bigTimeWidth = ctx.measureText(hoursMinutes).width

      // Garis oranye vertikal di samping jam
      const lineX = leftX + bigTimeWidth + (12 * baseFactor)
      const dateTextStartX = lineX + (12 * baseFactor)
      
      // Hitung posisi vertikal dari bawah
      const addressFontSize = Math.round(15 * baseFactor)
      const dateRowFontSize = Math.round(16 * baseFactor)
      const mapSpacing = showMapInTimemark ? (mapH + (10 * baseFactor)) : 0
      const splitHeight = bigTimeFontSize + (40 * baseFactor) + mapSpacing
      const startSplitY = targetHeight - splitHeight - (24 * baseFactor) + mapSpacing

      // Gambar Mini Map jika aktif
      if (showMapInTimemark) {
        const mapX = leftX
        const mapY = startSplitY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

      // 1. Gambar Jam Besar di Kiri
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `300 ${bigTimeFontSize}px Outfit, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(hoursMinutes, leftX, startSplitY)

      // 2. Gambar Garis Vertikal Oranye
      ctx.fillStyle = '#EA580C'
      ctx.beginPath()
      ctx.roundRect(lineX, startSplitY + (4 * baseFactor), 3.5 * baseFactor, bigTimeFontSize - (4 * baseFactor), 2 * baseFactor)
      ctx.fill()

      // 3. Tanggal (Atas) dan Hari (Bawah) di Samping Kanan Garis
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `600 ${dateRowFontSize}px Outfit, sans-serif`
      ctx.fillText(dateFormattedOnly, dateTextStartX, startSplitY + (4 * baseFactor))
      ctx.fillText(dayName, dateTextStartX, startSplitY + dateRowFontSize + (8 * baseFactor))

      // 4. Alamat Lengkap di Bawah Jam & Tanggal
      let addrY = startSplitY + bigTimeFontSize + (12 * baseFactor)
      ctx.font = `500 ${addressFontSize}px Outfit, sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      
      const maxAddrWidth = targetWidth - leftX - (35 * baseFactor)
      const words = displayAddress.split(' ')
      let currentLine = ''
      
      for (let w = 0; w < words.length; w++) {
        const testLine = currentLine ? `${currentLine} ${words[w]}` : words[w]
        const testWidth = ctx.measureText(testLine).width
        if (testWidth > maxAddrWidth && currentLine) {
          ctx.fillText(currentLine, leftX, addrY)
          addrY += addressFontSize + (4 * baseFactor)
          currentLine = words[w]
        } else {
          currentLine = testLine
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, leftX, addrY)
        addrY += addressFontSize + (4 * baseFactor)
      }

      // Garis horizontal tipis pembatas di bawah alamat
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 1 * baseFactor
      ctx.beginPath()
      ctx.moveTo(leftX, addrY + (4 * baseFactor))
      ctx.lineTo(leftX + Math.min(360 * baseFactor, targetWidth - (60 * baseFactor)), addrY + (4 * baseFactor))
      ctx.stroke()

      ctx.restore()
    } else if (layoutTemplate === 'geotag') {
      // ========================================================
      // TEMA GEOTAG RESMI (Sesuai Foto Referensi 2 Pengguna)
      // ========================================================
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'
      ctx.shadowBlur = 6 * baseFactor
      ctx.shadowOffsetX = 1.5 * baseFactor
      ctx.shadowOffsetY = 1.5 * baseFactor

      // ----------------------------------------------------
      // A. HEADER KIRI ATAS: BADGE KOMPAS + ELEVASI + KOORDINAT
      // ----------------------------------------------------
      const topX = 22 * baseFactor
      const topY = 20 * baseFactor

      // 1. Badge Kompas Oranye Kemerahan (Contoh: 🧭 227°SW)
      const compassBadgeFontSize = Math.round(15 * baseFactor)
      ctx.font = `bold ${compassBadgeFontSize}px Outfit, sans-serif`
      const compassFullText = `🧭 ${displayCompass}`
      const compTextWidth = ctx.measureText(compassFullText).width
      const compBadgeW = compTextWidth + (16 * baseFactor)
      const compBadgeH = compassBadgeFontSize + (10 * baseFactor)

      ctx.fillStyle = '#EA580C' // Oranye Khas Timemark
      ctx.beginPath()
      ctx.roundRect(topX, topY, compBadgeW, compBadgeH, 5 * baseFactor)
      ctx.fill()

      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(compassFullText, topX + (8 * baseFactor), topY + (compBadgeH / 2))

      // 2. Simbol Elevasi Segitiga / Piramida di Samping Kanan Kompas (Contoh: ▲ 64.6 m)
      const altX = topX + compBadgeW + (12 * baseFactor)
      ctx.font = `bold ${Math.round(15 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(`▲ ${displayAltitude}`, altX, topY + (compBadgeH / 2))

      // 3. Baris Kedua Kiri Atas: Ikon Pin + Koordinat Presisi (Contoh: 📍 5.125379°S, 119.530402°E)
      const coordY = topY + compBadgeH + (12 * baseFactor)
      ctx.font = `bold ${Math.round(15 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'top'
      ctx.fillText(`📍 ${displayCoords}`, topX, coordY)

      if (showMapInTimemark) {
        const mapX = topX
        const mapY = coordY + (24 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

      // ----------------------------------------------------
      // B. KONTEN KIRI BAWAH: GARIS ORANYE + WAKTU + ALAMAT LENGKAP
      // ----------------------------------------------------
      const bottomX = 24 * baseFactor
      const lineThickness = 4 * baseFactor
      const textStartX = bottomX + lineThickness + (12 * baseFactor)

      // Baris 1: Hari, Tanggal Bulan Tahun Jam:Menit (Contoh: Sabtu, 10 Oktober 2026 12:08)
      const geoDateText = `${dayName}, ${dateFormattedOnly} ${hoursMinutes}`
      const dateFontSize = Math.round(18 * baseFactor)
      const addressFontSize = Math.round(15 * baseFactor)

      // Estimasi tinggi teks untuk posisi garis
      const maxAddrWidth = targetWidth - textStartX - (35 * baseFactor)
      const words = displayAddress.split(' ')
      let lines = []
      let tempLine = ''
      for (let w = 0; w < words.length; w++) {
        const test = tempLine ? `${tempLine} ${words[w]}` : words[w]
        if (ctx.measureText(test).width > maxAddrWidth && tempLine) {
          lines.push(tempLine)
          tempLine = words[w]
        } else {
          tempLine = test
        }
      }
      if (tempLine) lines.push(tempLine)

      const totalContentH = dateFontSize + (6 * baseFactor) + (lines.length * (addressFontSize + (4 * baseFactor)))
      const startBottomY = targetHeight - totalContentH - (24 * baseFactor)

      // Gambar Garis Oranye Vertikal
      ctx.fillStyle = '#EA580C'
      ctx.beginPath()
      ctx.roundRect(bottomX, startBottomY, lineThickness, totalContentH, 2 * baseFactor)
      ctx.fill()

      // Teks Tanggal & Jam
      let curTextY = startBottomY
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `bold ${dateFontSize}px Outfit, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(geoDateText, textStartX, curTextY)
      curTextY += dateFontSize + (6 * baseFactor)

      // Teks Alamat Lengkap
      ctx.font = `500 ${addressFontSize}px Outfit, sans-serif`
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      for (let l = 0; l < lines.length; l++) {
        ctx.fillText(lines[l], textStartX, curTextY)
        curTextY += addressFontSize + (4 * baseFactor)
      }

      ctx.restore()
    } else if (layoutTemplate === 'logo') {
      // ========================================================
      // TEMA LOGO SEKOLAH (MENAMPILKAN LOGO SEKOLAH RESMI)
      // ========================================================
      ctx.save()
      const boxWidth = Math.min(targetWidth - (36 * baseFactor), 640 * baseFactor)
      const boxHeight = (showTeacherName ? 180 : 155) * baseFactor
      const boxX = 18 * baseFactor
      const boxY = targetHeight - boxHeight - (22 * baseFactor)

      if (showMapInTimemark) {
        const mapX = boxX
        const mapY = boxY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

      // Background Card Mewah
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)'
      ctx.beginPath()
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16 * baseFactor)
      ctx.fill()
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)'
      ctx.lineWidth = 2 * baseFactor
      ctx.stroke()

      // Area Logo Sekolah di Sebelah Kiri
      const logoBoxSize = 72 * baseFactor
      const logoBoxX = boxX + (16 * baseFactor)
      const logoBoxY = boxY + (boxHeight - logoBoxSize) / 2

      if (loadedSchoolLogo) {
        // Kotak putih bersih tempat logo
        ctx.fillStyle = '#FFFFFF'
        ctx.beginPath()
        ctx.roundRect(logoBoxX, logoBoxY, logoBoxSize, logoBoxSize, 12 * baseFactor)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
        ctx.lineWidth = 1 * baseFactor
        ctx.stroke()

        // Gambar gambar logo sekolah
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(logoBoxX + (4 * baseFactor), logoBoxY + (4 * baseFactor), logoBoxSize - (8 * baseFactor), logoBoxSize - (8 * baseFactor), 8 * baseFactor)
        ctx.clip()
        ctx.drawImage(loadedSchoolLogo, logoBoxX + (4 * baseFactor), logoBoxY + (4 * baseFactor), logoBoxSize - (8 * baseFactor), logoBoxSize - (8 * baseFactor))
        ctx.restore()
      } else {
        // Fallback: Emblem Bulat Emas dengan Ikon Sekolah
        ctx.beginPath()
        ctx.arc(logoBoxX + (logoBoxSize / 2), logoBoxY + (logoBoxSize / 2), logoBoxSize / 2, 0, Math.PI * 2)
        ctx.fillStyle = '#D97706'
        ctx.fill()
        ctx.strokeStyle = '#FDE047'
        ctx.lineWidth = 2 * baseFactor
        ctx.stroke()

        ctx.font = `${Math.round(32 * baseFactor)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('🏫', logoBoxX + (logoBoxSize / 2), logoBoxY + (logoBoxSize / 2))
      }

      // Konten Teks di Samping Kanan Logo
      const contentStartX = logoBoxX + logoBoxSize + (16 * baseFactor)
      let curY = boxY + (16 * baseFactor)
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'

      // 1. Nama Sekolah Resmi
      ctx.font = `bold ${Math.round(20 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#FDE047'
      ctx.fillText(displayTitle, contentStartX, curY)
      curY += 26 * baseFactor

      // 2. Guru / Pendidik
      if (showTeacherName) {
        ctx.font = `bold ${Math.round(16 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(`👤 ${teacherName}${nipText}`, contentStartX, curY)
        curY += 24 * baseFactor
      }

      // 3. Waktu & Tanggal
      ctx.font = `${Math.round(15 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#E2E8F0'
      ctx.fillText(`📅 ${dateFormatted} | ⏰ ${timeFormatted}`, contentStartX, curY)
      curY += 22 * baseFactor

      // 4. Alamat GPS
      ctx.font = `${Math.round(14 * baseFactor)}px Outfit, sans-serif`
      ctx.fillStyle = '#94A3B8'
      const maxW = boxWidth - (logoBoxSize + (42 * baseFactor))
      const words = locationText.split(' ')
      let line = ''
      for (let w = 0; w < words.length; w++) {
        const test = line ? `${line} ${words[w]}` : words[w]
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(`📍 ${line}`, contentStartX, curY)
          curY += 18 * baseFactor
          line = words[w]
          break
        } else {
          line = test
        }
      }
      if (line) {
        ctx.fillText(`📍 ${line}`, contentStartX, curY)
        curY += 18 * baseFactor
      }

      if (customNote.trim()) {
        ctx.font = `italic ${Math.round(13 * baseFactor)}px Outfit, sans-serif`
        ctx.fillStyle = '#38BDF8'
        ctx.fillText(`📝 ${customNote.trim()}`, contentStartX, curY)
      }

      ctx.restore()
    } else if (layoutTemplate === 'card') {
      // TEMA BADGE / KARTU (Box Mengambang Kanan Bawah)
      const boxWidth = Math.min(targetWidth - (30 * baseFactor), Math.round(500 * baseFactor))
      const boxHeight = Math.round((showTeacherName ? 160 : 130) * baseFactor)
      const boxX = targetWidth - boxWidth - (20 * baseFactor)
      const boxY = targetHeight - boxHeight - (20 * baseFactor)

      if (showMapInTimemark) {
        const mapX = boxX
        const mapY = boxY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

      if (showMapInTimemark) {
        const mapX = boxX
        const mapY = boxY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

      if (showMapInTimemark) {
        const mapX = boxX
        const mapY = boxY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

      if (showMapInTimemark) {
        const mapX = boxX
        const mapY = boxY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

      if (showMapInTimemark) {
        const mapX = 28 * baseFactor
        const mapY = curY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

      if (showMapInTimemark) {
        const mapX = 20 * baseFactor
        const mapY = overlayY - mapH - (8 * baseFactor)
        drawCanvasMiniMap(ctx, mapX, mapY, mapW, mapH, loadedMapImg, baseFactor)
      }

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

    // Render Watermark PanritaEdu ("PanritaEdu" & "100% foto asli") di Pojok Kanan Atas untuk SEMUA TEMPLATE
    drawPanritaEduBrand()

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    setIsFlashActive(true)
    setTimeout(() => setIsFlashActive(false), 120)

    const newPhoto = { id: Date.now(), dataUrl, timestamp: getSecureServerDate() }
    setCapturedPhotos((prev) => {
      const nextList = [...prev, newPhoto]
      if (nextList.length >= 10) {
        setIsReviewMode(true)
        setSelectedPhotoIndex(9)
      } else {
        setSelectedPhotoIndex(nextList.length - 1)
      }
      return nextList
    })
    setIsProcessing(false)
  }

  const downloadPhoto = async () => {
    if (!activePhoto) return
    try {
      if (Capacitor.isNativePlatform()) {
        const fileName = `Dokumentasi_Timemark_${Date.now()}.jpg`
        const base64Data = activePhoto.dataUrl.includes('base64,')
          ? activePhoto.dataUrl.split('base64,')[1]
          : activePhoto.dataUrl

        let savedToGallery = false
        try {
          const { registerPlugin } = await import('@capacitor/core')
          const SecurityLocation = registerPlugin('SecurityLocation')
          if (SecurityLocation && SecurityLocation.saveImageToGallery) {
            await SecurityLocation.saveImageToGallery({
              base64: base64Data,
              fileName: fileName
            })
            savedToGallery = true
          }
        } catch (pluginErr) {
          console.warn('SecurityLocation.saveImageToGallery fallback:', pluginErr)
        }

        if (!savedToGallery) {
          try {
            await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Documents
            })
          } catch {
            await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Cache
            })
          }
        }

        alert('Foto berhasil disimpan ke Galeri perangkat Anda!')
        return
      }

      // Web fallback
      const link = document.createElement('a')
      link.href = activePhoto.dataUrl
      link.download = `Dokumentasi_Timemark_${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Error downloading photo:', err)
      const link = document.createElement('a')
      link.href = activePhoto.dataUrl
      link.download = `Dokumentasi_Timemark_${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const sharePhoto = async () => {
    if (!activePhoto) return
    try {
      if (Capacitor.isNativePlatform()) {
        const fileName = `Timemark_${Date.now()}.jpg`
        const base64Data = activePhoto.dataUrl.includes('base64,')
          ? activePhoto.dataUrl.split('base64,')[1]
          : activePhoto.dataUrl

        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        })

        await Share.share({
          title: 'Dokumentasi Presensia',
          text: `Dokumentasi Kegiatan Guru: ${profile?.full_name || 'Guru'} - ${schoolName}`,
          url: savedFile.uri,
          dialogTitle: 'Bagikan Hasil Foto Timemark'
        })
        return
      }

      // Web fallback
      const res = await fetch(activePhoto.dataUrl)
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
      console.error('Error sharing photo:', err)
      downloadPhoto()
    }
  }

  const handleDeletePhoto = (indexToDelete) => {
    setCapturedPhotos((prev) => {
      const updated = prev.filter((_, idx) => idx !== indexToDelete)
      if (updated.length === 0) {
        returnToCamera()
        setSelectedPhotoIndex(0)
      } else {
        setSelectedPhotoIndex((curr) => Math.min(curr, updated.length - 1))
      }
      return updated
    })
  }

  // Render Mini Map Preview Widget di Layar Kamera Langsung (Terpusat Presisi pada Koordinat GPS)
  const renderPreviewMiniMap = (customStyle = {}) => {
    if (!showMapInTimemark) return null
    const lat = geoData.latitude !== null ? geoData.latitude : -5.125379
    const lng = geoData.longitude !== null ? geoData.longitude : 119.530402
    const pos = getExactTilePosition(lat, lng, 17)
    const boxW = isLandscape ? 68 : 76
    const boxH = isLandscape ? 52 : 58
    const tileDisplaySize = 128

    return (
      <div
        style={{
          width: `${boxW}px`,
          height: `${boxH}px`,
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          border: '1.5px solid rgba(255, 255, 255, 0.75)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.6)',
          background: '#1E293B',
          marginBottom: '5px',
          flexShrink: 0,
          alignSelf: 'flex-start',
          pointerEvents: 'none',
          ...customStyle
        }}
      >
        {pos ? (
          <div
            style={{
              position: 'absolute',
              width: `${tileDisplaySize * 2}px`,
              height: `${tileDisplaySize * 2}px`,
              left: `${Math.round(boxW / 2 - pos.normX * tileDisplaySize)}px`,
              top: `${Math.round(boxH / 2 - pos.normY * tileDisplaySize)}px`,
              pointerEvents: 'none'
            }}
          >
            {pos.tiles.map((t) => {
              const primaryUrl = getSingleTileUrl(t.x, t.y, pos.zoom)
              const fallbackUrl = getSingleFallbackTileUrl(t.x, t.y, pos.zoom)
              return (
                <img
                  key={`${pos.zoom}-${t.x}-${t.y}`}
                  src={primaryUrl}
                  alt="Tile Peta"
                  style={{
                    position: 'absolute',
                    left: `${t.dx * tileDisplaySize}px`,
                    top: `${t.dy * tileDisplaySize}px`,
                    width: `${tileDisplaySize}px`,
                    height: `${tileDisplaySize}px`,
                    display: 'block',
                    objectFit: 'cover'
                  }}
                  onError={(e) => {
                    if (fallbackUrl && e.currentTarget.src !== fallbackUrl) {
                      e.currentTarget.src = fallbackUrl
                    } else {
                      e.currentTarget.style.display = 'none'
                    }
                  }}
                />
              )
            })}
          </div>
        ) : null}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }}
        >
          <MapPin size={15} color="#EF4444" fill="#EF4444" />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '2px',
            left: '3px',
            background: 'rgba(15, 23, 42, 0.88)',
            padding: '1px 3px',
            borderRadius: '3px',
            fontSize: '7.5px',
            color: '#38BDF8',
            fontWeight: 'bold',
            lineHeight: 1
          }}
        >
          MAP
        </div>
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: isVirtualLandscape ? `${windowDimensions.height}px` : '100vw',
        height: isVirtualLandscape ? `${windowDimensions.width}px` : '100vh',
        transformOrigin: 'top left',
        transform: isVirtualLandscape
          ? virtualRotationAngle === -90
            ? `translate(0, ${windowDimensions.height}px) rotate(-90deg)`
            : `translate(${windowDimensions.width}px, 0) rotate(90deg)`
          : 'none',
        background: '#0F172A',
        zIndex: 9999,
        display: 'flex',
        flexDirection: isLandscape ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: isLandscape ? 'center' : 'space-between',
        padding: isLandscape ? '0.4rem 0.6rem' : '1rem',
        gap: isLandscape ? '0.6rem' : '0',
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* Tombol Header saat Landscape (Floating di Kiri Atas / Kanan Atas) atau Header Standar saat Portrait */}
      {!isLandscape ? (
        <div style={{ width: '100%', maxWidth: '480px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <Camera size={22} color="#38BDF8" />
            <span style={{ fontWeight: '600', fontSize: '1rem' }}>Kamera GTag</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Tombol Segarkan GPS */}
            <button
              onClick={fetchLocation}
              title="Perbarui sinyal GPS & lokasi"
              disabled={isFetchingLocation}
              style={{
                background: isFetchingLocation ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                color: isFetchingLocation ? '#38BDF8' : 'white',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={17} style={{ animation: isFetchingLocation ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Tombol Pengaturan Desain */}
            <button
              onClick={() => setIsEditingTitle(!isEditingTitle)}
              title="Pengaturan Watermark"
              style={{
                background: isEditingTitle ? '#38BDF8' : 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Settings size={18} />
            </button>

            {/* Tombol Tutup */}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
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
      ) : (
        /* Floating Header Action Buttons in Landscape */
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '16px',
            right: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 30,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'white',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: '4px 10px',
              borderRadius: '20px',
              backdropFilter: 'blur(6px)'
            }}
          >
            <Camera size={16} color="#38BDF8" />
            <span style={{ fontWeight: '600', fontSize: '0.8rem' }}>Kamera GTag</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
            {/* Tombol Segarkan GPS Landscape */}
            <button
              onClick={fetchLocation}
              title="Perbarui sinyal GPS & lokasi"
              disabled={isFetchingLocation}
              style={{
                background: isFetchingLocation ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: isFetchingLocation ? '#38BDF8' : 'white',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)'
              }}
            >
              <RefreshCw size={15} style={{ animation: isFetchingLocation ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            <button
              onClick={() => setIsEditingTitle(!isEditingTitle)}
              title="Pengaturan Watermark"
              style={{
                background: isEditingTitle ? '#38BDF8' : 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)'
              }}
            >
              <Settings size={16} />
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                borderRadius: '50%',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                backdropFilter: 'blur(6px)'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal Dialog (Floating Center Modal dengan Backdrop Overlay agar Tampilan Tidak Terpotong) */}
      {isEditingTitle && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            boxSizing: 'border-box'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditingTitle(false)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: isLandscape ? '92%' : '85vh',
              overflowY: 'auto',
              background: '#1E293B',
              border: '1.5px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '20px',
              padding: '1.25rem',
              boxSizing: 'border-box',
              color: 'white',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.6rem' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚙️ Pengaturan Desain & Watermark
              </span>
              <button
                onClick={() => setIsEditingTitle(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'block', marginBottom: '0.35rem', fontWeight: '500' }}>
                Judul Timemark / Status Presensi (Merubah teks Hadir, Selesai, dll.)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Contoh: Selesai / Hadir / SMKN 1 MAKASSAR"
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
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
                padding: '0.6rem 0',
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

            <div
              onClick={handleToggleShowMap}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                padding: '0.6rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <span style={{ fontSize: '0.85rem' }}>🗺️ Tampilkan Peta Mini di Watermark</span>
              {showMapInTimemark ? (
                <CheckSquare size={20} color="#10B981" />
              ) : (
                <Square size={20} color="#94A3B8" />
              )}
            </div>

            {/* Rasio Foto (3:4, 9:16, 1:1, 16:9) */}
            <div style={{ marginTop: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'block', marginBottom: '0.45rem', fontWeight: '500' }}>
                📐 Rasio Foto (Ukuran Bingkai)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
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
                      padding: '0.5rem 0.1rem',
                      borderRadius: '8px',
                      border: aspectRatio === r.id ? '1px solid #38BDF8' : '1px solid #475569',
                      background: aspectRatio === r.id ? '#0284C7' : '#0F172A',
                      color: 'white',
                      fontSize: '0.75rem',
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
            <div style={{ marginTop: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'block', marginBottom: '0.45rem', fontWeight: '500' }}>
                🔍 Ukuran Watermark (Perbesar Teks)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
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
                      padding: '0.5rem 0.1rem',
                      borderRadius: '8px',
                      border: watermarkScale === s.id ? '1px solid #F59E0B' : '1px solid #475569',
                      background: watermarkScale === s.id ? '#D97706' : '#0F172A',
                      color: 'white',
                      fontSize: '0.75rem',
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
            <div style={{ marginTop: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'block', marginBottom: '0.45rem', fontWeight: '500' }}>
                ✨ Pilihan Ikon Watermark
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
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
                      padding: '0.45rem 0.2rem',
                      borderRadius: '8px',
                      border: customIcon === item.icon ? '1px solid #10B981' : '1px solid #475569',
                      background: customIcon === item.icon ? '#059669' : '#0F172A',
                      color: 'white',
                      fontSize: '1.05rem',
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

            {/* Template Layout Watermark */}
            <div style={{ marginTop: '0.85rem', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'block', marginBottom: '0.45rem', fontWeight: '500' }}>
                🎨 Desain Watermark (Tema Cetak)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                {[
                  { id: 'panritaedu', label: '⭐ GammaraApp' },
                  { id: 'panrita_split', label: '⭐ Gammara Split' },
                  { id: 'geotag', label: '🧭 Geo Tag' },
                  { id: 'logo', label: '🏫 Logo Sekolah' },
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
                      padding: '0.55rem 0.2rem',
                      borderRadius: '8px',
                      border: layoutTemplate === t.id ? '1px solid #38BDF8' : '1px solid #475569',
                      background: layoutTemplate === t.id ? '#0284C7' : '#0F172A',
                      color: 'white',
                      fontSize: '0.75rem',
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

            <button
              onClick={() => setIsEditingTitle(false)}
              style={{
                width: '100%',
                marginTop: '1rem',
                padding: '0.65rem',
                background: '#0284C7',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              ✓ Simpan & Tutup Pengaturan
            </button>
          </div>
        </div>
      )}

      {/* Camera Viewfinder / Preview */}
      <div
        ref={viewfinderRef}
        style={{
          position: 'relative',
          flex: isLandscape ? '1 1 auto' : 'none',
          width: isLandscape ? 'calc(100% - 100px)' : '100%',
          maxWidth: isLandscape ? 'none' : '480px',
          height: isLandscape ? 'calc(100% - 8px)' : 'auto',
          aspectRatio: isLandscape
            ? (aspectRatio === '16:9' ? '16 / 9' : aspectRatio === '1:1' ? '1 / 1' : '4 / 3')
            : (aspectRatio === '1:1' ? '1 / 1' : aspectRatio === '16:9' ? '16 / 9' : aspectRatio === '9:16' ? '9 / 16' : '3 / 4'),
          maxHeight: isLandscape ? '100%' : (aspectRatio === '9:16' ? '64vh' : '58vh'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: isLandscape ? '16px' : '24px',
          overflow: 'hidden',
          background: '#000',
          margin: isLandscape ? '0' : '0.5rem 0',
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
        ) : (
          <>
            {/* Video element dipasang permanen di DOM (Anti blank screen) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={
                isVirtualLandscape
                  ? {
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: vfSize.height ? `${vfSize.height}px` : '100%',
                      height: vfSize.width ? `${vfSize.width}px` : '100%',
                      objectFit: 'cover',
                      transform: `translate(-50%, -50%) rotate(${virtualRotationAngle === -90 ? 90 : -90}deg)${facingMode === 'user' ? ' scaleX(-1)' : ''}`,
                      display: isReviewMode && activePhoto ? 'none' : 'block'
                    }
                  : {
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                      display: isReviewMode && activePhoto ? 'none' : 'block'
                    }
              }
            />

            {isReviewMode && activePhoto ? (
              <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={activePhoto.dataUrl} alt={`Captured ${selectedPhotoIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />

                {/* Badge Urutan Foto Terpilih */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '14px',
                    background: 'rgba(15, 23, 42, 0.88)',
                    border: '1px solid rgba(245, 158, 11, 0.6)',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    color: '#FDE047',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backdropFilter: 'blur(8px)',
                    zIndex: 30
                  }}
                >
                  Foto #{selectedPhotoIndex + 1} dari {capturedPhotos.length}
                </div>

                {/* Filmstrip Barisan Thumbnail Multi-Shot di Bawah Viewfinder */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '10px',
                    right: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: capturedPhotos.length > 5 ? 'flex-start' : 'center',
                    gap: '8px',
                    background: 'rgba(15, 23, 42, 0.88)',
                    backdropFilter: 'blur(10px)',
                    padding: '6px 10px',
                    borderRadius: '16px',
                    overflowX: 'auto',
                    zIndex: 35,
                    border: '1px solid rgba(255,255,255,0.15)'
                  }}
                >
                  {capturedPhotos.map((p, idx) => {
                    const isSelected = selectedPhotoIndex === idx
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPhotoIndex(idx)}
                        style={{
                          position: 'relative',
                          width: isSelected ? '52px' : '42px',
                          height: isSelected ? '52px' : '42px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: isSelected ? '2.5px solid #F59E0B' : '1px solid rgba(255,255,255,0.3)',
                          boxShadow: isSelected ? '0 0 10px rgba(245, 158, 11, 0.7)' : 'none',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <img src={p.dataUrl} alt={`Thumb ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '2px',
                            right: '2px',
                            background: isSelected ? '#F59E0B' : 'rgba(0,0,0,0.7)',
                            color: isSelected ? '#1E1B18' : 'white',
                            fontSize: '9px',
                            fontWeight: '800',
                            padding: '1px 3px',
                            borderRadius: '3px'
                          }}
                        >
                          #{idx + 1}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Shutter Flash Animation Effect */}
                {isFlashActive && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: '#FFFFFF',
                      zIndex: 60,
                      pointerEvents: 'none'
                    }}
                  />
                )}

                {/* Badge Counter Jepretan Saat Mode Live Camera */}
                {capturedPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsReviewMode(true)}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: '14px',
                      background: 'rgba(15, 23, 42, 0.88)',
                      border: '1px solid #F59E0B',
                      borderRadius: '20px',
                      padding: '4px 12px',
                      color: '#FDE047',
                      fontSize: '0.78rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backdropFilter: 'blur(8px)',
                      cursor: 'pointer',
                      zIndex: 25,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}
                  >
                    📸 {capturedPhotos.length}/10 Foto (Lihat)
                  </button>
                )}

            {/* Header Kanan Atas: Logo GammaraApp + 100% foto asli (Live Preview, Ukuran Pas & Jelas) */}
            <div
              style={{
                position: 'absolute',
                top: '14px',
                right: '16px',
                textAlign: 'right',
                textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                pointerEvents: 'none'
              }}
            >
              <div style={{ fontSize: '1.25rem', lineHeight: '1.1', fontWeight: '800', fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.035em' }}>
                <span style={{ color: '#FFFFFF', fontWeight: '800' }}>Gammara</span>
                <span style={{ color: '#00BEA5', fontWeight: '800' }}>App</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.95)', fontWeight: '500', marginTop: '2px' }}>
                100% foto asli
              </div>
            </div>

            {/* Live Watermark Preview Pill disesuaikan dengan template & ukuran */}
            {layoutTemplate === 'panritaedu' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '16px',
                  right: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                {/* Badge Jam Kotak + Lingkaran Ceklis Oranye */}
                <div
                  style={{
                    background: 'rgba(38, 24, 18, 0.88)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    alignSelf: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#FFFFFF', letterSpacing: '-0.5px' }}>
                    {currentDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#F59E0B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1E1B18',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  >
                    ✓
                  </div>
                </div>

                {/* Blok Teks dengan Garis Vertikal Oranye di Samping Kiri */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
                  <div style={{ width: '3.5px', background: '#F59E0B', borderRadius: '3px', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#FFFFFF' }}>
                      {customTitle.trim() || customNote.trim() || 'Hadir'}
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'rgba(255,255,255,0.95)' }}>
                      {currentDateTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    {showTeacherName && (
                      <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.85)' }}>
                        Guru: {profile?.full_name || user?.email?.split('@')[0] || 'Guru'}
                      </div>
                    )}
                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.88)', lineHeight: '1.3' }}>
                      {locationText}
                    </div>
                  </div>
                </div>
              </div>
            ) : layoutTemplate === 'panrita_split' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '16px',
                  right: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                {/* Jam Besar + Garis Oranye + Tanggal Hari */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: '300', color: '#FFFFFF', letterSpacing: '-1px' }}>
                    {currentDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div style={{ width: '3px', height: '36px', background: '#EA580C', borderRadius: '2px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.7rem', fontWeight: '600', color: '#FFFFFF' }}>
                    <span>{currentDateTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    <span>{currentDateTime.toLocaleDateString('id-ID', { weekday: 'long' })}</span>
                  </div>
                </div>
                {/* Alamat di Bawah Jam */}
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.92)', lineHeight: '1.3' }}>
                  {locationText}
                </div>
                <div style={{ width: '60%', height: '1px', background: 'rgba(255,255,255,0.3)', marginTop: '2px' }} />
              </div>
            ) : layoutTemplate === 'geotag' ? (
              <>
                {/* KIRI ATAS: BADGE KOMPAS + ELEVASI + KOORDINAT */}
                <div
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        background: '#EA580C',
                        color: 'white',
                        fontWeight: 'bold',
                        fontSize: '0.68rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                      }}
                    >
                      🧭 {compassHeading}°{getCompassShortDir(compassHeading)}
                    </div>
                    <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.68rem' }}>
                      ▲ {geoData.altitude ? `${geoData.altitude} m` : '64.6 m'}
                    </div>
                  </div>
                  <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.68rem' }}>
                    📍 {formatCoordDecimalCard(geoData.latitude !== null ? geoData.latitude : -5.125379, geoData.longitude !== null ? geoData.longitude : 119.530402)}
                  </div>
                  {renderPreviewMiniMap({ marginTop: '4px' })}
                </div>

                {/* KIRI BAWAH: GARIS ORANYE + WAKTU + ALAMAT */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '16px',
                    left: '16px',
                    right: '16px',
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '8px',
                    textShadow: '0 2px 6px rgba(0,0,0,0.95)',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ width: '3.5px', background: '#EA580C', borderRadius: '2px', flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#FFFFFF' }}>
                      {currentDateTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} {currentDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.92)', lineHeight: '1.3' }}>
                      {locationText}
                    </div>
                  </div>
                </div>
              </>
            ) : layoutTemplate === 'logo' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  right: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.92)',
                    border: '1.5px solid rgba(245, 158, 11, 0.6)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  {schoolLogo ? (
                    <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#FFF', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      <img src={schoolLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                      🏫
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 'bold', color: '#FDE047', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                    </div>
                    {showTeacherName && (
                      <div style={{ fontSize: '0.7rem', color: '#FFFFFF' }}>
                        👤 {profile?.full_name || 'Guru'}
                      </div>
                    )}
                    <div style={{ fontSize: '0.65rem', color: '#E2E8F0' }}>
                      📅 {currentDateTime.toLocaleDateString('id-ID')} • ⏰ {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      📍 {locationText}
                    </div>
                  </div>
                </div>
              </div>
            ) : layoutTemplate === 'card' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  maxWidth: '80%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap({ alignSelf: 'flex-end' })}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.92)',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    borderLeft: '4px solid #10B981',
                    borderRadius: '12px',
                    padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : watermarkScale === 'large' ? '0.6rem 0.85rem' : '0.5rem 0.75rem',
                    color: 'white',
                    fontSize: watermarkScale === 'xlarge' ? '0.85rem' : watermarkScale === 'large' ? '0.78rem' : '0.72rem'
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
              </div>
            ) : layoutTemplate === 'academic' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                <div
                  style={{
                    background: 'rgba(11, 25, 44, 0.94)',
                    border: '1.5px solid #F59E0B',
                    borderRadius: '12px',
                    padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : '0.55rem 0.8rem',
                    color: 'white',
                    fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem',
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
              </div>
            ) : layoutTemplate === 'stamp' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap({ alignSelf: 'flex-end' })}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.92)',
                    border: '2px solid #EF4444',
                    boxShadow: 'inset 0 0 0 2px #B91C1C',
                    borderRadius: '10px',
                    padding: watermarkScale === 'xlarge' ? '0.75rem 1rem' : '0.55rem 0.8rem',
                    color: 'white',
                    fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem'
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
              </div>
            ) : layoutTemplate === 'idbadge' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.94)',
                    border: '1.5px solid #0284C7',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    color: 'white',
                    fontSize: watermarkScale === 'xlarge' ? '0.85rem' : '0.72rem'
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
              </div>
            ) : layoutTemplate === 'classic' ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  textShadow: '0 2px 5px rgba(0,0,0,0.95)',
                  color: 'white',
                  fontSize: watermarkScale === 'xlarge' ? '0.9rem' : watermarkScale === 'large' ? '0.82rem' : '0.75rem',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                <div>
                  <div style={{ fontWeight: 'bold', color: '#FDE047', fontSize: watermarkScale === 'xlarge' ? '1.05rem' : '0.85rem' }}>
                    {customIcon} {(customTitle || schoolName || 'PRESENSIA').toUpperCase()}
                  </div>
                  {showTeacherName && <div style={{ fontWeight: '600' }}>👤 {profile?.full_name || 'Guru'}</div>}
                  <div>📅 {currentDateTime.toLocaleDateString('id-ID')} | ⏰ {currentDateTime.toLocaleTimeString('id-ID')} {getTimeZoneLabel()}</div>
                  <div style={{ color: '#E2E8F0', fontSize: '0.68rem' }}>📍 {locationText}</div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  right: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  pointerEvents: 'none'
                }}
              >
                {renderPreviewMiniMap()}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.82)',
                    backdropFilter: 'blur(8px)',
                    padding: watermarkScale === 'xlarge' ? '0.8rem 1rem' : watermarkScale === 'large' ? '0.7rem 0.9rem' : '0.6rem 0.8rem',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: watermarkScale === 'xlarge' ? '0.85rem' : watermarkScale === 'large' ? '0.78rem' : '0.72rem',
                    borderLeft: '4px solid #10B981'
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
              </div>
            )}
          </>
        )}
      </>
    )}
  </div>

      {/* Controls & Inputs (Berada di Sisi Kanan saat Landscape, di Bawah saat Portrait) */}
      <div
        style={{
          width: isLandscape ? '85px' : '100%',
          maxWidth: isLandscape ? '85px' : '480px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isLandscape ? '1rem' : '0.75rem',
          flexShrink: 0
        }}
      >
        {!isReviewMode ? (
          <>
            {!isLandscape && (
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
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: isLandscape ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: isLandscape ? 'center' : 'space-around',
                gap: isLandscape ? '1.2rem' : '0',
                width: '100%',
                padding: '0.5rem 0'
              }}
            >
              {/* Tombol Flip Kamera (Di atas shutter saat landscape, di kiri saat portrait) */}
              <button
                onClick={toggleCamera}
                disabled={isSwitchingCamera}
                title="Tukar Kamera"
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  borderRadius: '50%',
                  width: isLandscape ? '44px' : '48px',
                  height: isLandscape ? '44px' : '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isSwitchingCamera ? 'not-allowed' : 'pointer',
                  opacity: isSwitchingCamera ? 0.6 : 1,
                  backdropFilter: 'blur(6px)',
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={isLandscape ? 20 : 22} style={{ animation: isSwitchingCamera ? 'spin 0.6s linear infinite' : 'none' }} />
              </button>

              {/* Tombol Shutter Jepret Berulang Kali (Hingga 10 Foto) */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  onClick={capturePhoto}
                  disabled={isProcessing || capturedPhotos.length >= 10}
                  title={capturedPhotos.length >= 10 ? 'Maksimal 10 foto tercapai' : 'Ambil Foto'}
                  style={{
                    width: isLandscape ? '62px' : '68px',
                    height: isLandscape ? '62px' : '68px',
                    borderRadius: '50%',
                    border: '4px solid white',
                    background: capturedPhotos.length >= 10 ? '#64748B' : '#EF4444',
                    boxShadow: capturedPhotos.length >= 10 ? 'none' : '0 0 20px rgba(239, 68, 68, 0.6)',
                    cursor: capturedPhotos.length >= 10 ? 'not-allowed' : 'pointer',
                    outline: 'none',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '0.78rem',
                    fontWeight: '900',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {capturedPhotos.length > 0 ? `${capturedPhotos.length}/10` : ''}
                </button>
              </div>

              {/* Tombol Thumbnail Review / Lihat Foto yang Sudah Diambil */}
              {capturedPhotos.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsReviewMode(true)}
                  title="Lihat Hasil Foto"
                  style={{
                    position: 'relative',
                    width: isLandscape ? '44px' : '48px',
                    height: isLandscape ? '44px' : '48px',
                    borderRadius: '12px',
                    border: '2px solid #F59E0B',
                    overflow: 'hidden',
                    background: '#0F172A',
                    cursor: 'pointer',
                    padding: 0,
                    boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)'
                  }}
                >
                  <img
                    src={capturedPhotos[capturedPhotos.length - 1].dataUrl}
                    alt="Latest thumb"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: '0',
                      right: '0',
                      background: '#F59E0B',
                      color: '#1E1B18',
                      fontSize: '9px',
                      fontWeight: '900',
                      padding: '1px 4px',
                      borderRadius: '0 0 0 6px'
                    }}
                  >
                    {capturedPhotos.length}
                  </span>
                </button>
              ) : (
                !isLandscape && <div style={{ width: '48px' }}></div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: isLandscape ? '85px' : '100%' }}>
            {onSelectPhoto && (
              <button
                type="button"
                onClick={() => {
                  if (activePhoto) {
                    onSelectPhoto(activePhoto.dataUrl)
                    onClose()
                  }
                }}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: 'white',
                  fontSize: isLandscape ? '0.72rem' : '0.9rem',
                  fontWeight: '700',
                  padding: isLandscape ? '0.5rem 0.3rem' : '0.85rem 1rem',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.3rem',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.45)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <CheckSquare size={16} /> {isLandscape ? 'Gunakan' : 'Gunakan Foto Ini'}
              </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isLandscape ? '1fr' : '1fr 1fr 1fr', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={downloadPhoto}
                title="Hanya simpan foto terpilih ini ke memori HP"
                className="btn"
                style={{ background: '#10B981', color: 'white', fontSize: isLandscape ? '0.68rem' : '0.75rem', padding: '0.5rem 0.3rem' }}
              >
                <Download size={13} /> Simpan
              </button>
              <button
                type="button"
                onClick={sharePhoto}
                title="Bagikan foto terpilih ini"
                className="btn"
                style={{ background: '#38BDF8', color: 'white', fontSize: isLandscape ? '0.68rem' : '0.75rem', padding: '0.5rem 0.3rem' }}
              >
                <Share2 size={13} /> Bagikan
              </button>
              <button
                type="button"
                onClick={() => handleDeletePhoto(selectedPhotoIndex)}
                title="Hapus foto terpilih ini"
                className="btn"
                style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.4)', fontSize: isLandscape ? '0.68rem' : '0.75rem', padding: '0.5rem 0.3rem' }}
              >
                🗑️ Hapus
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isLandscape ? '1fr' : '1fr 1fr', gap: '0.35rem', marginTop: '0.2rem' }}>
              {capturedPhotos.length < 10 && (
                <button
                  type="button"
                  onClick={returnToCamera}
                  title="Kembali ke kamera untuk menambah foto"
                  className="btn"
                  style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.4)', fontSize: isLandscape ? '0.68rem' : '0.75rem', padding: '0.5rem 0.3rem' }}
                >
                  📸 +Foto
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCapturedPhotos([])
                  setSelectedPhotoIndex(0)
                  returnToCamera()
                }}
                title="Hapus semua foto sementara dan ulangi"
                className="btn"
                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: isLandscape ? '0.68rem' : '0.75rem', padding: '0.5rem 0.3rem' }}
              >
                <RefreshCw size={12} /> Ulangi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
