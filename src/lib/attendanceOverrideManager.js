// Utility for Admin Attendance Override & Security System
import { isValidUUID, generateUUID } from './developerManager'
// Mengimplementasikan 6 Lapisan Keamanan:
// 1. Pembatasan Tanggal (Hanya Hari Ini & H-1)
// 2. Auto-Lock Sesi Token
// 3. Proteksi Anti-Brute Force (Salah 3x Terkunci 15 Menit)
// 4. Batasan Jam Riil (Anti Jam Masa Depan)
// 5. Peringatan Kuota Bulanan Guru (Maksimal 3x/Bulan)
// 6. Silent Audit Trail (Log Rahasia Khusus Pengembang)

export const OVERRIDE_TOKEN_TARGET = '__ADMIN_ATTENDANCE_OVERRIDE_TOKEN__'
export const AUDIT_LOG_TARGET = '__ADMIN_OVERRIDE_AUDIT_LOG__'
export const OVERRIDE_FEATURE_FLAG_TARGET = '__ADMIN_ATTENDANCE_OVERRIDE_ENABLED__'
export const OVERRIDE_QUOTA_TARGET = '__SYSTEM_OVERRIDE_QUOTA__'
export const KEPSEK_APPROVAL_TARGET = '__KEPSEK_OVERRIDE_APPROVAL_REQUEST__'

export const BASE_ADMIN_OVERRIDE_QUOTA = 2
export const MAX_KEPSEK_APPROVAL_QUOTA = 3

const LOCAL_STORAGE_TOKEN_KEY = 'panrita_admin_override_token'
const LOCAL_STORAGE_FEATURE_ENABLED_KEY = 'panrita_admin_override_feature_enabled'
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
    try {
      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', OVERRIDE_TOKEN_TARGET)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: JSON.stringify(payload), target_users: '' })
          .eq('id', existing[0].id)
      } else {
        const { error } = await supabase
          .from('pengumuman')
          .insert([{
            pesan: JSON.stringify(payload),
            target_type: OVERRIDE_TOKEN_TARGET,
            target_users: ''
          }])

        if (error) {
          console.error('Failed saving override token to cloud:', error)
        }
      }
    } catch (e) {
      console.warn('Error saving override token:', e)
    }
  }

  resetOverrideLockout()
  return { success: true, token }
}

/**
 * Mengambil status aktif/nonaktif fitur Presensi Khusus dari Cloud Supabase atau Cache
 * Default: true (aktif) jika belum pernah disetel
 */
