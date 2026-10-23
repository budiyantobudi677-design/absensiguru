// Utility for Developer Master Key Authentication & Security
// Menggunakan enkripsi satu arah SHA-256 + Salt (Anti-Bocor) & Proteksi Brute-Force
import { markAccountAsDeletedInCloud } from './deletedAccountsManager'
import { resetDeviceBinding } from './deviceManager'

const DEV_KEY_TARGET = '__SYSTEM_DEVELOPER_KEY_CONFIG__'
const SALT = 'panrita_dev_salt_2026_xyz'

// Default SHA-256 Hash untuk 'PANRITA2026DEV#' + SALT
const DEFAULT_HASH = 'bca6a143d6a2e64459d68a176774bbc79a61b3522f90edfe5944b910eb90bb99'

const LOCKOUT_KEY = 'panrita_dev_lockout_until'
const ATTEMPTS_KEY = 'panrita_dev_failed_attempts'
const SESSION_KEY = 'panrita_developer_session'

/**
 * Menghitung SHA-256 string menggunakan Web Crypto API
 */
export async function hashDeveloperKey(keyString) {
  const combined = keyString + SALT
  const msgBuffer = new TextEncoder().encode(combined)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Memeriksa status brute force (apakah sedang terkunci)
 */
export function checkBruteForceLockout() {
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
 * Mencatat percobaan gagal dan mengunci jika sudah 3x
 */
export function recordFailedAttempt() {
  try {
    let attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1
    localStorage.setItem(ATTEMPTS_KEY, attempts.toString())

    if (attempts >= 3) {
      // Kunci selama 15 menit (15 * 60 * 1000 ms)
      const lockoutUntil = Date.now() + 15 * 60 * 1000
      localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString())
      return { isLocked: true, remainingSeconds: 15 * 60 }
    }
    return { isLocked: false, remainingAttempts: 3 - attempts }
  } catch (e) {}
  return { isLocked: false, remainingAttempts: 1 }
}

/**
 * Mereset counter percobaan setelah berhasil login
 */
export function resetLockout() {
  try {
    localStorage.removeItem(LOCKOUT_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch (e) {}
}

/**
 * Mengambil hash master key yang aktif dari Cloud Supabase atau default
 */
export async function getActiveDeveloperHash(supabase) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('pesan')
        .eq('target_type', DEV_KEY_TARGET)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const parsed = JSON.parse(data[0].pesan)
        if (parsed?.keyHash) {
          return parsed.keyHash
        }
      }
    } catch (e) {
      console.warn('Error fetching developer hash from cloud:', e)
    }
  }
  return DEFAULT_HASH
}

/**
 * Verifikasi Kode Akses Pengembang
 */
export async function verifyDeveloperKey(inputCode, supabase) {
  // 1. Cek lockout brute force
  const lockout = checkBruteForceLockout()
  if (lockout.isLocked) {
    return {
      success: false,
      error: `Akses dibekukan sementara demi keamanan. Silakan tunggu ${Math.ceil(lockout.remainingSeconds / 60)} menit lagi.`
    }
  }

  // 2. Hash input
  const inputHash = await hashDeveloperKey(inputCode.trim())
  const activeHash = await getActiveDeveloperHash(supabase)

  if (inputHash === activeHash) {
    // Berhasil!
    resetLockout()
    createDeveloperSession()
    return { success: true }
  } else {
    // Gagal
    const failStatus = recordFailedAttempt()
    if (failStatus.isLocked) {
      return {
        success: false,
        error: 'Akses dibekukan selama 15 menit karena 3 kali percobaan salah berturut-turut.'
      }
    }
    return {
      success: false,
      error: `Kode Kunci Pengembang salah! Sisa percobaan: ${failStatus.remainingAttempts}x.`
    }
  }
}

/**
 * Membuat sesi pengembang sementara (Ephemeral Session 2 Jam)
 */
