// Utility for Admin Attendance Override & Security Token Management
// Memungkinkan Admin melakukan Clock In / Clock Out Khusus untuk Guru & Kepala Sekolah
// Diproteksi dengan Kode Token Keamanan yang dapat dipulihkan hanya oleh Pengembang

export const OVERRIDE_TOKEN_TARGET = '__ADMIN_ATTENDANCE_OVERRIDE_TOKEN__'
const LOCAL_STORAGE_TOKEN_KEY = 'panrita_admin_override_token'

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
          // If plain text token
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

  // Fallback ke localStorage
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
      // Jika gagal cloud, setidaknya localStorage sudah tersimpan
    }
  }

  return { success: true, token }
}

/**
 * Verifikasi input token dari admin
 */
export async function verifyAdminOverrideToken(supabase, inputToken) {
  const { token: activeToken, exists } = await getCloudOverrideToken(supabase)
  
  if (!exists) {
    return { success: false, notConfigured: true }
  }

  if (inputToken.trim() === activeToken.trim()) {
    return { success: true, notConfigured: false }
  }

  return { success: false, notConfigured: false, error: 'Kode Token salah! Silakan periksa kembali atau hubungi Pengembang.' }
}

/**
 * Eksekusi Clock In / Clock Out khusus oleh Admin
 * Aturan Keras:
 * - Admin TIDAK BISA mengubah presensi akun dirinya sendiri (targetUserId !== adminUserId).
 * - Admin BISA mengubah presensi Kepala Sekolah, Guru Kelas, Guru Mapel, dan Tendik.
 * - Tidak mencantumkan catatan anomali di rekap publik.
 */
export async function executeAdminAttendanceOverride(supabase, {
  targetUserId,
  actionType, // 'clock_in' | 'clock_out'
  date,       // 'YYYY-MM-DD'
  timeStr,    // 'HH:mm'
  adminUserId
}) {
  if (!supabase) throw new Error('Koneksi Supabase tidak aktif.')
  if (!targetUserId) throw new Error('Silakan pilih pegawai terlebih dahulu.')
  
  // Safeguard: Anti-self-approval
  if (targetUserId === adminUserId) {
    throw new Error('Akun Admin tidak diizinkan mengubah presensi diri sendiri.')
  }

  const targetDateStr = date || new Date().toISOString().slice(0, 10)
  const targetTimeStr = timeStr || new Date().toTimeString().slice(0, 5)

  // Buat timestamp ISO lokal yang presisi
  const [hours, minutes] = targetTimeStr.split(':')
  const dateObj = new Date(targetDateStr)
  dateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
  const targetIsoTime = dateObj.toISOString()

  // 1. Cek apakah sudah ada record absensi untuk pegawai pada tanggal tersebut
  const { data: existing, error: fetchErr } = await supabase
    .from('absensi')
    .select('*')
    .eq('user_id', targetUserId)
    .eq('tanggal', targetDateStr)
    .maybeSingle()

  if (fetchErr) {
    console.error('Error checking existing attendance:', fetchErr)
  }

  if (actionType === 'clock_out') {
    if (existing) {
      // Update waktu pulang
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
      return { success: true, action: 'clock_out', data }
    } else {
      // Jika belum ada presensi masuk pagi, buat record baru langsung dengan jam masuk dan jam pulang yang sama
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
      return { success: true, action: 'clock_out', data }
    }
  } else if (actionType === 'clock_in') {
    if (existing) {
      // Update jam masuk
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
      return { success: true, action: 'clock_in', data }
    } else {
      // Insert baru jam masuk
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
      return { success: true, action: 'clock_in', data }
    }
  } else {
    throw new Error('Jenis tindakan presensi tidak dikenali.')
  }
}