export async function getOverrideFeatureStatus(supabase) {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('pesan, created_at')
        .eq('target_type', OVERRIDE_FEATURE_FLAG_TARGET)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        try {
          const parsed = JSON.parse(data[0].pesan)
          const isEnabled = parsed?.enabled !== false
          localStorage.setItem(LOCAL_STORAGE_FEATURE_ENABLED_KEY, isEnabled ? 'true' : 'false')
          return {
            enabled: isEnabled,
            updatedAt: parsed?.updatedAt || data[0].created_at
          }
        } catch (e) {
          const isEnabled = data[0].pesan === 'true' || data[0].pesan === true
          localStorage.setItem(LOCAL_STORAGE_FEATURE_ENABLED_KEY, isEnabled ? 'true' : 'false')
          return {
            enabled: isEnabled,
            updatedAt: data[0].created_at
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching override feature status from cloud:', err)
  }

  const cached = localStorage.getItem(LOCAL_STORAGE_FEATURE_ENABLED_KEY)
  if (cached !== null) {
    return { enabled: cached === 'true', updatedAt: null }
  }

  // Default aktif
  return { enabled: true, updatedAt: null }
}

/**
 * Mengatur status aktif/nonaktif fitur Presensi Khusus ke Cloud Supabase & Local
 */
export async function setOverrideFeatureStatus(supabase, enabled) {
  const isEnabled = Boolean(enabled)
  const payload = {
    enabled: isEnabled,
    updatedAt: new Date().toISOString()
  }

  localStorage.setItem(LOCAL_STORAGE_FEATURE_ENABLED_KEY, isEnabled ? 'true' : 'false')

  if (supabase) {
    const { data: existing } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', OVERRIDE_FEATURE_FLAG_TARGET)
      .limit(1)

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('pengumuman')
        .update({ pesan: JSON.stringify(payload), target_users: '' })
        .eq('id', existing[0].id)

      if (error) {
        console.error('Failed updating override feature status to cloud:', error)
        throw error
      }
    } else {
      const { error } = await supabase
        .from('pengumuman')
        .insert([{
          pesan: JSON.stringify(payload),
          target_type: OVERRIDE_FEATURE_FLAG_TARGET,
          target_users: ''
        }])

      if (error) {
        console.error('Failed saving override feature status to cloud:', error)
        throw error
      }
    }
  }

  return { success: true, enabled: isEnabled, updatedAt: payload.updatedAt }
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

    await supabase.from('pengumuman').insert([{
      pesan: JSON.stringify(entry),
      target_type: AUDIT_LOG_TARGET,
      target_users: ''
    }])
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
/**
 * Mengambil data top-up kuota presensi khusus dari Cloud Supabase
 */
export async function getCloudOverrideQuotas(supabase) {
  try {
    if (!supabase) return {}
    const { data, error } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', OVERRIDE_QUOTA_TARGET)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      try {
        const parsed = JSON.parse(data[0].pesan)
        return parsed || {}
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Gagal membaca kuota override dari cloud:', err)
  }
  return {}
}

/**
 * Menyimpan data top-up kuota presensi khusus ke Cloud Supabase
 */
export async function saveCloudOverrideQuotas(supabase, quotaMap) {
  if (!supabase) return false
  const payload = JSON.stringify(quotaMap || {})
  try {
    const { data: existing } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', OVERRIDE_QUOTA_TARGET)
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payload, target_users: '' })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          pesan: payload,
          target_type: OVERRIDE_QUOTA_TARGET,
          target_users: ''
        }])
    }
    return true
  } catch (err) {
    console.error('Gagal menyimpan kuota override ke cloud:', err)
    return false
  }
}

/**
 * Top up kuota untuk seorang pengguna oleh Pengembang
 */
export async function topUpUserOverrideQuota(supabase, { userId, amount = 1 }) {
  if (!userId) return false
  const quotas = await getCloudOverrideQuotas(supabase)
  const current = quotas[userId] || { bonus: 0 }
  quotas[userId] = {
    ...current,
    bonus: Math.max(0, (current.bonus || 0) + Number(amount)),
    updatedAt: new Date().toISOString()
  }
  return await saveCloudOverrideQuotas(supabase, quotas)
}

/**
 * Top up kuota untuk seluruh pengguna oleh Pengembang
 */
export async function topUpAllUsersOverrideQuota(supabase, { userIds = [], amount = 1 }) {
  const quotas = await getCloudOverrideQuotas(supabase)
  const now = new Date().toISOString()
  userIds.forEach(uid => {
    if (!uid) return
    const cur = quotas[uid] || { bonus: 0 }
    quotas[uid] = {
      ...cur,
      bonus: Math.max(0, (cur.bonus || 0) + Number(amount)),
      updatedAt: now
    }
  })
  return await saveCloudOverrideQuotas(supabase, quotas)
}

/**
 * Reset kuota tambahan pengguna oleh Pengembang
 */
export async function resetUserOverrideQuota(supabase, { userId }) {
  if (!userId) return false
  const quotas = await getCloudOverrideQuotas(supabase)
  if (quotas[userId]) {
    delete quotas[userId]
    return await saveCloudOverrideQuotas(supabase, quotas)
  }
  return true
}

/**
 * Menghitung statistik & status kuota presensi khusus (Skema 2 Tingkat)
 * Tingkat 1: Admin langsung (Default 2x + bonus)
 * Tingkat 2: Izin Kepala Sekolah (Maksimal 3x)
 * Tingkat 3: Habis total
 */