export function createDeveloperSession() {
  try {
    const sessionData = {
      role: 'pengembang',
      user: {
        id: 'developer-master-uid',
        email: 'developer@panrita.edu',
        role: 'pengembang',
        full_name: 'Pengembang Sistem (Super Admin)'
      },
      expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 Jam
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
    localStorage.setItem('panrita_role_developer-master-uid', 'pengembang')
    window.dispatchEvent(new Event('developer_session_updated'))
    return sessionData
  } catch (e) {}
}

/**
 * Mengambil sesi pengembang aktif jika belum kedaluwarsa
 */
export function getDeveloperSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.expiresAt && Date.now() < parsed.expiresAt) {
      return parsed
    }
    // Jika kedaluwarsa, bersihkan
    localStorage.removeItem(SESSION_KEY)
  } catch (e) {}
  return null
}

/**
 * Menghapus sesi pengembang (Logout)
 */
export function clearDeveloperSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
    window.dispatchEvent(new Event('developer_session_updated'))
  } catch (e) {}
}

/**
 * Mengubah Master Key Pengembang
 */
export async function updateDeveloperMasterKey(newCode, supabase) {
  if (!newCode || newCode.length < 6) {
    throw new Error('Kode kunci baru minimal 6 karakter.')
  }
  const newHash = await hashDeveloperKey(newCode.trim())

  if (supabase) {
    const payload = JSON.stringify({
      keyHash: newHash,
      updatedAt: new Date().toISOString()
    })

    const { data: existing } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', DEV_KEY_TARGET)
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payload })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          pesan: payload,
          target_type: DEV_KEY_TARGET,
          target_users: ''
        }])
    }
  }

  return true
}

// Target konfig khusus untuk kredensial akun admin & kepsek yang dikelola oleh Pengembang
const ADMIN_CREDENTIALS_TARGET = '__SYSTEM_ADMIN_CREDENTIALS__'
const KEPSEK_CREDENTIALS_TARGET = '__SYSTEM_KEPSEK_CREDENTIALS__'
const LEADER_CREDENTIALS_PREFIX = '__SYSTEM_LEADER_CREDENTIALS_'

/**
 * Mengambil kredensial kustom admin jika diatur oleh pengembang
 */
export async function getAdminOverrideCredentials(supabase) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', ADMIN_CREDENTIALS_TARGET)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      return JSON.parse(data[0].pesan)
    }
  } catch (e) {
    console.warn('Error fetching admin credentials override:', e)
  }
  return null
}

/**
 * Mengambil kredensial kustom kepala sekolah jika diatur oleh pengembang
 */
export async function getKepsekOverrideCredentials(supabase) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', KEPSEK_CREDENTIALS_TARGET)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      return JSON.parse(data[0].pesan)
    }
  } catch (e) {
    console.warn('Error fetching kepsek credentials override:', e)
  }
  return null
}

/**
 * Mengupdate atau mengatur ulang Akun Email & Password Admin dari Console Pengembang (Kompatibilitas)
 */
export async function updateAdminAccountCredentials({ email, password, supabase }) {
  return updateLeaderAccountCredentials({
    role: 'admin',
    email,
    password,
    fullName: 'Administrator Sekolah',
    supabase
  })
}

/**
 * Mengupdate atau mengatur Akun Email & Password Pimpinan (Admin / Kepala Sekolah)
 * Mendukung pembaharuan akun umum maupun akun spesifik berdasarkan ID
 */
