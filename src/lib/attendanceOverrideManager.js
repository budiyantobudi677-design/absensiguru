// Utility for Admin Attendance Override & Security System
// Mengimplementasikan 6 Lapisan Keamanan:
// 1. Pembatasan Tanggal (Hanya Hari Ini & H-1)
// 2. Auto-Lock Sesi Token
// 3. Proteksi Anti-Brute Force (Salah 3x Terkunci 15 Menit)
// 4. Batasan Jam Riil (Anti Jam Masa Depan)
// 5. Peringatan Kuota Bulanan Guru (Maksimal 3x/Bulan)
// 6. Silent Audit Trail (Log Rahasia Khusus Pengembang)

export const OVERRIDE_TOKEN_TARGET = '__ADMIN_ATTENDANCE_OVERRIDE_TOKEN__'
export const AUDIT_LOG_TARGET = '__ADMIN_OVERRIDE_AUDIT_LOG__'

const LOCAL_STORAGE_TOKEN_KEY = 'panrita_admin_override_token'
const LOCKOUT_KEY = 'panrita_override_lockout_until'
const ATTEMPTS_KEY = 'panrita_override_failed_attempts'

/**
 * Format tanggal lokal YYYY-MM-DD
 */
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format jam lokal HH:mm
 */
export function getLocalTimeString(d = new Date()) {
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Cek status lockout brute force (apakah sedang terkunci)
 */
export function checkOverrideLockout() {
  try {
    const lockoutUntil = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10)
    const now = Date.now()
    if (lockoutUntil && now < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000)
      return { isLocked: true, remainingSeconds }
    }
  } catch (e) {}
  return { isLocked: false, remainingSeconds: 0 }
}

/**
 * Catat percobaan gagal dan kunci jika sudah 3x berturut-turut
 */
export function recordOverrideFailedAttempt() {
  try {
    let attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1
    localStorage.setItem(ATTEMPTS_KEY, attempts.toString())

    if (attempts >= 3) {
      // Kunci selama 15 menit (15 * 60 * 1000 ms)
      const lockoutUntil = Date.now() + 15 * 60 * 1000
      localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString())
      return { isLocked: true, remainingSeconds: 15 * 60, remainingAttempts: 0 }
    }
    return { isLocked: false, remainingSeconds: 0, remainingAttempts: 3 - attempts }
  } catch (e) {}
  return { isLocked: false, remainingSeconds: 0, remainingAttempts: 1 }
}

/**
 * Reset lockout setelah berhasil login token
 */
