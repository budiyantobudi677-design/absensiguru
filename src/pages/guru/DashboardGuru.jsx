import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Clock, CheckCircle, UserCircle, Calendar, Fingerprint, Check, WifiOff, RefreshCw, Bell, Trash2, Camera, History, Download, FileSpreadsheet, FileText } from 'lucide-react'
import CameraTimemarkModal from '../../components/CameraTimemarkModal'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function DashboardGuru() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('absensi') 
  const [hasCheckedIn, setHasCheckedIn] = useState(false)
  const [izinMode, setIzinMode] = useState(null) // 'sakit' or 'izin'
  const [keterangan, setKeterangan] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // Offline State
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  
  const [todayStatus, setTodayStatus] = useState(null)
  const [pengumumanData, setPengumumanData] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  
  const [isHoliday, setIsHoliday] = useState(false)
  const [holidayReason, setHolidayReason] = useState('')
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [schoolName, setSchoolName] = useState('Presensia')
  const [historyList, setHistoryList] = useState([])
  const [historyMonth, setHistoryMonth] = useState(new Date().toISOString().slice(0, 7))
  const [historyLoading, setHistoryLoading] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    if (activeTab === 'pengumuman' && unreadCount > 0 && user) {
       const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
       const allIds = pengumumanData.map(p => p.id)
       localData.read = [...new Set([...localData.read, ...allIds])]
       localStorage.setItem(`pengumuman_meta_${user.id}`, JSON.stringify(localData))
       setUnreadCount(0)
    }
  }, [activeTab, pengumumanData, unreadCount, user])

  const handleDeletePengumuman = (id) => {
     if (!user) return
     const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
     localData.deleted.push(id)
     localStorage.setItem(`pengumuman_meta_${user.id}`, JSON.stringify(localData))
     setPengumumanData(pengumumanData.filter(p => p.id !== id))
  }

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 11) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
  }

  const [popup, setPopup] = useState({ show: false, title: '', message: '', type: 'success' })

  useEffect(() => {
    // Check auto logout (1 pekan = 7 hari * 24 jam * 60 menit * 60 detik * 1000 ms)
    const lastActive = localStorage.getItem('lastActive_guru')
    const now = Date.now()
    if (lastActive && now - parseInt(lastActive) > 7 * 24 * 60 * 60 * 1000) {
       localStorage.removeItem('lastActive_guru')
       supabase.auth.signOut().then(() => navigate('/'))
       return
    }
    localStorage.setItem('lastActive_guru', now.toString())

    fetchUser()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    
    // Offline Listeners
    const handleOnline = () => { setIsOffline(false); syncOfflineData(); }
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    // Initial check for unsynced
    checkUnsynced()

    return () => {
      clearInterval(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const checkUnsynced = () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    setUnsyncedCount(offlineData.length)
  }

  const syncOfflineData = async () => {
    const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    if (offlineData.length === 0) return

    setLoading(true)
    let syncSuccessCount = 0
    
    for (const record of offlineData) {
      if (record.jenis === 'masuk') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: 'hadir' })
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'pulang') {
        const { error } = await supabase.from('absensi').update({ waktu_pulang: record.waktu, lokasi_pulang: record.loc }).eq('user_id', record.user_id).eq('tanggal', record.tanggal)
        if (!error) syncSuccessCount++
      } else if (record.jenis === 'sakit' || record.jenis === 'izin') {
        const { error } = await supabase.from('absensi').insert({ user_id: record.user_id, waktu_masuk: record.waktu, tanggal: record.tanggal, lokasi_masuk: record.loc, status: record.jenis, keterangan: record.keterangan })
        if (!error) syncSuccessCount++
      }
    }
    
    localStorage.removeItem('offlineAbsensi')
    setUnsyncedCount(0)
    setLoading(false)
    if (syncSuccessCount > 0) {
      showPopup("Sinkronisasi Selesai", `${syncSuccessCount} data luring telah disinkronkan ke server.`, "success")
      fetchUser() // Refresh UI
    }
  }

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')
      setUser(user)

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (profile) setProfile(profile)
      
      const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      const hariKerja = settings?.hari_kerja || 5
      if (settings?.nama_sekolah) {
        setSchoolName(settings.nama_sekolah)
      }
      
      const dayOfWeek = new Date().getDay()
      let holiday = false
      let reason = ''
      
      if (hariKerja === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) {
         holiday = true
         reason = 'Libur Akhir Pekan (Sabtu / Minggu)'
      } else if (hariKerja === 6 && dayOfWeek === 0) {
         holiday = true
         reason = 'Libur Akhir Pekan (Minggu)'
      }
      
      const today = getLocalDateString()

      if (!holiday) {
         const { data: libur } = await supabase.from('hari_libur').select('*').eq('tanggal', today).maybeSingle()
         if (libur) {
            holiday = true
            reason = libur.keterangan
         }
      }
      
      setIsHoliday(holiday)
      setHolidayReason(reason)

      const { data: absensiList } = await supabase.from('absensi').select('*').eq('user_id', user.id).eq('tanggal', today).order('waktu_masuk', { ascending: false }).limit(1)
        
      const absensi = absensiList && absensiList.length > 0 ? absensiList[0] : null;

      if (absensi && absensi.waktu_masuk) {
        setHasCheckedIn(true)
        setTodayStatus(absensi.status)
      } else {
        // Also check if there's offline check-in for today
        const offlineData = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
        const offlineToday = offlineData.find(d => d.tanggal === today && (d.jenis === 'masuk' || d.jenis === 'sakit' || d.jenis === 'izin'))
        if (offlineToday) {
           setHasCheckedIn(true)
           setTodayStatus(offlineToday.jenis === 'masuk' ? 'hadir' : offlineToday.jenis)
        } else {
           setHasCheckedIn(false)
           setTodayStatus(null)
        }
      }

      // Fetch Pengumuman
      const { data: pData } = await supabase.from('pengumuman')
         .select('*')
         .or(`target_type.eq.all,target_users.ilike.%${user.id}%`)
         .order('created_at', { ascending: false })
         .limit(20)
         
      if (pData) {
         const localData = JSON.parse(localStorage.getItem(`pengumuman_meta_${user.id}`) || '{"read":[], "deleted":[]}')
         const activePengumuman = pData.filter(p => !localData.deleted.includes(p.id))
         setPengumumanData(activePengumuman)
         
         const unread = activePengumuman.filter(p => !localData.read.includes(p.id)).length
         setUnreadCount(unread)

         // Trigger push notification for new announcement if granted
         if (unread > 0 && 'Notification' in window && Notification.permission === 'granted') {
           const latestMsg = activePengumuman[0]?.pesan || 'Anda memiliki pengumuman baru.'
           try {
             new Notification('Presensia - Pengumuman Sekolah', {
               body: latestMsg,
               icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png'
             })
           } catch (e) {
             console.log(e)
           }
         }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') {
        showPopup('Notifikasi Aktif', 'Izin notifikasi push berhasil diaktifkan.', 'success')
      } else {
        showPopup('Notifikasi Ditolak', 'Izin notifikasi tidak diberikan oleh browser.', 'error')
      }
    } else {
      showPopup('Tidak Didukung', 'Browser ini tidak mendukung notifikasi Web.', 'error')
    }
  }

  const loadHistory = async (targetMonth = historyMonth) => {
    if (!user) return
    setHistoryLoading(true)
    try {
      const [year, month] = targetMonth.split('-')
      const firstDay = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
      const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')

      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', user.id)
        .gte('tanggal', firstDay)
        .lte('tanggal', lastDay)
        .order('tanggal', { ascending: false })

      if (!error && data) {
        setHistoryList(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setHistoryLoading(false)
    }
  }

  const downloadHistoryExcel = async () => {
    if (historyList.length === 0) {
      alert('Tidak ada riwayat absensi di bulan ini.')
      return
    }

    const [year, month] = historyMonth.split('-')
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Riwayat Presensi')

    // Header Judul Laporan
    worksheet.mergeCells('A1:F1')
    worksheet.getCell('A1').value = 'REKAPITULASI KEHADIRAN GURU'
    worksheet.getCell('A1').font = { bold: true, size: 14 }
    worksheet.getCell('A1').alignment = { horizontal: 'center' }

    worksheet.mergeCells('A2:F2')
    worksheet.getCell('A2').value = schoolName.toUpperCase()
    worksheet.getCell('A2').font = { bold: true, size: 12 }
    worksheet.getCell('A2').alignment = { horizontal: 'center' }

    worksheet.mergeCells('A3:F3')
    worksheet.getCell('A3').value = `Nama: ${profile?.full_name || 'Guru'} ${profile?.nip ? ' | NIP: ' + profile.nip : ''}`
    worksheet.getCell('A3').font = { size: 11 }
    worksheet.getCell('A3').alignment = { horizontal: 'left' }

    worksheet.mergeCells('A4:F4')
    worksheet.getCell('A4').value = `Periode Bulan: ${monthLabel}`
    worksheet.getCell('A4').font = { size: 11, bold: true }
    worksheet.getCell('A4').alignment = { horizontal: 'left' }

    // Table Headers
    const headers = ['No', 'Tanggal', 'Status', 'Jam Masuk', 'Jam Pulang', 'Keterangan']
    const headerRow = worksheet.addRow(headers)
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    })

    worksheet.getColumn(1).width = 6
    worksheet.getColumn(2).width = 24
    worksheet.getColumn(3).width = 14
    worksheet.getColumn(4).width = 14
    worksheet.getColumn(5).width = 14
    worksheet.getColumn(6).width = 30

    historyList.forEach((item, index) => {
      const tgl = new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const status = (item.status || 'Hadir').toUpperCase()
      const masuk = item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const pulang = item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const ket = item.keterangan || '-'

      const row = worksheet.addRow([index + 1, tgl, status, masuk, pulang, ket])
      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 || colNumber === 6 ? 'left' : 'center' }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }

        if (colNumber === 3) {
          if (status === 'HADIR') {
            cell.font = { color: { argb: 'FF059669' }, bold: true }
          } else if (status === 'IZIN') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } }
            cell.font = { color: { argb: 'FFD97706' }, bold: true }
          } else if (status === 'SAKIT') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
            cell.font = { color: { argb: 'FFDC2626' }, bold: true }
          }
        }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const sanitizedName = (profile?.full_name || 'Guru').replace(/\s+/g, '_')
    saveAs(new Blob([buffer]), `Riwayat_Presensi_${sanitizedName}_${historyMonth}.xlsx`)
  }

  const downloadHistoryPDF = () => {
    if (historyList.length === 0) {
      alert('Tidak ada riwayat absensi di bulan ini.')
      return
    }

    const [year, month] = historyMonth.split('-')
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const monthLabel = `${monthNames[parseInt(month) - 1]} ${year}`

    const doc = new jsPDF({ orientation: 'portrait', format: 'a4' })
    const docWidth = doc.internal.pageSize.getWidth()

    // Header PDF
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('REKAPITULASI KEHADIRAN GURU', docWidth / 2, 16, { align: 'center' })
    doc.setFontSize(12)
    doc.text(schoolName.toUpperCase(), docWidth / 2, 23, { align: 'center' })

    doc.setLineWidth(0.5)
    doc.line(14, 27, docWidth - 14, 27)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Nama Pegawai : ${profile?.full_name || 'Guru'}`, 14, 34)
    if (profile?.nip) {
      doc.text(`NIP                 : ${profile.nip}`, 14, 40)
    }
    doc.text(`Bulan              : ${monthLabel}`, 14, profile?.nip ? 46 : 40)

    const tableStartY = profile?.nip ? 52 : 46

    const head = [['No', 'Tanggal', 'Status', 'Masuk', 'Pulang', 'Keterangan']]
    const body = historyList.map((item, idx) => {
      const tgl = new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
      const status = (item.status || 'Hadir').toUpperCase()
      const masuk = item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const pulang = item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
      const ket = item.keterangan || '-'
      return [idx + 1, tgl, status, masuk, pulang, ket]
    })

    autoTable(doc, {
      startY: tableStartY,
      head: head,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 9,
        cellPadding: 2,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        halign: 'center',
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left', cellWidth: 35 },
        2: { halign: 'center', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'left' }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 2) {
          const val = data.cell.raw
          if (val === 'HADIR') {
            data.cell.styles.textColor = [5, 150, 105]
            data.cell.styles.fontStyle = 'bold'
          } else if (val === 'IZIN') {
            data.cell.styles.fillColor = [254, 243, 199]
            data.cell.styles.textColor = [217, 119, 6]
            data.cell.styles.fontStyle = 'bold'
          } else if (val === 'SAKIT') {
            data.cell.styles.fillColor = [254, 226, 226]
            data.cell.styles.textColor = [220, 38, 38]
            data.cell.styles.fontStyle = 'bold'
          }
        }
      }
    })

    const sanitizedName = (profile?.full_name || 'Guru').replace(/\s+/g, '_')
    doc.save(`Riwayat_Presensi_${sanitizedName}_${historyMonth}.pdf`)
  }

  const showPopup = (title, message, type = 'success') => {
    setPopup({ show: true, title, message, type })
    setTimeout(() => {
      setPopup({ show: false, title: '', message: '', type: 'success' })
    }, 3000)
  }

  const saveOffline = (jenis, loc, now, today, ket = '') => {
    const record = { user_id: user.id, jenis, loc, waktu: now, tanggal: today, keterangan: ket }
    const current = JSON.parse(localStorage.getItem('offlineAbsensi') || '[]')
    current.push(record)
    localStorage.setItem('offlineAbsensi', JSON.stringify(current))
    checkUnsynced()
    
    if (jenis !== 'pulang') {
       setHasCheckedIn(true)
       setIzinMode(null)
    }
    showPopup("Tersimpan Luring (Offline)", "Data disimpan sementara. Akan dikirim otomatis saat internet tersambung.", "success")
    setLoading(false)
  }

  const handleAbsen = async (jenis) => {
    setLoading(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const loc = `${position.coords.latitude}, ${position.coords.longitude}`
        const today = getLocalDateString()
        const now = new Date().toISOString()
        
        if (isOffline) {
           saveOffline(jenis, loc, now, today, keterangan)
           return
        }

        try {
          if (jenis === 'masuk') {
            const { error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: 'hadir' })
            if (error) throw error
            setHasCheckedIn(true)
            showPopup("Absen Berhasil!", "Data jam masuk Anda telah tersimpan ke sistem.", "success")
          } else if (jenis === 'pulang') {
            const { error } = await supabase.from('absensi').update({ waktu_pulang: now, lokasi_pulang: loc }).eq('user_id', user.id).eq('tanggal', today)
            if (error) throw error
            showPopup("Pulang Tercatat!", "Terima kasih atas kerja keras Anda hari ini.", "success")
          } else if (jenis === 'sakit' || jenis === 'izin') {
            const { error } = await supabase.from('absensi').insert({ user_id: user.id, waktu_masuk: now, tanggal: today, lokasi_masuk: loc, status: jenis, keterangan: keterangan })
            if (error) throw error
            setHasCheckedIn(true)
            setIzinMode(null)
            showPopup("Data Terkirim!", `Keterangan ${jenis} Anda telah dilaporkan.`, "success")
          }
        } catch (error) {
          // Fallback to offline if supabase fails
          saveOffline(jenis, loc, now, today, keterangan)
        }
        setLoading(false)
      }, () => {
        showPopup("Akses Lokasi Ditolak", "Mohon izinkan akses GPS.", "error")
        setLoading(false)
      }, { timeout: 10000 })
    } else {
      showPopup("GPS Tidak Didukung", "Browser Anda tidak mendukung lokasi.", "error")
      setLoading(false)
    }
  }

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_SIZE = 600;
          if (width > height && width > MAX_SIZE) {
            height *= MAX_SIZE / width; width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width *= MAX_SIZE / height; height = MAX_SIZE;
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  }

  const uploadFoto = async (event) => {
    try {
      if (isOffline) {
         showPopup("Tidak Ada Internet", "Anda harus online untuk mengubah foto profil.", "error")
         return
      }
      setLoading(true)
      const file = event.target.files[0]
      if(!file) return
      const compressedFile = await compressImage(file)
      const fileName = `${user.id}-${Math.random()}.webp`
      
      let { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile, { contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: profileError } = await supabase.from('profiles').update({ foto_profil: publicUrl }).eq('id', user.id)
      if (profileError) throw profileError
      
      setProfile({ ...profile, foto_profil: publicUrl })
      showPopup("Tersimpan!", "Foto profil berhasil diperbarui.", "success")
    } catch (error) {
      showPopup("Gagal", error.message, "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ paddingBottom: '90px' }}>

      {/* Custom Popup Modal */}
      {popup.show && (
        <div className="popup-overlay">
          <div className="popup-content">
             <div style={{ margin: '0 auto 1rem auto', width: '64px', height: '64px', background: popup.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: popup.type === 'success' ? '#059669' : '#DC2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={32} strokeWidth={3} />
             </div>
             <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{popup.title}</h2>
             <p className="text-muted" style={{ fontSize: '0.95rem' }}>{popup.message}</p>
          </div>
        </div>
      )}

      {/* Header ID Card */}
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '1.5rem', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            {profile?.foto_profil ? (
              <img src={profile.foto_profil} alt="Profil" style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)', background: 'white' }} />
            ) : (
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserCircle size={36} color="var(--primary)" />
              </div>
            )}
            <div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.1rem' }}>{getGreeting()},</p>
              <h2 style={{ fontSize: '1.3rem', marginTop: 0, letterSpacing: '0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                {profile?.full_name || user?.email?.split('@')[0]}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCameraModal(true)}
              title="Kamera Timemark"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Camera size={20} />
            </button>
            <button
              onClick={() => setActiveTab('pengumuman')}
              title="Pengumuman"
              style={{
                background: activeTab === 'pengumuman' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)',
                border: 'none',
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <Bell size={20} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#EF4444', width: '10px', height: '10px', borderRadius: '50%' }}></span>}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.15)', padding: '1rem 1.25rem', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-3">
            <Clock size={20} />
            <span style={{ fontSize: '1rem', fontWeight: '500', letterSpacing: '1px' }}>
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}>
            {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        
        {/* Offline & Sync Indicators */}
        {isOffline && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#DC2626', fontSize: '0.85rem' }}>
             <WifiOff size={16} /> Mode Luring (Offline) Aktif
          </div>
        )}
        {!isOffline && unsyncedCount > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', padding: '0.75rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', color: '#D97706', fontSize: '0.85rem' }}>
             <span>Ada {unsyncedCount} data absen tertunda.</span>
             <button onClick={syncOfflineData} style={{ background: 'transparent', border: 'none', color: '#D97706', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold' }} disabled={loading}>
                <RefreshCw size={14} className={loading ? "spin" : ""} /> Sync
             </button>
          </div>
        )}

        {activeTab === 'absensi' && (
          <div className="text-center">
            {!isHoliday && <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Sentuh tombol di bawah untuk absensi</p>}

            {isHoliday ? (
              <div className="card" style={{ padding: '2rem', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8', marginTop: '1rem' }}>
                <Calendar size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Hari Libur</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '500' }}>{holidayReason}</p>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.85rem' }}>Anda tidak perlu melakukan presensi hari ini. Selamat beristirahat!</p>
              </div>
            ) : !hasCheckedIn ? (
              <>
                <button className="btn-clock" onClick={() => handleAbsen('masuk')} disabled={loading} style={{ marginBottom: '1.5rem' }}>
                  <Fingerprint size={48} strokeWidth={1.5} />
                  <span>Clock In</span>
                </button>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
                  <button onClick={() => setIzinMode('sakit')} className="btn" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '0.75rem 1.5rem' }}>Sakit</button>
                  <button onClick={() => setIzinMode('izin')} className="btn" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FCD34D', padding: '0.75rem 1.5rem' }}>Izin</button>
                </div>
              </>
            ) : (todayStatus === 'sakit' || todayStatus === 'izin') ? (
              <div className="card" style={{ padding: '2rem', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626' }}>
                <CheckCircle size={48} style={{ margin: '0 auto 1rem auto' }} />
                <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Anda Terdaftar {todayStatus.toUpperCase()}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Semoga lekas membaik dan hari Anda menyenangkan. Anda tidak perlu Clock Out hari ini.</p>
              </div>
            ) : (
              <button className="btn-clock out" onClick={() => handleAbsen('pulang')} disabled={loading}>
                <Fingerprint size={48} strokeWidth={1.5} />
                <span>Clock Out</span>
              </button>
            )}

            {izinMode && (
              <div className="card" style={{ marginTop: '2rem', textAlign: 'left' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Form {izinMode === 'sakit' ? 'Sakit' : 'Izin'}</h4>
                <textarea className="input" rows="3" placeholder="Masukkan keterangan..." value={keterangan} onChange={e => setKeterangan(e.target.value)} style={{ marginBottom: '1rem' }} />
                <div className="flex gap-2">
                  <button onClick={() => setIzinMode(null)} className="btn" style={{ background: '#E2E8F0', flex: 1 }}>Batal</button>
                  <button onClick={() => handleAbsen(izinMode)} className="btn btn-primary" style={{ flex: 1 }}>Kirim</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pengaturan' && (
          <div className="fade-in">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Pengaturan Profil</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
                {profile?.foto_profil ? (
                  <img src={profile.foto_profil} alt="Profil" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '1rem' }} />
                ) : (
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <UserCircle size={40} color="var(--text-muted)" />
                  </div>
                )}
                <div>
                  <input type="file" id="upload-foto" accept="image/*" style={{ display: 'none' }} onChange={uploadFoto} disabled={loading || isOffline} />
                  <label htmlFor="upload-foto" className="btn" style={{ background: '#E0E7FF', color: '#4F46E5', fontSize: '0.85rem', padding: '0.5rem 1rem', cursor: 'pointer', opacity: isOffline ? 0.5 : 1 }}>
                    {loading ? 'Mengunggah...' : 'Ubah Foto'}
                  </label>
                </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa menyimpan profil saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const updates = { full_name: formData.get('full_name'), nip: formData.get('nip'), jabatan: formData.get('jabatan') };
                
                const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
                if (!error) {
                  setProfile({ ...profile, ...updates });
                  showPopup("Tersimpan!", "Profil Anda berhasil diperbarui.", "success");
                } else {
                  showPopup("Gagal", error.message, "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Nama Lengkap</label>
                  <input type="text" name="full_name" className="input" defaultValue={profile?.full_name || ''} required />
                </div>
                <div className="input-group">
                  <label className="input-label">NIP / ID Pegawai</label>
                  <input type="text" name="nip" className="input" defaultValue={profile?.nip || ''} placeholder="Contoh: 198012312005011002" />
                </div>
                <div className="input-group">
                  <label className="input-label">Jabatan / Guru Mapel</label>
                  <input type="text" name="jabatan" className="input" defaultValue={profile?.jabatan || ''} placeholder="Contoh: Guru Matematika" />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </form>
            </div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', marginTop: '2rem' }}>Keamanan</h3>
            <div className="card" style={{ border: 'none', background: 'white' }}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (isOffline) {
                   showPopup("Offline", "Anda tidak bisa mengubah password saat offline.", "error")
                   return
                }
                setLoading(true);
                const formData = new FormData(e.target);
                const newPassword = formData.get('new_password');
                
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (!error) {
                  showPopup("Berhasil!", "Password Anda telah diperbarui.", "success");
                  e.target.reset();
                } else {
                  showPopup("Gagal", error.message, "error");
                }
                setLoading(false);
              }}>
                <div className="input-group">
                  <label className="input-label">Ubah Password Baru</label>
                  <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                </div>
                <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }} disabled={loading}>
                  {loading ? 'Memproses...' : 'Ubah Password'}
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'riwayat' && (
          <div className="fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Riwayat Kehadiran</h3>
                <div className="flex gap-2">
                  <button
                    onClick={downloadHistoryExcel}
                    disabled={historyLoading || historyList.length === 0}
                    className="btn"
                    title="Unduh Excel (.xlsx)"
                    style={{
                      background: '#10B981',
                      color: 'white',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      width: 'auto',
                      opacity: historyList.length === 0 ? 0.6 : 1
                    }}
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                  <button
                    onClick={downloadHistoryPDF}
                    disabled={historyLoading || historyList.length === 0}
                    className="btn"
                    title="Unduh PDF (.pdf)"
                    style={{
                      background: '#EF4444',
                      color: 'white',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      width: 'auto',
                      opacity: historyList.length === 0 ? 0.6 : 1
                    }}
                  >
                    <FileText size={14} /> PDF
                  </button>
                </div>
             </div>

             {/* Filter Bulan */}
             <div className="card" style={{ padding: '0.85rem 1rem', border: 'none', background: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Calendar size={18} color="var(--primary)" />
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginBottom: '0.2rem' }}>Pilih Bulan</label>
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => {
                      setHistoryMonth(e.target.value)
                      loadHistory(e.target.value)
                    }}
                    className="input"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px' }}
                  />
                </div>
             </div>

             {historyLoading ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   <RefreshCw size={24} className="spin" style={{ margin: '0 auto 0.5rem auto' }} />
                   Memuat data riwayat...
                </div>
             ) : historyList.length === 0 ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   Tidak ada data kehadiran di bulan {historyMonth}.
                </div>
             ) : (
                <div className="flex flex-col gap-2">
                   {historyList.map((item) => {
                     const isHadir = !item.status || item.status === 'hadir'
                     const statusColor = isHadir ? '#10B981' : item.status === 'izin' ? '#F59E0B' : '#EF4444'
                     const statusBg = isHadir ? '#ECFDF5' : item.status === 'izin' ? '#FFFBEB' : '#FEF2F2'
                     
                     return (
                       <div key={item.id} className="card flex items-center justify-between" style={{ padding: '0.85rem 1rem', border: 'none', borderRadius: '16px', background: 'white' }}>
                         <div>
                           <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1E293B', marginBottom: '0.2rem' }}>
                             {new Date(item.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                           </div>
                           <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.5rem', borderRadius: '6px', background: statusBg, color: statusColor, textTransform: 'uppercase' }}>
                             {item.status || 'HADIR'}
                           </span>
                           {item.keterangan && (
                             <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                               Ket: {item.keterangan}
                             </p>
                           )}
                         </div>

                         <div className="flex gap-3 text-center">
                           <div>
                             <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>MASUK</div>
                             <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#10B981' }}>
                               {item.waktu_masuk ? new Date(item.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                             </div>
                           </div>
                           <div>
                             <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>PULANG</div>
                             <div style={{ fontWeight: '700', fontSize: '0.85rem', color: item.waktu_pulang ? '#F59E0B' : '#CBD5E1' }}>
                               {item.waktu_pulang ? new Date(item.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                             </div>
                           </div>
                         </div>
                       </div>
                     )
                   })}
                </div>
             )}
          </div>
        )}

        {activeTab === 'pengumuman' && (
          <div className="fade-in">
             <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Notifikasi</h3>
                {'Notification' in window && Notification.permission !== 'granted' && (
                   <button
                     onClick={requestNotificationPermission}
                     className="btn"
                     style={{
                       background: '#38BDF8',
                       color: 'white',
                       padding: '0.35rem 0.75rem',
                       borderRadius: '8px',
                       fontSize: '0.75rem',
                       width: 'auto'
                     }}
                   >
                     🔔 Izinkan Push
                   </button>
                )}
             </div>
             
             {pengumumanData.length === 0 ? (
                <div className="card text-center text-muted" style={{ padding: '2rem' }}>
                   Belum ada pengumuman untuk Anda.
                </div>
             ) : (
                <div className="flex flex-col gap-3">
                  {pengumumanData.map(p => (
                    <div key={p.id} className="card" style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '16px', background: 'white' }}>
                      <div className="flex justify-between items-start mb-2">
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button onClick={() => handleDeletePengumuman(p.id)} style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#EF4444', cursor: 'pointer', padding: '0.35rem', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.95rem', color: '#1E293B', lineHeight: '1.5' }}>{p.pesan}</p>
                    </div>
                  ))}
                </div>
             )}
          </div>
        )}
      </div>

      {/* Corporate Style Bottom Navigation */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'absensi' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('absensi')}>
          <Clock size={20} strokeWidth={activeTab === 'absensi' ? 2.5 : 1.5} /> Presensi
        </button>
        <button
          className={`nav-item ${activeTab === 'riwayat' ? 'active' : ''}`}
          style={{ flex: 1 }}
          onClick={() => {
            setActiveTab('riwayat')
            loadHistory()
          }}
        >
          <History size={20} strokeWidth={activeTab === 'riwayat' ? 2.5 : 1.5} /> Riwayat
        </button>
        <button className={`nav-item ${activeTab === 'pengaturan' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setActiveTab('pengaturan')}>
          <UserCircle size={20} strokeWidth={activeTab === 'pengaturan' ? 2.5 : 1.5} /> Profil
        </button>
      </nav>

      {/* Camera Timemark Modal */}
      <CameraTimemarkModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        profile={profile}
        user={user}
        schoolName={schoolName}
      />
      
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
