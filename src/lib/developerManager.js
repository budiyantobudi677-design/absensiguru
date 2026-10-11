// Utility for Developer Master Key Authentication & Security
// Menggunakan enkripsi satu arah SHA-256 + Salt (Anti-Bocor) & Proteksi Brute-Force

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

// Target konfig khusus untuk kredensial akun admin yang dikelola oleh Pengembang
const ADMIN_CREDENTIALS_TARGET = '__SYSTEM_ADMIN_CREDENTIALS__'

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
 * Mengupdate atau mengatur ulang Akun Email & Password Admin dari Console Pengembang
 */
export async function updateAdminAccountCredentials({ email, password, supabase }) {
  if (!email || !email.includes('@')) {
    throw new Error('Format email tidak valid.')
  }
  if (!password || password.length < 6) {
    throw new Error('Password admin minimal 6 karakter.')
  }

  // Hash password menggunakan SHA-256 + salt agar aman dari pembobolan
  const passwordHash = await hashDeveloperKey(password)

  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    passwordHash: passwordHash,
    updatedAt: new Date().toISOString()
  })

  // 1. Simpan konfigurasi kredensial ke cloud Supabase
  const { data: existing } = await supabase
    .from('pengumuman')
    .select('id')
    .eq('target_type', ADMIN_CREDENTIALS_TARGET)
    .limit(1)

  if (existing && existing.length > 0) {
    const { error } = await supabase
      .from('pengumuman')
      .update({ pesan: payload })
      .eq('id', existing[0].id)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('pengumuman')
      .insert([{
        pesan: payload,
        target_type: ADMIN_CREDENTIALS_TARGET,
        target_users: ''
      }])
    if (error) throw error
  }

  // 2. Sinkronkan juga ke tabel profiles jika ada akun admin
  try {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .limit(1)

    if (adminProfiles && adminProfiles.length > 0) {
      await supabase
        .from('profiles')
        .update({ email: email.trim().toLowerCase() })
        .eq('id', adminProfiles[0].id)
    }
  } catch (err) {
    console.warn('Could not update email in profiles:', err)
  }

  return true
}

/**
 * Memeriksa apakah login admin cocok dengan override credentials dari pengembang
 */
export async function verifyAdminOverrideLogin(email, password, supabase) {
  const override = await getAdminOverrideCredentials(supabase)
  if (!override || !override.email || !override.passwordHash) {
    return { isOverride: false }
  }

  const inputEmail = email.trim().toLowerCase()
  if (inputEmail !== override.email) {
    return { isOverride: false }
  }

  const inputHash = await hashDeveloperKey(password)
  if (inputHash === override.passwordHash) {
    return { isOverride: true, success: true, email: override.email }
  } else {
    return { isOverride: true, success: false, error: 'Password Admin tidak sesuai.' }
  }
}
