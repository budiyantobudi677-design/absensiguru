// Utility for Managing Cloud & Local Registry of Deleted Accounts
// Memastikan akun spesifik yang telah dihapus dieliminasi dari daftar aktif,
// NAMUN alamat email TETAP BEBAS DIGUNAKAN KEMBALI di kemudian hari (tidak diblokir permanen).

export const DELETED_ACCOUNTS_TARGET = '__SYSTEM_DELETED_ACCOUNTS__'
const LOCAL_STORAGE_IDS_KEY = 'panrita_deleted_account_ids'
const LOCAL_STORAGE_EMAILS_KEY = 'panrita_deleted_account_emails'

/**
 * Membaca registry akun yang telah dihapus dari Cloud Supabase & LocalStorage
 * @param {object} supabase 
 * @returns {Promise<{ deletedIds: string[], deletedEmails: string[], details: object }>}
 */
export async function fetchDeletedAccountsRegistry(supabase) {
  let cloudData = { deletedIds: [], deletedEmails: [], details: {} }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', DELETED_ACCOUNTS_TARGET)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const parsed = JSON.parse(data[0].pesan)
        if (parsed && typeof parsed === 'object') {
          cloudData.deletedIds = Array.isArray(parsed.deletedIds) ? parsed.deletedIds : []
          // Email tidak lagi diblokir permanen agar dapat digunakan kembali secara bebas
          cloudData.deletedEmails = []
          cloudData.details = parsed.details || {}
        }
      }
    } catch (err) {
      console.warn('Gagal membaca registry akun terhapus dari cloud:', err)
    }
  }

  // Gabungkan dengan cache lokal ID
  try {
    const localIds = JSON.parse(localStorage.getItem(LOCAL_STORAGE_IDS_KEY) || '[]')
    if (Array.isArray(localIds)) {
      localIds.forEach(id => {
        if (id && !cloudData.deletedIds.includes(id)) {
          cloudData.deletedIds.push(id)
        }
      })
    }
    // Bersihkan email dari cache lokal
    localStorage.removeItem(LOCAL_STORAGE_EMAILS_KEY)
  } catch (e) {}

  return cloudData
}

/**
 * Memeriksa apakah sebuah akun / pengguna sudah dihapus
 * Akun terhapus hanya dicek berdasarkan ID spesifik akun tersebut (userId),
 * sehingga alamat email tetap bebas digunakan kembali untuk akun baru atau login ulang.
 * @param {object|string} user - Objek user/profile atau ID string
 * @param {object} registry - Registry hasil fetchDeletedAccountsRegistry
 * @returns {boolean}
 */
export function isAccountDeleted(user, registry) {
  if (!user || !registry) return false

  const deletedIds = Array.isArray(registry.deletedIds) ? registry.deletedIds : []

  if (typeof user === 'string') {
    // Jika input adalah UUID atau user ID spesifik
    return deletedIds.includes(user)
  }

  const userId = user.id || user.userId
  if (userId && deletedIds.includes(userId)) return true

  return false
}

/**
 * Menyaring daftar profil agar hanya menyertakan akun yang masih aktif
 * @param {Array} profilesList 
 * @param {object} registry 
 * @returns {Array}
 */
export function filterActiveProfiles(profilesList, registry) {
  if (!Array.isArray(profilesList)) return []
  if (!registry) return profilesList
  return profilesList.filter(p => !isAccountDeleted(p, registry))
}

/**
 * Mencatat penghapusan akun ke Cloud Registry Supabase & Local Cache
 * Hanya mencatat userId ke daftar hapus, TIDAK memblokir alamat email.
 * @param {object} params - { userId, email, role, fullName, deletedBy, supabase }
 */
export async function markAccountAsDeletedInCloud({
  userId,
  email = '',
  role = 'guru',
  fullName = '',
  deletedBy = 'Administrator',
  supabase
}) {
  if (!userId) {
    throw new Error('User ID wajib diisi untuk mencatat penghapusan akun.')
  }

  const cleanEmail = String(email || '').trim().toLowerCase()

  // 1. Ambil data registry saat ini
  const current = await fetchDeletedAccountsRegistry(supabase)

  if (!current.deletedIds.includes(userId)) {
    current.deletedIds.push(userId)
  }

  // Simpan rincian akun lama untuk catatan audit tanpa memblokir email
  current.details[userId] = {
    userId,
    email: cleanEmail,
    role,
    fullName: fullName || cleanEmail,
    deletedAt: new Date().toISOString(),
    deletedBy
  }

  // 2. Simpan ke local cache terlebih dahulu untuk respon UI instan
  try {
    localStorage.setItem(LOCAL_STORAGE_IDS_KEY, JSON.stringify(current.deletedIds))
    localStorage.removeItem(LOCAL_STORAGE_EMAILS_KEY)
  } catch (e) {}

  // 3. Simpan permanen ke Cloud Supabase (tabel pengumuman)
  if (supabase) {
    try {
      const payload = {
        deletedIds: current.deletedIds,
        deletedEmails: [], // Bebaskan seluruh email agar tetap dapat digunakan kembali
        details: current.details,
        updatedAt: new Date().toISOString()
      }

      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', DELETED_ACCOUNTS_TARGET)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: JSON.stringify(payload), target_users: '' })
          .eq('id', existing[0].id)
      } else {
        await supabase
          .from('pengumuman')
          .insert([{
            pesan: JSON.stringify(payload),
            target_type: DELETED_ACCOUNTS_TARGET,
            target_users: ''
          }])
      }
    } catch (err) {
      console.warn('Gagal sinkronisasi catatan akun terhapus ke cloud Supabase:', err)
    }
  }

  return true
}

/**
 * Membebaskan email dari status terhapus (agar selalu bisa digunakan kembali)
 */
export async function unmarkEmailAsDeleted(email, supabase) {
  if (!email) return false
  return unmarkAccountAsDeleted(email, supabase)
}

/**
 * Memulihkan akun yang terhapus (jika diperlukan)
 * @param {string} userIdOrEmail 
 * @param {object} supabase 
 */
export async function unmarkAccountAsDeleted(userIdOrEmail, supabase) {
  if (!userIdOrEmail) return false

  const clean = String(userIdOrEmail).trim().toLowerCase()
  const current = await fetchDeletedAccountsRegistry(supabase)

  current.deletedIds = current.deletedIds.filter(id => id !== userIdOrEmail)
  current.deletedEmails = (current.deletedEmails || []).filter(em => em !== clean)
  delete current.details[userIdOrEmail]

  try {
    localStorage.setItem(LOCAL_STORAGE_IDS_KEY, JSON.stringify(current.deletedIds))
    localStorage.removeItem(LOCAL_STORAGE_EMAILS_KEY)
  } catch (e) {}

  if (supabase) {
    try {
      const payload = {
        deletedIds: current.deletedIds,
        deletedEmails: [],
        details: current.details,
        updatedAt: new Date().toISOString()
      }

      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', DELETED_ACCOUNTS_TARGET)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: JSON.stringify(payload), target_users: '' })
          .eq('id', existing[0].id)
      }
    } catch (err) {
      console.warn('Error unmarking deleted account in cloud:', err)
    }
  }

  return true
}
