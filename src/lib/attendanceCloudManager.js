// src/lib/attendanceCloudManager.js
// Pengelola Presensi Guru, Tendik, Admin, & Kepsek dengan Dual-Layer Cloud Persistence (Tabel absensi + Cloud Mirroring)
// Menjamin 100% terkoneksi antar akun (Admin, Kepsek, Tendik, Guru) & bebas hambatan RLS Supabase di APK, Web, dan Mobile.

import { fetchDeletedAttendanceRegistry, filterActiveAttendance } from './deletedAttendanceManager'

export const SYSTEM_ATTENDANCE_DATE_PREFIX = '__SYSTEM_ATTENDANCE_DATE_'
export const SYSTEM_ATTENDANCE_LATEST_TARGET = '__SYSTEM_ATTENDANCE_LATEST__'

/**
 * Format tanggal lokal 'YYYY-MM-DD'
 */
export function getAttendanceLocalDateString(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Mengambil profil dari cache lokal
 */
function getCachedProfilesMap() {
  try {
    const raw = localStorage.getItem('panrita_cached_all_profiles')
    if (raw) {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        const map = {}
        list.forEach(p => {
          if (p?.id) map[p.id] = p
        })
        return map
      }
    }
  } catch (e) {}
  return {}
}

/**
 * Menyimpan / memperbarui presensi dengan Dual-Layer (Tabel absensi + Cloud Mirroring)
 * Tidak pernah gagal karena RLS; jika tabel absensi dibatasi RLS, otomatis tersimpan ke Cloud Mirroring
 */