export async function getUserOverrideStats(supabase, teacherId, targetDateStr) {
  try {
    if (!supabase || !teacherId) {
      return {
        adminUsed: 0,
        adminLimit: BASE_ADMIN_OVERRIDE_QUOTA,
        adminRemaining: BASE_ADMIN_OVERRIDE_QUOTA,
        kepsekUsed: 0,
        kepsekLimit: MAX_KEPSEK_APPROVAL_QUOTA,
        kepsekRemaining: MAX_KEPSEK_APPROVAL_QUOTA,
        totalRemaining: BASE_ADMIN_OVERRIDE_QUOTA + MAX_KEPSEK_APPROVAL_QUOTA,
        bonusQuota: 0,
        level: 1,
        canExecuteDirectly: true,
        canRequestKepsek: false,
        isExhausted: false,
        message: ''
      }
    }

    let validTeacherId = teacherId
    if (!isValidUUID(validTeacherId)) {
      try {
        const { data: prof } = await supabase.from('profiles').select('id').or('role.eq.kepsek,jabatan.ilike.%kepala sekolah%').limit(1).maybeSingle()
        if (prof?.id && isValidUUID(prof.id)) {
          validTeacherId = prof.id
        }
      } catch (e) {}
    }

    const [year, month] = (targetDateStr || getLocalDateString()).split('-')
    const firstDay = `${year}-${month}-01`
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0)
    const lastDayStr = `${year}-${month}-${String(lastDay.getDate()).padStart(2, '0')}`

    const [attRes, cloudQuotas] = await Promise.all([
      supabase
        .from('absensi')
        .select('id, lokasi_masuk, lokasi_pulang, keterangan')
        .eq('user_id', validTeacherId)
        .gte('tanggal', firstDay)
        .lte('tanggal', lastDayStr),
      getCloudOverrideQuotas(supabase)
    ])

    const records = attRes.data || []
    let adminUsed = 0
    let kepsekUsed = 0

    records.forEach(r => {
      const isDisp = r.lokasi_masuk === 'Dispensasi Admin' || 
                     r.lokasi_pulang === 'Dispensasi Admin' || 
                     (r.keterangan || '').includes('Presensi Khusus')

      if (isDisp) {
        const isKepsekApproved = (r.keterangan || '').toLowerCase().includes('disetujui kepala sekolah')
        if (isKepsekApproved) {
          kepsekUsed++
        } else {
          adminUsed++
        }
      }
    })

    const userBonus = cloudQuotas[validTeacherId]?.bonus || 0
    const adminLimit = BASE_ADMIN_OVERRIDE_QUOTA + userBonus
    const adminRemaining = Math.max(0, adminLimit - adminUsed)

    const kepsekLimit = MAX_KEPSEK_APPROVAL_QUOTA
    const kepsekRemaining = Math.max(0, kepsekLimit - kepsekUsed)
    const totalRemaining = adminRemaining + kepsekRemaining

    let level = 1
    let canExecuteDirectly = true
    let canRequestKepsek = false
    let isExhausted = false
    let message = ''

    if (adminRemaining > 0) {
      level = 1
      canExecuteDirectly = true
      canRequestKepsek = false
      isExhausted = false
      message = `Sisa kuota langsung: ${adminRemaining}x dari ${adminLimit}x.`
    } else if (kepsekRemaining > 0) {
      level = 2
      canExecuteDirectly = false
      canRequestKepsek = true
      isExhausted = false
      message = 'Kuota Presensi Khusus Habis (Sudah digunakan 2x). Memerlukan persetujuan di akun Kepala Sekolah.'
    } else {
      level = 3
      canExecuteDirectly = false
      canRequestKepsek = false
      isExhausted = true
      message = 'Kuota Presensi Khusus Habis'
    }

    return {
      adminUsed,
      adminLimit,
      adminRemaining,
      kepsekUsed,
      kepsekLimit,
      kepsekRemaining,
      totalRemaining,
      bonusQuota: userBonus,
      level,
      canExecuteDirectly,
      canRequestKepsek,
      isExhausted,
      message
    }
  } catch (err) {
    console.warn('Gagal menghitung statistik override:', err)
    return {
      adminUsed: 0,
      adminLimit: BASE_ADMIN_OVERRIDE_QUOTA,
      adminRemaining: BASE_ADMIN_OVERRIDE_QUOTA,
      kepsekUsed: 0,
      kepsekLimit: MAX_KEPSEK_APPROVAL_QUOTA,
      kepsekRemaining: MAX_KEPSEK_APPROVAL_QUOTA,
      totalRemaining: BASE_ADMIN_OVERRIDE_QUOTA + MAX_KEPSEK_APPROVAL_QUOTA,
      bonusQuota: 0,
      level: 1,
      canExecuteDirectly: true,
      canRequestKepsek: false,
      isExhausted: false,
      message: ''
    }
  }
}

