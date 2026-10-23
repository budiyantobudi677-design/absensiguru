// Utility for Managing Cloud & Local Registry of Deleted Accounts
// Memastikan akun guru/pegawai/admin yang telah dihapus BENAR-BENAR HILANG
// dari seluruh dashboard dan DIBLOKIR permanen dari sistem login,
// terlepas dari batasan Row-Level Security (RLS) PostgreSQL pada tabel profiles.

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
          cloudData.deletedEmails = Array.isArray(parsed.deletedEmails) ? parsed.deletedEmails.map(e => String(e).toLowerCase().trim()) : []
          cloudData.details = parsed.details || {}
        }
      }
    } catch (err) {
      console.warn('Gagal membaca registry akun terhapus dari cloud:', err)
    }
  }

  // Gabungkan dengan cache lokal
  try {
    const localIds = JSON.parse(localStorage.getItem(LOCAL_STORAGE_IDS_KEY) || '[]')
    const localEmails = JSON.parse(localStorage.getItem(LOCAL_STORAGE_EMAILS_KEY) || '[]')
    
    if (Array.isArray(localIds)) {
      localIds.forEach(id => {
        if (id && !cloudData.deletedIds.includes(id)) {
          cloudData.deletedIds.push(id)
        }
      })
    }
    if (Array.isArray(localEmails)) {
      localEmails.forEach(em => {
        const clean = String(em).toLowerCase().trim()
        if (clean && !cloudData.deletedEmails.includes(clean)) {
          cloudData.deletedEmails.push(clean)
        }
      })
    }
  } catch (e) {}

  // Simpan hasil gabungan kembali ke cache lokal
  try {
    localStorage.setItem(LOCAL_STORAGE_IDS_KEY, JSON.stringify(cloudData.deletedIds))
    localStorage.setItem(LOCAL_STORAGE_EMAILS_KEY, JSON.stringify(cloudData.deletedEmails))
  } catch (e) {}

  return cloudData
}

/**
 * Memeriksa apakah sebuah akun / pengguna sudah dihapus
 * @param {object|string} user - Objek user/profile atau ID/email string
 * @param {object} registry - Registry hasil fetchDeletedAccountsRegistry
 * @returns {boolean}
 */
export function isAccountDeleted(user, registry) {
  if (!user || !registry) return false

  const deletedIds = Array.isArray(registry.deletedIds) ? registry.deletedIds : []
  const deletedEmails = Array.isArray(registry.deletedEmails) ? registry.deletedEmails : []

  if (typeof user === 'string') {
    const val = user.trim().toLowerCase()
    if (deletedIds.includes(user)) return true
    if (deletedEmails.includes(val)) return true
    return false
  }

  const userId = user.id || user.userId
  const userEmail = (user.email || '').trim().toLowerCase()

  if (userId && deletedIds.includes(userId)) return true
  if (userEmail && deletedEmails.includes(userEmail)) return true

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
  if (cleanEmail && !current.deletedEmails.includes(cleanEmail)) {
    current.deletedEmails.push(cleanEmail)
  }

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
    localStorage.setItem(LOCAL_STORAGE_EMAILS_KEY, JSON.stringify(current.deletedEmails))
  } catch (e) {}

  // 3. Simpan permanen ke Cloud Supabase (tabel pengumuman)
  if (supabase) {
    try {
      const payload = {
        deletedIds: current.deletedIds,
        deletedEmails: current.deletedEmails,
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
 * Memulihkan akun yang terhapus (jika diperlukan)
 * @param {string} userIdOrEmail 
 * @param {object} supabase 
 */
export async function unmarkAccountAsDeleted(userIdOrEmail, supabase) {
  if (!userIdOrEmail) return false

  const clean = String(userIdOrEmail).trim().toLowerCase()
  const current = await fetchDeletedAccountsRegistry(supabase)

  current.deletedIds = current.deletedIds.filter(id => id !== userIdOrEmail)
  current.deletedEmails = current.deletedEmails.filter(em => em !== clean)
  delete current.details[userIdOrEmail]

  try {
    localStorage.setItem(LOCAL_STORAGE_IDS_KEY, JSON.stringify(current.deletedIds))
    localStorage.setItem(LOCAL_STORAGE_EMAILS_KEY, JSON.stringify(current.deletedEmails))
  } catch (e) {}

  if (supabase) {
    try {
      const payload = {
        deletedIds: current.deletedIds,
        deletedEmails: current.deletedEmails,
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