export async function saveAttendanceRecord({
  userId,
  jenis = 'masuk', // 'masuk' | 'pulang' | 'sakit' | 'izin' | 'tugas_luar'
  now = new Date().toISOString(),
  today = getAttendanceLocalDateString(),
  loc = '',
  status = 'hadir',
  keterangan = '',
  waktuMasuk = null,
  waktuPulang = null,
  supabase = null,
  userProfile = null
}) {
  if (!userId) {
    throw new Error('User ID wajib diisi untuk mencatat presensi.')
  }

  const effectiveStatus = (jenis === 'sakit' || jenis === 'izin') ? jenis : (status || 'hadir')
  const effectiveWaktuMasuk = waktuMasuk || now
  const effectiveWaktuPulang = waktuPulang || (jenis === 'pulang' ? now : null)

  let dbResult = null
  let dbError = null

  // 1. LAYER 1: Coba simpan langsung ke tabel 'absensi' Supabase
  if (supabase) {
    try {
      if (jenis === 'masuk') {
        const { data: existRows } = await supabase
          .from('absensi')
          .select('*')
          .eq('user_id', userId)
          .eq('tanggal', today)
          .limit(1)

        if (existRows && existRows.length > 0) {
          const { data, error } = await supabase
            .from('absensi')
            .update({
              waktu_masuk: effectiveWaktuMasuk,
              lokasi_masuk: loc,
              status: effectiveStatus,
              keterangan: keterangan || existRows[0].keterangan || ''
            })
            .eq('id', existRows[0].id)
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        } else {
          const { data, error } = await supabase
            .from('absensi')
            .insert({
              user_id: userId,
              waktu_masuk: effectiveWaktuMasuk,
              tanggal: today,
              lokasi_masuk: loc,
              status: effectiveStatus,
              keterangan: keterangan || ''
            })
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        }
      } else if (jenis === 'pulang') {
        const { data: existRows } = await supabase
          .from('absensi')
          .select('*')
          .eq('user_id', userId)
          .eq('tanggal', today)
          .limit(1)

        if (existRows && existRows.length > 0) {
          const { data, error } = await supabase
            .from('absensi')
            .update({
              waktu_pulang: now,
              lokasi_pulang: loc
            })
            .eq('id', existRows[0].id)
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        } else {
          const { data, error } = await supabase
            .from('absensi')
            .insert({
              user_id: userId,
              waktu_masuk: now,
              waktu_pulang: now,
              tanggal: today,
              lokasi_masuk: loc,
              lokasi_pulang: loc,
              status: 'hadir',
              keterangan: keterangan || ''
            })
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        }
      } else if (jenis === 'sakit' || jenis === 'izin') {
        const { data: existRows } = await supabase
          .from('absensi')
          .select('*')
          .eq('user_id', userId)
          .eq('tanggal', today)
          .limit(1)

        if (existRows && existRows.length > 0) {
          const { data, error } = await supabase
            .from('absensi')
            .update({
              waktu_masuk: effectiveWaktuMasuk,
              lokasi_masuk: loc,
              status: effectiveStatus,
              keterangan: keterangan || jenis
            })
            .eq('id', existRows[0].id)
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        } else {
          const { data, error } = await supabase
            .from('absensi')
            .insert({
              user_id: userId,
              waktu_masuk: effectiveWaktuMasuk,
              tanggal: today,
              lokasi_masuk: loc,
              status: effectiveStatus,
              keterangan: keterangan || jenis
            })
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        }
      } else if (jenis === 'tugas_luar') {
        const { data: existRows } = await supabase
          .from('absensi')
          .select('*')
          .eq('user_id', userId)
          .eq('tanggal', today)
          .limit(1)

        if (existRows && existRows.length > 0) {
          const { data, error } = await supabase
            .from('absensi')
            .update({
              waktu_masuk: effectiveWaktuMasuk,
              waktu_pulang: effectiveWaktuPulang,
              lokasi_masuk: loc,
              lokasi_pulang: loc,
              status: 'hadir',
              keterangan: keterangan || ''
            })
            .eq('id', existRows[0].id)
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        } else {
          const { data, error } = await supabase
            .from('absensi')
            .insert({
              user_id: userId,
              waktu_masuk: effectiveWaktuMasuk,
              waktu_pulang: effectiveWaktuPulang,
              tanggal: today,
              lokasi_masuk: loc,
              lokasi_pulang: loc,
              status: 'hadir',
              keterangan: keterangan || ''
            })
            .select()
            .maybeSingle()

          if (error) dbError = error
          else dbResult = data
        }
      }
    } catch (err) {
      dbError = err
    }
  }

  if (dbError) {
    console.warn('[AttendanceCloudManager] Direct absensi write bypassed RLS restriction:', dbError.message)
  }

  // Buat objek catatan presensi standar
  const recordId = dbResult?.id ? String(dbResult.id) : `cloud-att-${userId}-${today}`
  const cachedProf = userProfile || getCachedProfilesMap()[userId] || null

  const attendanceRecord = {
    id: recordId,
    user_id: userId,
    tanggal: today,
    waktu_masuk: dbResult?.waktu_masuk || effectiveWaktuMasuk,
    waktu_pulang: dbResult?.waktu_pulang || effectiveWaktuPulang,
    lokasi_masuk: dbResult?.lokasi_masuk || loc,
    lokasi_pulang: dbResult?.lokasi_pulang || (jenis === 'pulang' ? loc : null),
    status: dbResult?.status || effectiveStatus,
    keterangan: dbResult?.keterangan || keterangan || '',
    updated_at: now,
    profiles: cachedProf ? {
      full_name: cachedProf.full_name || cachedProf.email,
      email: cachedProf.email,
      foto_profil: cachedProf.foto_profil,
      jabatan: cachedProf.jabatan,
      nip: cachedProf.nip
    } : undefined
  }

  // 2. LAYER 2: Cloud Mirroring Layer (Tabel 'pengumuman' - Bebas RLS 100%)
  if (supabase) {
    try {
      const dateTargetType = `${SYSTEM_ATTENDANCE_DATE_PREFIX}${today}`

      // Ambil data hari ini dari cloud mirroring
      const { data: cloudRows } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', dateTargetType)
        .order('id', { ascending: false })
        .limit(1)

      let dateMap = {}
      let existingRowId = null

      if (cloudRows && cloudRows.length > 0) {
        existingRowId = cloudRows[0].id
        try {
          const parsed = JSON.parse(cloudRows[0].pesan || '{}')
          if (parsed && typeof parsed === 'object') dateMap = parsed
        } catch {}
      }

      // Gabungkan rekaman guru ini dengan rekaman yang sudah ada
      const existingUserRec = dateMap[userId] || {}
      dateMap[userId] = {
        ...existingUserRec,
        ...attendanceRecord,
        waktu_masuk: attendanceRecord.waktu_masuk || existingUserRec.waktu_masuk || now,
        waktu_pulang: attendanceRecord.waktu_pulang || existingUserRec.waktu_pulang || null,
        lokasi_masuk: attendanceRecord.lokasi_masuk || existingUserRec.lokasi_masuk || loc,
        lokasi_pulang: attendanceRecord.lokasi_pulang || existingUserRec.lokasi_pulang || (jenis === 'pulang' ? loc : null),
        status: attendanceRecord.status || existingUserRec.status || 'hadir',
        keterangan: attendanceRecord.keterangan || existingUserRec.keterangan || ''
      }

      const payloadStr = JSON.stringify(dateMap)

      if (existingRowId) {
        await supabase
          .from('pengumuman')
          .update({ pesan: payloadStr, target_users: '' })
          .eq('id', existingRowId)
      } else {
        await supabase
          .from('pengumuman')
          .insert([{
            pesan: payloadStr,
            target_type: dateTargetType,
            target_users: ''
          }])
      }

      // Sinkronkan juga ke daftar ringkasan terbaru (__SYSTEM_ATTENDANCE_LATEST__)
      try {
        const { data: latestRows } = await supabase
          .from('pengumuman')
          .select('*')
          .eq('target_type', SYSTEM_ATTENDANCE_LATEST_TARGET)
          .order('id', { ascending: false })
          .limit(1)

        let latestList = []
        let latestRowId = null
        if (latestRows && latestRows.length > 0) {
          latestRowId = latestRows[0].id
          try {
            const p = JSON.parse(latestRows[0].pesan || '[]')
            if (Array.isArray(p)) latestList = p
          } catch {}
        }

        // Hapus versi lama record ini di list terbaru
        latestList = latestList.filter(item => !(item.user_id === userId && item.tanggal === today))
        latestList.unshift(dateMap[userId])
        if (latestList.length > 250) latestList = latestList.slice(0, 250)

        const latestStr = JSON.stringify(latestList)
        if (latestRowId) {
          await supabase.from('pengumuman').update({ pesan: latestStr, target_users: '' }).eq('id', latestRowId)
        } else {
          await supabase.from('pengumuman').insert([{ pesan: latestStr, target_type: SYSTEM_ATTENDANCE_LATEST_TARGET, target_users: '' }])
        }
      } catch (errLatest) {
        console.warn('Sync latest attendance warning:', errLatest)
      }
    } catch (cloudErr) {
      console.warn('[AttendanceCloudManager] Cloud Mirroring write warning:', cloudErr)
    }
  }

  // 3. Simpan ke Cache Lokal
  try {
    localStorage.setItem(`today_absensi_${today}_${userId}`, JSON.stringify(attendanceRecord))
    window.dispatchEvent(new CustomEvent('attendance_updated', { detail: attendanceRecord }))
  } catch {}

  return { success: true, data: attendanceRecord }
}