export async function getTeacherMonthlyOverrideCount(supabase, teacherId, targetDateStr) {
  try {
    if (!supabase || !teacherId) return 0
    let validTeacherId = teacherId
    if (!isValidUUID(validTeacherId)) {
      try {
        const { data: prof } = await supabase.from('profiles').select('id').or('role.eq.kepsek,jabatan.ilike.%kepala sekolah%').limit(1).maybeSingle()
        if (prof?.id && isValidUUID(prof.id)) {
          validTeacherId = prof.id
        } else {
          return 0
        }
      } catch (e) {
        return 0
      }
    }
    const [year, month] = (targetDateStr || getLocalDateString()).split('-')
    const firstDay = `${year}-${month}-01`
    const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0)
    const lastDayStr = `${year}-${month}-${String(lastDay.getDate()).padStart(2, '0')}`

    const { data, error } = await supabase
      .from('absensi')
      .select('id, lokasi_masuk, lokasi_pulang')
      .eq('user_id', validTeacherId)
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
  reason = '',
  adminUserId,
  adminUserName = 'Administrator',
  isApprovedByKepsek = false
}) {
  if (!supabase) throw new Error('Koneksi Supabase tidak aktif.')
  if (!targetUserId) throw new Error('Silakan pilih pegawai terlebih dahulu.')
  
  // 1. Safeguard: Anti-self-approval
  if (targetUserId === adminUserId) {
    throw new Error('Akun Admin tidak diizinkan mengubah presensi diri sendiri.')
  }

  // Validasi dan resolusi UUID agar tidak menyebabkan error PostgreSQL "invalid input syntax for type uuid"
  let effectiveUserId = targetUserId
  if (!isValidUUID(effectiveUserId)) {
    try {
      const isKepsekTarget = targetUserRole?.toLowerCase().includes('kepala sekolah') || targetUserId === 'kepsek-active-id'
      const { data: prof } = await supabase.from('profiles').select('id').or(isKepsekTarget ? 'role.eq.kepsek,jabatan.ilike.%kepala sekolah%' : `full_name.ilike.%${targetUserName}%`).limit(1).maybeSingle()
      if (prof?.id && isValidUUID(prof.id)) {
        effectiveUserId = prof.id
      } else {
        effectiveUserId = generateUUID()
        await supabase.from('profiles').upsert([{
          id: effectiveUserId,
          full_name: targetUserName,
          role: isKepsekTarget ? 'kepsek' : 'guru'
        }], { onConflict: 'id' }).catch(() => {})
      }
    } catch (e) {
      effectiveUserId = generateUUID()
    }
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
    .eq('user_id', effectiveUserId)
    .eq('tanggal', targetDateStr)
    .maybeSingle()

  if (fetchErr) {
    console.error('Error checking existing attendance:', fetchErr)
  }

  const handleDbError = (err) => {
    if (err?.message?.toLowerCase().includes('row-level security') || err?.code === '42501') {
      throw new Error("Akses database ditolak oleh Row-Level Security (RLS) Supabase untuk tabel 'absensi'. Silakan jalankan script SQL 'fix_rls_absensi_admin.sql' di Supabase SQL Editor.")
    }
    throw err
  }

  let finalResult = null

  if (actionType === 'clock_out') {
    if (existing) {
      const baseKet = reason.trim() ? `Presensi Khusus: ${reason.trim()}` : 'Presensi Khusus'
      const fullKet = isApprovedByKepsek ? `${baseKet} | Disetujui Kepala Sekolah` : `${baseKet} | Dispensasi Admin`
      const updatedKet = existing.keterangan ? `${existing.keterangan} | ${fullKet}` : fullKet

      const { data, error } = await supabase
        .from('absensi')
        .update({
          waktu_pulang: targetIsoTime,
          lokasi_pulang: 'Dispensasi Admin',
          keterangan: updatedKet
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) handleDbError(error)
      finalResult = { action: 'clock_out', data }
    } else {
      const baseKet = reason.trim() ? `Presensi Khusus: ${reason.trim()}` : 'Presensi Khusus'
      const fullKet = isApprovedByKepsek ? `${baseKet} | Disetujui Kepala Sekolah` : `${baseKet} | Dispensasi Admin`

      const { data, error } = await supabase
        .from('absensi')
        .insert({
          user_id: effectiveUserId,
          tanggal: targetDateStr,
          waktu_masuk: targetIsoTime,
          waktu_pulang: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          lokasi_pulang: 'Dispensasi Admin',
          status: 'hadir',
          keterangan: fullKet
        })
        .select()
        .single()

      if (error) handleDbError(error)
      finalResult = { action: 'clock_out', data }
    }
  } else if (actionType === 'clock_in') {
    if (existing) {
      const baseKet = reason.trim() ? `Presensi Khusus: ${reason.trim()}` : 'Presensi Khusus'
      const fullKet = isApprovedByKepsek ? `${baseKet} | Disetujui Kepala Sekolah` : `${baseKet} | Dispensasi Admin`
      const updatedKet = existing.keterangan ? `${existing.keterangan} | ${fullKet}` : fullKet

      const { data, error } = await supabase
        .from('absensi')
        .update({
          waktu_masuk: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          status: 'hadir',
          keterangan: updatedKet
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) handleDbError(error)
      finalResult = { action: 'clock_in', data }
    } else {
      const baseKet = reason.trim() ? `Presensi Khusus: ${reason.trim()}` : 'Presensi Khusus'
      const fullKet = isApprovedByKepsek ? `${baseKet} | Disetujui Kepala Sekolah` : `${baseKet} | Dispensasi Admin`

      const { data, error } = await supabase
        .from('absensi')
        .insert({
          user_id: effectiveUserId,
          tanggal: targetDateStr,
          waktu_masuk: targetIsoTime,
          lokasi_masuk: 'Dispensasi Admin',
          status: 'hadir',
          keterangan: fullKet
        })
        .select()
        .single()

      if (error) handleDbError(error)
      finalResult = { action: 'clock_in', data }
    }
  }

  // 4. Catat Silent Audit Log secara rahasia
  await saveOverrideAuditLog(supabase, {
    adminId: adminUserId,
    adminName: adminUserName,
    targetUserId: effectiveUserId,
    targetUserName,
    targetUserRole,
    actionType,
    targetDate: targetDateStr,
    targetTime: targetTimeStr,
    reason: reason.trim(),
    isApprovedByKepsek: Boolean(isApprovedByKepsek),
    isoTimestamp: targetIsoTime
  })

  return { success: true, ...finalResult }
}


/**
 * Mengajukan permohonan persetujuan Presensi Khusus ke akun Kepala Sekolah
 */
export async function submitKepsekApprovalRequest(supabase, {
  targetUserId,
  targetUserName,
  targetUserRole = 'Guru',
  actionType,
  date,
  timeStr,
  reason,
  adminUserId,
  adminUserName = 'Administrator'
}) {
  if (!supabase) throw new Error('Koneksi Supabase tidak aktif.')
  if (!targetUserId) throw new Error('Pegawai belum dipilih.')
  if (!reason || !reason.trim()) throw new Error('Alasan presensi khusus wajib diisi!')

  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  const payload = {
    id: requestId,
    targetUserId,
    targetUserName,
    targetUserRole,
    actionType,
    date,
    timeStr,
    reason: reason.trim(),
    adminUserId,
    adminUserName,
    status: 'pending', // 'pending' | 'approved' | 'rejected'
    createdAt: new Date().toISOString()
  }

  const { error } = await supabase.from('pengumuman').insert([{
    pesan: JSON.stringify(payload),
    target_type: KEPSEK_APPROVAL_TARGET,
    target_users: ''
  }])

  if (error) {
    console.error('Failed submitting kepsek approval request:', error)
    throw new Error('Gagal mengirim permohonan ke akun Kepala Sekolah: ' + error.message)
  }

  return { success: true, requestId, payload }
}

/**
 * Mengambil daftar permohonan persetujuan Presensi Khusus untuk Kepala Sekolah
 */
export async function fetchKepsekApprovalRequests(supabase) {
  try {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('pengumuman')
      .select('id, pesan, created_at')
      .eq('target_type', KEPSEK_APPROVAL_TARGET)
      .order('id', { ascending: false })
      .limit(50)

    if (error || !data) return []

    const requests = []
    data.forEach(item => {
      try {
        const parsed = JSON.parse(item.pesan)
        requests.push({
          ...parsed,
          dbRecordId: item.id,
          createdAt: parsed.createdAt || item.created_at
        })
      } catch (e) {}
    })
    return requests
  } catch (err) {
    console.warn('Gagal membaca permohonan approval kepsek:', err)
    return []
  }
}

/**
 * Menyelesaikan permohonan persetujuan oleh Kepala Sekolah ('approved' | 'rejected')
 */
export async function resolveKepsekApprovalRequest(supabase, {
  dbRecordId,
  requestId,
  decision, // 'approved' | 'rejected'
  kepsekUserId,
  kepsekUserName = 'Kepala Sekolah',
  rejectionReason = ''
}) {
  if (!supabase) throw new Error('Koneksi Supabase tidak aktif.')

  // 1. Ambil data permohonan dari database
  let targetItem = null
  let dbId = dbRecordId

  if (dbId) {
    const { data } = await supabase.from('pengumuman').select('id, pesan').eq('id', dbId).maybeSingle()
    if (data) {
      try { targetItem = JSON.parse(data.pesan) } catch (e) {}
    }
  }

  if (!targetItem) {
    const all = await fetchKepsekApprovalRequests(supabase)
    const match = all.find(r => r.id === requestId || r.dbRecordId === dbRecordId)
    if (match) {
      targetItem = match
      dbId = match.dbRecordId
    }
  }

  if (!targetItem) {
    throw new Error('Permohonan tidak ditemukan di sistem.')
  }

  const isApproved = decision === 'approved'
  const resolvedPayload = {
    ...targetItem,
    status: isApproved ? 'approved' : 'rejected',
    resolvedByKepsekId: kepsekUserId,
    resolvedByKepsekName: kepsekUserName,
    resolvedAt: new Date().toISOString(),
    rejectionReason: rejectionReason || ''
  }

  // Update status permohonan di database
  if (dbId) {
    await supabase
      .from('pengumuman')
      .update({ pesan: JSON.stringify(resolvedPayload) })
      .eq('id', dbId)
  }

  // Jika disetujui, eksekusi pencatatan presensi khusus dengan status Disetujui Kepala Sekolah
  if (isApproved) {
    await executeAdminAttendanceOverride(supabase, {
      targetUserId: targetItem.targetUserId,
      targetUserName: targetItem.targetUserName,
      targetUserRole: targetItem.targetUserRole,
      actionType: targetItem.actionType,
      date: targetItem.date,
      timeStr: targetItem.timeStr,
      reason: targetItem.reason,
      adminUserId: targetItem.adminUserId,
      adminUserName: targetItem.adminUserName,
      isApprovedByKepsek: true
    })
  }

  return { success: true, decision, resolvedPayload }
}