export function resetOverrideLockout() {
  try {
    localStorage.removeItem(LOCKOUT_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch (e) {}
}

/**
 * Mengambil kode token override aktif dari Cloud Supabase atau Cache
 */
export async function getCloudOverrideToken(supabase) {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('pesan, created_at')
        .eq('target_type', OVERRIDE_TOKEN_TARGET)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        try {
          const parsed = JSON.parse(data[0].pesan)
          if (parsed?.token) {
            localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, parsed.token)
            return {
              token: parsed.token,
              exists: true,
              updatedAt: parsed.updatedAt || data[0].created_at
            }
          }
        } catch (e) {
          if (typeof data[0].pesan === 'string' && data[0].pesan.trim()) {
            return {
              token: data[0].pesan.trim(),
              exists: true,
              updatedAt: data[0].created_at
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching override token from cloud:', err)
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY)
  if (cached && cached.trim()) {
    return { token: cached.trim(), exists: true, updatedAt: null }
  }

  return { token: '', exists: false, updatedAt: null }
}

/**
 * Menyimpan / memperbarui kode token override ke Cloud Supabase & Local
 */
export async function saveCloudOverrideToken(supabase, rawToken) {
  const token = String(rawToken || '').trim()
  if (!token) {
    throw new Error('Kode token tidak boleh kosong.')
  }

  const payload = {
    token,
    updatedAt: new Date().toISOString()
  }

  localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, token)

  if (supabase) {
    const { error } = await supabase
      .from('pengumuman')
      .insert({
        judul: 'SISTEM CONFIG: TOKEN OVERRIDE ADMIN',
        pesan: JSON.stringify(payload),
        target_type: OVERRIDE_TOKEN_TARGET,
        target_role: 'admin'
      })

    if (error) {
      console.error('Failed saving override token to cloud:', error)
    }
  }

  resetOverrideLockout()
  return { success: true, token }
}

/**
 * Verifikasi input token dari admin dengan proteksi anti-brute force
 */
export async function verifyAdminOverrideToken(supabase, inputToken) {
  // 1. Cek apakah sedang terkunci brute force
  const lockout = checkOverrideLockout()
  if (lockout.isLocked) {
    const minutes = Math.ceil(lockout.remainingSeconds / 60)
    return {
      success: false,
      notConfigured: false,
      isLocked: true,
      remainingSeconds: lockout.remainingSeconds,
      error: `Akses dibekukan sementara demi keamanan. Silakan tunggu ${minutes} menit lagi atau hubungi Pengembang.`
    }
  }

  const { token: activeToken, exists } = await getCloudOverrideToken(supabase)
  
  if (!exists) {
    return { success: false, notConfigured: true, isLocked: false }
  }

  if (inputToken.trim() === activeToken.trim()) {
    resetOverrideLockout()
    return { success: true, notConfigured: false, isLocked: false }
  }

  // Jika salah, catat percobaan gagal
  const failStatus = recordOverrideFailedAttempt()
  if (failStatus.isLocked) {
    return {
      success: false,
      notConfigured: false,
      isLocked: true,
      remainingSeconds: failStatus.remainingSeconds,
      error: 'Akses dibekukan selama 15 menit karena 3 kali percobaan token salah berturut-turut.'
    }
  }

  return {
    success: false,
    notConfigured: false,
    isLocked: false,
    error: `Kode Token salah! Sisa percobaan: ${failStatus.remainingAttempts}x.`
  }
}

/**
 * Simpan Silent Audit Log ke Cloud Supabase (hanya bisa dilihat Pengembang)
 */
export async function saveOverrideAuditLog(supabase, logData) {
  try {
    if (!supabase) return
    const entry = {
      ...logData,
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      createdAt: new Date().toISOString()
    }

    await supabase.from('pengumuman').insert({
      judul: 'AUDIT_LOG_OVERRIDE',
      pesan: JSON.stringify(entry),
      target_type: AUDIT_LOG_TARGET,
      target_role: 'pengembang'
    })
  } catch (err) {
    console.warn('Gagal menyimpan silent audit log:', err)
  }
}

/**
 * Mengambil riwayat Silent Audit Log (Khusus Halaman Pengembang)
 */
export async function fetchOverrideAuditLogs(supabase) {
  try {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('pengumuman')
      .select('id, pesan, created_at')
      .eq('target_type', AUDIT_LOG_TARGET)
      .order('id', { ascending: false })
      .limit(50)

    if (error || !data) return []

    const logs = []
    data.forEach(item => {
      try {
        const parsed = JSON.parse(item.pesan)
        logs.push({
          ...parsed,
          dbCreatedAt: item.created_at
        })
      } catch (e) {}
    })
    return logs
  } catch (err) {
    console.warn('Gagal membaca audit logs:', err)
    return []
  }
}

/**
 * Cek jumlah dispensasi presensi khusus yang sudah diterima seorang guru dalam 1 bulan
 */
export async function getTeacherMonthlyOverrideCount(supabase, teacherId, targetDateStr) {
  try {
    if (!supabase || !teacherId) return 0
    const [year, month] = (targetDateStr || getLocalDateString()).split('-')
    const firstDay = `${year}-${month}-01`
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0)
    const lastDayStr = `${year}-${month}-${String(lastDay.getDate()).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('absensi')
      .select('id, lokasi_masuk, lokasi_pulang')
      .eq('user_id', teacherId)
      .gte('tanggal', firstDay)
      .lte('tanggal', lastDayStr)

    if (error || !data) return 0

    // Hitung record yang ditandai 'Dispensasi Admin'
    const count = data.filter(r => 
      r.lokasi_masuk === 'Dispensasi Admin' || r.lokasi_pulang === 'Dispensasi Admin'
    ).length

    return count
  } catch (err) {
    console.warn('Gagal menghitung kuota bulanan:', err)
    return 0
  }
}

/**
 * Eksekusi Clock In / Clock Out khusus oleh Admin
 * Memvalidasi 6 lapisan keamanan:
 * 1. Anti Self-Approval (targetUserId !== adminUserId)
 * 2. Kunci Tanggal Lampau (Hanya Hari Ini & H-1)
 * 3. Anti Jam Masa Depan (Jika hari ini, jam tidak boleh melebihi jam sekarang)
 * 4. Silent Audit Trail otomatis tersimpan
 */
export async function executeAdminAttendanceOverride(supabase, {
  targetUserId,
  targetUserName = 'Pegawai',
  targetUserRole = 'Guru',
  actionType, // 'clock_out' | 'clock_in'
  date,       // 'YYYY-MM-DD'
  timeStr,    // 'HH:mm'
  adminUserId,
  adminUserName = 'Administrator'
}) {
  if (!supabase) throw new Error('Koneksi Supabase tidak aktif.')
  if (!targetUserId) throw new Error('Silakan pilih pegawai terlebih dahulu.')
  
  // 1. Safeguard: Anti-self-approval
  if (targetUserId === adminUserId) {
    throw new Error('Akun Admin tidak diizinkan mengubah presensi diri sendiri.')
  }

  const now = new Date()
  const todayStr = getLocalDateString(now)
  const yesterdayObj = new Date(now)
  yesterdayObj.setDate(yesterdayObj.getDate() - 1)
  const yesterdayStr = getLocalDateString(yesterdayObj)

  const targetDateStr = date || todayStr
  const targetTimeStr = timeStr || getLocalTimeString(now)

  // 2. Safeguard: Kunci Tanggal Lampau (Maksimal H-1, tidak boleh masa depan)
  if (targetDateStr > todayStr) {
    throw new Error('Tanggal tidak boleh melebihi hari ini.')
  }
  if (targetDateStr < yesterdayStr) {
    throw new Error('Penyelarasan presensi dibatasi maksimal H-1 (Kemarin) demi keamanan data.')
  }

  // 3. Safeguard: Anti Jam Masa Depan (Khusus jika tanggal adalah Hari Ini)
  if (targetDateStr === todayStr) {
    const currentLocalTime = getLocalTimeString(now)
    if (targetTimeStr > currentLocalTime) {
      throw new Error(`Jam tidak boleh melampaui waktu sekarang (${currentLocalTime}).`)
    }
  }

  // Buat timestamp ISO lokal yang presisi
  const [hours, minutes] = targetTimeStr.split(':')
  const dateObj = new Date(targetDateStr)
  dateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
  const targetIsoTime = dateObj.toISOString()

  // Cek apakah sudah ada record absensi untuk pegawai pada tanggal tersebut
  const { data: existing, error: fetchErr } = await supabase
    .from('absensi')
    .select('*')
    .eq('user_id', targetUserId)
    .eq('tanggal', targetDateStr)
    .maybeSingle()

  if (fetchErr) {
    console.error('Error checking existing attendance:', fetchErr)
  }

  let finalResult = null

  if (actionType === 'clock_out') {
    if (existing) {
      const { data, error } = await supabase
        .from('absensi')
        .update({
          waktu_pulang: targetIsoTime,
          lokasi_pulang: 'Dispensasi Admin'
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      finalResult = { action: 'clock_out', data }
    } else {
      const { data, error } = await supabase
        .from('absensi')
        .insert({
          user_id: targetUserId,
          tanggal: targetDateStr,
          waktu_masuk: targetIsoTime,
          waktu_pulang: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          lokasi_pulang: 'Dispensasi Admin',
          status: 'hadir'
        })
        .select()
        .single()

      if (error) throw error
      finalResult = { action: 'clock_out', data }
    }
  } else if (actionType === 'clock_in') {
    if (existing) {
      const { data, error } = await supabase
        .from('absensi')
        .update({
          waktu_masuk: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          status: 'hadir'
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      finalResult = { action: 'clock_in', data }
    } else {
      const { data, error } = await supabase
        .from('absensi')
        .insert({
          user_id: targetUserId,
          tanggal: targetDateStr,
          waktu_masuk: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          status: 'hadir'
        })
        .select()
        .single()

      if (error) throw error
      finalResult = { action: 'clock_in', data }
    }
  }

  // 4. Catat Silent Audit Log secara rahasia
  await saveOverrideAuditLog(supabase, {
    adminId: adminUserId,
    adminName: adminUserName,
    targetUserId,
    targetUserName,
    targetUserRole,
    actionType,
    targetDate: targetDateStr,
    targetTime: targetTimeStr,
    isoTimestamp: targetIsoTime
  })

  return { success: true, ...finalResult }
}