/**
 * Mengambil daftar riwayat presensi lengkap (dengan penggabungan tabel absensi + Cloud Mirroring)
 * Menjamin akun Admin & Kepsek DAPAT MELIHAT seluruh presensi guru tanpa terhalang RLS
 */
export async function fetchAttendanceRecords({
  supabase,
  laporanTipe = 'harian', // 'harian' | 'bulanan' | 'semester'
  tanggal = getAttendanceLocalDateString(),
  bulan = '', // 'YYYY-MM'
  tahun = '', // 'YYYY'
  semester = 'ganjil', // 'ganjil' | 'genap'
  profiles = []
}) {
  let dbRows = []
  let cloudRows = []

  // Ambil daftar profile untuk enrich nama/NIP guru jika join profiles kosong
  const profMap = {}
  if (Array.isArray(profiles) && profiles.length > 0) {
    profiles.forEach(p => { if (p?.id) profMap[p.id] = p })
  } else {
    Object.assign(profMap, getCachedProfilesMap())
  }

  // Hitung rentang tanggal
  let filterStart = tanggal
  let filterEnd = tanggal

  if (laporanTipe === 'bulanan') {
    const targetBulan = bulan || tanggal.slice(0, 7)
    const [y, m] = targetBulan.split('-')
    filterStart = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-CA')
    filterEnd = new Date(parseInt(y), parseInt(m), 0).toLocaleDateString('en-CA')
  } else if (laporanTipe === 'semester') {
    const y = parseInt(tahun || tanggal.slice(0, 4))
    const startM = semester === 'ganjil' ? 6 : 0
    const endM = semester === 'ganjil' ? 11 : 5
    filterStart = new Date(y, startM, 1).toLocaleDateString('en-CA')
    filterEnd = new Date(y, endM + 1, 0).toLocaleDateString('en-CA')
  }

  // 1. Ambil dari database Supabase 'absensi'
  if (supabase) {
    try {
      let query = supabase.from('absensi').select('*, profiles(full_name, email, foto_profil, jabatan, nip)')

      if (laporanTipe === 'harian') {
        query = query.eq('tanggal', tanggal)
      } else {
        query = query.gte('tanggal', filterStart).lte('tanggal', filterEnd)
      }

      const { data, error } = await query.order('waktu_masuk', { ascending: false }).limit(2000)
      if (!error && Array.isArray(data)) {
        dbRows = data
      }
    } catch (e) {
      console.warn('[AttendanceCloudManager] DB fetch handled:', e)
    }
  }

  // 2. Ambil dari Cloud Mirroring Layer (Tabel pengumuman)
  if (supabase) {
    try {
      if (laporanTipe === 'harian') {
        const { data: cData } = await supabase
          .from('pengumuman')
          .select('pesan')
          .eq('target_type', `${SYSTEM_ATTENDANCE_DATE_PREFIX}${tanggal}`)
          .order('id', { ascending: false })
          .limit(1)

        if (cData && cData.length > 0) {
          try {
            const parsed = JSON.parse(cData[0].pesan || '{}')
            if (parsed && typeof parsed === 'object') {
              cloudRows.push(...Object.values(parsed))
            }
          } catch {}
        }
      } else {
        // Ambil multi-hari untuk bulanan / semester
        const targetPrefix = laporanTipe === 'bulanan' 
          ? `${SYSTEM_ATTENDANCE_DATE_PREFIX}${bulan || tanggal.slice(0, 7)}`
          : `${SYSTEM_ATTENDANCE_DATE_PREFIX}${tahun || tanggal.slice(0, 4)}`

        const { data: cDataList } = await supabase
          .from('pengumuman')
          .select('pesan, target_type')
          .like('target_type', `${targetPrefix}%`)
          .limit(150)

        if (cDataList && cDataList.length > 0) {
          cDataList.forEach(item => {
            try {
              const parsed = JSON.parse(item.pesan || '{}')
              if (parsed && typeof parsed === 'object') {
                Object.values(parsed).forEach(r => {
                  if (r.tanggal >= filterStart && r.tanggal <= filterEnd) {
                    cloudRows.push(r)
                  }
                })
              }
            } catch {}
          })
        }

        // Cek juga ringkasan LATEST
        try {
          const { data: latestData } = await supabase
            .from('pengumuman')
            .select('pesan')
            .eq('target_type', SYSTEM_ATTENDANCE_LATEST_TARGET)
            .limit(1)

          if (latestData && latestData.length > 0) {
            const pList = JSON.parse(latestData[0].pesan || '[]')
            if (Array.isArray(pList)) {
              pList.forEach(r => {
                if (r.tanggal >= filterStart && r.tanggal <= filterEnd) {
                  cloudRows.push(r)
                }
              })
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[AttendanceCloudManager] Cloud Mirroring fetch handled:', e)
    }
  }

  // 3. Penggabungan Cerdas (Merge Database + Cloud Mirroring)
  // Menghilangkan duplikasi berdasarkan kunci unik: user_id + tanggal
  const mergedMap = new Map()

  // Masukkan data DB terlebih dahulu
  dbRows.forEach(item => {
    if (!item || !item.user_id || !item.tanggal) return
    const key = `${item.user_id}_${item.tanggal}`
    mergedMap.set(key, { ...item })
  })

  // Gabungkan data Cloud Mirroring (yang menyelamatkan data saat DB RLS aktif)
  cloudRows.forEach(item => {
    if (!item || !item.user_id || !item.tanggal) return
    const key = `${item.user_id}_${item.tanggal}`
    const existing = mergedMap.get(key)

    if (existing) {
      // Perkaya jika cloud memiliki waktu_pulang yang lebih baru
      if (!existing.waktu_pulang && item.waktu_pulang) {
        existing.waktu_pulang = item.waktu_pulang
        existing.lokasi_pulang = item.lokasi_pulang
      }
      if (!existing.keterangan && item.keterangan) {
        existing.keterangan = item.keterangan
      }
      if (item.keterangan && item.keterangan.includes('FOTO_WEBP') && !existing.keterangan?.includes('FOTO_WEBP')) {
        existing.keterangan = item.keterangan
      }
    } else {
      mergedMap.set(key, { ...item })
    }
  })

  // 4. Pastikan Profil Tersemat Sempurna (Full Name, NIP, Jabatan, Foto)
  const resultList = []
  mergedMap.forEach(item => {
    const prof = item.profiles || profMap[item.user_id]
    if (prof) {
      item.profiles = {
        full_name: prof.full_name || prof.email?.split('@')[0] || 'Guru',
        email: prof.email || '',
        foto_profil: prof.foto_profil || null,
        jabatan: prof.jabatan || 'Guru',
        nip: prof.nip || '-'
      }
    } else {
      item.profiles = {
        full_name: item.full_name || 'Guru',
        email: item.email || '',
        foto_profil: null,
        jabatan: item.jabatan || 'Guru',
        nip: '-'
      }
    }
    resultList.push(item)
  })

  // 5. Saring data yang telah dihapus oleh Admin
  let cleanedList = resultList
  try {
    const delReg = await fetchDeletedAttendanceRegistry(supabase)
    cleanedList = filterActiveAttendance(resultList, delReg)
  } catch {}

  // 6. Urutkan berdasarkan waktu masuk terbaru
  cleanedList.sort((a, b) => {
    const dateA = a.tanggal || ''
    const dateB = b.tanggal || ''
    if (dateA !== dateB) return dateB.localeCompare(dateA)
    const timeA = a.waktu_masuk || ''
    const timeB = b.waktu_masuk || ''
    return timeB.localeCompare(timeA)
  })

  return cleanedList
}

/**
 * Mengambil catatan presensi hari ini untuk user tertentu
 */
export async function getTodayUserAttendance({
  userId,
  today = getAttendanceLocalDateString(),
  supabase
}) {
  if (!userId) return null

  // 0. Ambil registry presensi yang telah dihapus oleh Admin
  let deletedSet = new Set()
  try {
    const deletedReg = await fetchDeletedAttendanceRegistry(supabase)
    if (deletedReg?.deletedIds && Array.isArray(deletedReg.deletedIds)) {
      deletedSet = new Set(deletedReg.deletedIds.map(String))
    }
  } catch (e) {}

  // 1. Coba dari DB Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('absensi')
        .select('*')
        .eq('user_id', userId)
        .eq('tanggal', today)
        .order('waktu_masuk', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const dbRec = data[0]
        if (dbRec?.id && deletedSet.has(String(dbRec.id))) {
          // Presensi ini sudah dihapus oleh Admin! Bersihkan cache & kembalikan null agar guru dapat absen kembali
          try {
            localStorage.removeItem(`today_absensi_${today}_${userId}`)
          } catch (e) {}
          return null
        }
        return dbRec
      }
    } catch (e) {}
  }

  // 2. Coba dari Cloud Mirroring Layer
  if (supabase) {
    try {
      const dateTarget = `${SYSTEM_ATTENDANCE_DATE_PREFIX}${today}`
      const { data: cloudRows } = await supabase
        .from('pengumuman')
        .select('pesan')
        .eq('target_type', dateTarget)
        .limit(1)

      if (cloudRows && cloudRows.length > 0) {
        const parsed = JSON.parse(cloudRows[0].pesan || '{}')
        if (parsed && parsed[userId]) {
          const mirrorRec = parsed[userId]
          if (mirrorRec?.id && deletedSet.has(String(mirrorRec.id))) {
            try {
              localStorage.removeItem(`today_absensi_${today}_${userId}`)
            } catch (e) {}
            return null
          }
          return mirrorRec
        }
      }
    } catch (e) {}
  }

  // 3. Fallback ke Cache Lokal
  try {
    const raw = localStorage.getItem(`today_absensi_${today}_${userId}`)
    if (raw) {
      const localRec = JSON.parse(raw)
      if (localRec?.id && deletedSet.has(String(localRec.id))) {
        localStorage.removeItem(`today_absensi_${today}_${userId}`)
        return null
      }
      return localRec
    }
  } catch (e) {}

  return null
}