export async function updateLeaderAccountCredentials({
  role = 'admin',
  email,
  password,
  fullName = '',
  supabase,
  targetUserId = null
}) {
  if (!email || !email.includes('@')) {
    throw new Error('Format email tidak valid.')
  }
  if (password && password.length < 6) {
    throw new Error('Password baru minimal 6 karakter.')
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanRole = (role === 'kepsek') ? 'kepsek' : 'admin'
  const defaultName = cleanRole === 'kepsek' ? 'Kepala Sekolah' : 'Administrator Sekolah'
  const cleanFullName = (fullName || defaultName).trim()

  let passwordHash = null
  if (password) {
    passwordHash = await hashDeveloperKey(password)
  }

  const payloadObj = {
    email: cleanEmail,
    role: cleanRole,
    fullName: cleanFullName,
    userId: targetUserId || undefined,
    updatedAt: new Date().toISOString()
  }
  if (passwordHash) {
    payloadObj.passwordHash = passwordHash
  }

  const mainTarget = cleanRole === 'kepsek' ? KEPSEK_CREDENTIALS_TARGET : ADMIN_CREDENTIALS_TARGET

  // Deteksi email lama yang akan digantikan agar langsung dinonaktifkan permanen dan diblokir login
  let oldEmail = null
  try {
    if (targetUserId) {
      const { data: prof } = await supabase.from('profiles').select('email').eq('id', targetUserId).maybeSingle()
      if (prof?.email) oldEmail = prof.email
    }
    if (!oldEmail) {
      const existingMain = cleanRole === 'kepsek' 
        ? await getKepsekOverrideCredentials(supabase) 
        : await getAdminOverrideCredentials(supabase)
      if (existingMain?.email) oldEmail = existingMain.email
    }
    if (!oldEmail) {
      const { data: matchedProf } = await supabase.from('profiles').select('email').eq('role', cleanRole).limit(1)
      if (matchedProf?.[0]?.email) oldEmail = matchedProf[0].email
    }
  } catch (e) {
    console.warn('Could not determine old leader email:', e)
  }

  // Jika email baru berbeda dengan email lama, masukkan email lama ke Deleted Accounts Registry seketika
  if (oldEmail && oldEmail.trim().toLowerCase() !== cleanEmail) {
    try {
      await markAccountAsDeletedInCloud({
        userId: targetUserId || `old-${cleanRole}-${Date.now()}`,
        email: oldEmail.trim().toLowerCase(),
        role: cleanRole,
        fullName: cleanFullName,
        deletedBy: 'Pengembang Sistem (Penggantian Email Akun)',
        supabase
      })
    } catch (delErr) {
      console.warn('Gagal mencatat email lama ke Deleted Registry:', delErr)
    }
  }

  // 1. Jika targetUserId ada, simpan juga kredensial spesifik akun ini
  if (targetUserId) {
    const specificTarget = `${LEADER_CREDENTIALS_PREFIX}${targetUserId}`
    try {
      const { data: existingSpecific } = await supabase
        .from('pengumuman')
        .select('id, pesan')
        .eq('target_type', specificTarget)
        .limit(1)

      let finalPayload = { ...payloadObj }
      if (!passwordHash && existingSpecific?.[0]?.pesan) {
        try {
          const old = JSON.parse(existingSpecific[0].pesan)
          if (old.passwordHash) finalPayload.passwordHash = old.passwordHash
        } catch {}
      }

      const specificStr = JSON.stringify(finalPayload)
      if (existingSpecific && existingSpecific.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: specificStr })
          .eq('id', existingSpecific[0].id)
      } else {
        await supabase
          .from('pengumuman')
          .insert([{
            pesan: specificStr,
            target_type: specificTarget,
            target_users: ''
          }])
      }
    } catch (e) {
      console.warn('Error saving specific leader override:', e)
    }

    // Perbarui profil di database
    try {
      await supabase
        .from('profiles')
        .update({
          email: cleanEmail,
          full_name: cleanFullName,
          role: cleanRole
        })
        .eq('id', targetUserId)
    } catch (err) {
      console.warn('Could not update profiles for targetUserId:', err)
    }
  }

  // 2. Simpan atau perbarui konfigurasi override utama role ini jika ada password
  if (passwordHash || !targetUserId) {
    const { data: existing } = await supabase
      .from('pengumuman')
      .select('id, pesan')
      .eq('target_type', mainTarget)
      .limit(1)

    let finalMainPayload = { ...payloadObj }
    if (!passwordHash && existing?.[0]?.pesan) {
      try {
        const oldMain = JSON.parse(existing[0].pesan)
        if (oldMain.passwordHash) finalMainPayload.passwordHash = oldMain.passwordHash
      } catch {}
    }

    const payloadStr = JSON.stringify(finalMainPayload)
    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('pengumuman')
        .update({ pesan: payloadStr })
        .eq('id', existing[0].id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('pengumuman')
        .insert([{
          pesan: payloadStr,
          target_type: mainTarget,
          target_users: ''
        }])
      if (error) throw error
    }
  }

  // 3. Sinkronkan juga ke tabel profiles jika belum terikat ke targetUserId
  if (!targetUserId) {
    try {
      const { data: matchedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', cleanRole)
        .limit(1)

      if (matchedProfiles && matchedProfiles.length > 0) {
        await supabase
          .from('profiles')
          .update({
            email: cleanEmail,
            full_name: cleanFullName
          })
          .eq('id', matchedProfiles[0].id)
      } else {
        // Jika belum ada row di profiles, masukkan agar muncul di daftar
        await supabase
          .from('profiles')
          .insert([{
            id: crypto.randomUUID ? crypto.randomUUID() : `leader-${Date.now()}`,
            email: cleanEmail,
            full_name: cleanFullName,
            role: cleanRole
          }])
      }
    } catch (err) {
      console.warn('Could not upsert email in profiles:', err)
    }
  }

  return true
}

/**
 * Memeriksa apakah login admin cocok dengan override credentials dari pengembang
 */
export async function verifyAdminOverrideLogin(email, password, supabase) {
  if (!supabase) return { isOverride: false }
  const inputEmail = email.trim().toLowerCase()
  const inputHash = await hashDeveloperKey(password)

  // 1. Cek override utama role admin
  const override = await getAdminOverrideCredentials(supabase)
  if (override && override.email && override.passwordHash) {
    if (inputEmail === override.email.toLowerCase()) {
      if (inputHash === override.passwordHash) {
        return {
          isOverride: true,
          success: true,
          email: override.email,
          fullName: override.fullName || 'Administrator Sekolah',
          userId: override.userId || 'admin-master-uid'
        }
      } else {
        return { isOverride: true, success: false, error: 'Password Admin tidak sesuai.' }
      }
    }
  }

  // 2. Cek override spesifik pimpinan akun admin
  try {
    const { data: specificList } = await supabase
      .from('pengumuman')
      .select('pesan')
      .like('target_type', `${LEADER_CREDENTIALS_PREFIX}%`)
      .limit(50)

    if (specificList && specificList.length > 0) {
      for (const item of specificList) {
        try {
          const parsed = JSON.parse(item.pesan)
          if (parsed?.role === 'admin' && parsed?.email?.toLowerCase() === inputEmail) {
            if (parsed.passwordHash && inputHash === parsed.passwordHash) {
              return {
                isOverride: true,
                success: true,
                email: parsed.email,
                fullName: parsed.fullName || 'Administrator Sekolah',
                userId: parsed.userId || 'admin-master-uid'
              }
            } else {
              return { isOverride: true, success: false, error: 'Password Admin tidak sesuai.' }
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Error checking specific admin credentials:', e)
  }

  return { isOverride: false }
}

/**
 * Memeriksa apakah login kepala sekolah cocok dengan override credentials dari pengembang
 */
export async function verifyKepsekOverrideLogin(email, password, supabase) {
  if (!supabase) return { isOverride: false }
  const inputEmail = email.trim().toLowerCase()
  const inputHash = await hashDeveloperKey(password)

  // 1. Cek override utama role kepsek
  const override = await getKepsekOverrideCredentials(supabase)
  if (override && override.email && override.passwordHash) {
    if (inputEmail === override.email.toLowerCase()) {
      if (inputHash === override.passwordHash) {
        return {
          isOverride: true,
          success: true,
          email: override.email,
          fullName: override.fullName || 'Kepala Sekolah',
          userId: override.userId || 'kepsek-master-uid'
        }
      } else {
        return { isOverride: true, success: false, error: 'Password Kepala Sekolah tidak sesuai.' }
      }
    }
  }

  // 2. Cek override spesifik pimpinan akun kepsek
  try {
    const { data: specificList } = await supabase
      .from('pengumuman')
      .select('pesan')
      .like('target_type', `${LEADER_CREDENTIALS_PREFIX}%`)
      .limit(50)

    if (specificList && specificList.length > 0) {
      for (const item of specificList) {
        try {
          const parsed = JSON.parse(item.pesan)
          if (parsed?.role === 'kepsek' && parsed?.email?.toLowerCase() === inputEmail) {
            if (parsed.passwordHash && inputHash === parsed.passwordHash) {
              return {
                isOverride: true,
                success: true,
                email: parsed.email,
                fullName: parsed.fullName || 'Kepala Sekolah',
                userId: parsed.userId || 'kepsek-master-uid'
              }
            } else {
              return { isOverride: true, success: false, error: 'Password Kepala Sekolah tidak sesuai.' }
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Error checking specific kepsek credentials:', e)
  }

  return { isOverride: false }
}

/**
 * Menghapus akun pengguna (Guru, Tendik, Admin, atau Kepala Sekolah) secara aman beserta dependensi datanya
 */
export async function deleteUserAccountSafely({ userId, role = 'guru', email = '', fullName = '', deletedBy = 'Administrator', supabase }) {
  if (!userId || !supabase) {
    throw new Error('ID pengguna atau koneksi database tidak valid.')
  }

  // 1. Catat ke Cloud Deleted Accounts Registry TERLEBIH DAHULU agar akun langsung hilang seketika di semua client & diblokir login
  try {
    await markAccountAsDeletedInCloud({
      userId,
      email,
      role,
      fullName,
      deletedBy,
      supabase
    })
  } catch (err) {
    console.warn('Gagal mencatat akun ke Cloud Deleted Registry:', err)
  }

  // 2. Reset device bindings agar kunci HP dibebaskan
  try {
    await resetDeviceBinding({ userId, supabase })
  } catch (e) {}

  // 3. Hapus transaksi terkait agar tidak melanggar foreign key
  try {
    await supabase.from('absensi').delete().eq('user_id', userId)
  } catch (e) {
    console.warn('Gagal hapus absensi user:', e)
  }
  try {
    await supabase.from('learning_journals').delete().eq('user_id', userId)
  } catch (e) {
    console.warn('Gagal hapus learning_journals user:', e)
  }
  try {
    await supabase.from('jurnal').delete().eq('user_id', userId)
  } catch (e) {
    console.warn('Gagal hapus jurnal user:', e)
  }
  try {
    await supabase.from('student_attendance').delete().eq('teacher_id', userId)
  } catch (e) {
    console.warn('Gagal hapus student_attendance user:', e)
  }
  try {
    await supabase.from('student_grades').delete().eq('teacher_id', userId)
  } catch (e) {
    console.warn('Gagal hapus student_grades user:', e)
  }
  try {
    await supabase.from('student_behavior_notes').delete().eq('teacher_id', userId)
  } catch (e) {
    console.warn('Gagal hapus student_behavior_notes user:', e)
  }
  try {
    await supabase.from('classes').update({ teacher_id: null }).eq('teacher_id', userId)
  } catch (e) {
    console.warn('Gagal update classes teacher_id user:', e)
  }

  // 4. Hapus kredensial spesifik jika ada
  try {
    await supabase
      .from('pengumuman')
      .delete()
      .eq('target_type', `${LEADER_CREDENTIALS_PREFIX}${userId}`)
  } catch (e) {}

  // 5. Jika email cocok dengan override utama, bersihkan
  if (email) {
    const cleanMail = email.trim().toLowerCase()
    try {
      const adminOverride = await getAdminOverrideCredentials(supabase)
      if (adminOverride?.email?.toLowerCase() === cleanMail) {
        await supabase.from('pengumuman').delete().eq('target_type', ADMIN_CREDENTIALS_TARGET)
      }
    } catch {}
    try {
      const kepsekOverride = await getKepsekOverrideCredentials(supabase)
      if (kepsekOverride?.email?.toLowerCase() === cleanMail) {
        await supabase.from('pengumuman').delete().eq('target_type', KEPSEK_CREDENTIALS_TARGET)
      }
    } catch {}
  }

  // 6. Coba hapus profil dari tabel profiles jika diperbolehkan
  try {
    await supabase.from('profiles').delete().eq('id', userId)
  } catch (e) {
    console.warn('RLS batasi delete profiles secara langsung:', e)
  }

  // 7. Bersihkan cache lokal yang terkait
  try {
    localStorage.removeItem(`guru_assigned_classes_${userId}`)
    localStorage.removeItem(`guru_tipe_${userId}`)
    localStorage.removeItem(`guru_tipe_perangkat_${userId}`)
    localStorage.removeItem(`guru_mapel_${userId}`)
    localStorage.removeItem(`tendik_penugasan_${userId}`)
    localStorage.removeItem(`tendik_kategori_${userId}`)
    localStorage.removeItem(`panrita_role_${userId}`)
    localStorage.removeItem(`panrita_permanent_device_id_${userId}`)
  } catch (e) {}

  return true
}
