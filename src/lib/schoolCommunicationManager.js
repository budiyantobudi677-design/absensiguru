/**
 * School Communication Manager
 * Mengelola Obrolan Internal Sekolah, Disposisi Tugas Kedinasan,
 * Pembersihan Otomatis Riwayat Pesan (14 Hari Retention),
 * dan Integrasi Tombol WhatsApp Instan Tanpa API (100% Gratis).
 */

export const CHAT_CHANNELS = [
  { id: 'umum', label: 'Ruang Dewan Guru & Tendik', icon: '📢', desc: 'Koordinasi umum seluruh staf sekolah' },
  { id: 'kkg', label: 'Ruang KKG & Pembelajaran', icon: '📚', desc: 'Diskusi materi kelas, kurikulum, dan asesmen' },
  { id: 'kedinasan', label: 'Ruang Kedinasan & Administrasi', icon: '🏛️', desc: 'Surat tugas, disposisi dinas, dan rapat' }
]

/**
 * 1. PEMBERSIHAN OTOMATIS: Hapus riwayat pesan lebih dari 14 hari
 */
export async function purgeOldMessages(supabase) {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from('school_chat_messages')
      .delete()
      .lt('created_at', fourteenDaysAgo)

    if (error) {
      console.warn('Notice purge old messages:', error.message)
    }
  } catch (err) {
    console.warn('Error running purgeOldMessages:', err)
  }
}

/**
 * 2. OBROLAN INTERNAL: Mengambil pesan berdasarkan channel atau chat pribadi
 */
export async function fetchMessages({ supabase, channel = 'umum', currentUserId = null, partnerId = null, limit = 80 }) {
  try {
    // Jalankan pembersihan otomatis pesan > 14 hari
    purgeOldMessages(supabase)

    if (channel === 'private' && currentUserId && partnerId) {
      // Query pesan pribadi 2 arah
      const { data, error } = await supabase
        .from('school_chat_messages')
        .select('*')
        .eq('channel', 'private')
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) throw error
      return data || []
    } else {
      // Query pesan grup/channel
      const { data, error } = await supabase
        .from('school_chat_messages')
        .select('*')
        .eq('channel', channel)
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error) throw error
      return data || []
    }
  } catch (err) {
    console.warn('Fetch messages notice:', err.message)
    return []
  }
}

/**
 * Mengirim pesan obrolan baru
 */
export async function sendChatMessage({ supabase, senderId, receiverId = null, channel = 'umum', message }) {
  if (!message || !message.trim()) {
    throw new Error('Pesan tidak boleh kosong.')
  }

  const payload = {
    sender_id: senderId,
    receiver_id: channel === 'private' ? receiverId : null,
    channel: channel,
    message: message.trim()
  }

  const { data, error } = await supabase
    .from('school_chat_messages')
    .insert([payload])
    .select('*')
    .single()

  if (error) throw error
  return data
}

/**
 * 3. DISPOSISI & INSTRUKSI TUGAS KEDINASAN
 */
export async function fetchDispositions({ supabase, userId, role }) {
  try {
    let query = supabase
      .from('school_dispositions')
      .select('*')
      .order('created_at', { ascending: false })

    if (role === 'guru') {
      query = query.eq('to_user_id', userId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('Fetch dispositions notice:', err.message)
    return []
  }
}

export async function createDisposition({ supabase, fromUserId, toUserId, title, description, deadline }) {
  if (!title || !title.trim()) {
    throw new Error('Judul instruksi tugas harus diisi.')
  }
  if (!toUserId) {
    throw new Error('Silakan pilih guru penerima instruksi.')
  }

  const payload = {
    from_user_id: fromUserId,
    to_user_id: toUserId,
    title: title.trim(),
    description: description ? description.trim() : '',
    deadline: deadline || null,
    status: 'menunggu'
  }

  const { data, error } = await supabase
    .from('school_dispositions')
    .insert([payload])
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateDispositionStatus({ supabase, dispositionId, status, responseNote }) {
  const updates = {
    status,
    updated_at: new Date().toISOString()
  }
  if (responseNote !== undefined) {
    updates.response_note = responseNote
  }

  const { data, error } = await supabase
    .from('school_dispositions')
    .update(updates)
    .eq('id', dispositionId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * 4. WHATSAPP INSTAN UTILITIES (100% GRATIS TANPA API)
 */
export function formatPhoneNumberToWA(phone) {
  if (!phone) return ''
  let cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1)
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned
  }
  return cleaned
}

export function openWhatsAppDirect(phone, text) {
  const cleanPhone = formatPhoneNumberToWA(phone)
  const encoded = encodeURIComponent(text || '')

  // 1. Jika ada nomor telepon tujuan (chat personal langsung)
  if (cleanPhone) {
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      if (isMobile) {
        window.location.href = waUrl
        return
      }
    } catch (e) {}
    window.open(waUrl, '_blank', 'noopener,noreferrer')
    return
  }

  // 2. Jika tanpa nomor telepon (berbagi ke grup WhatsApp atau paguyuban)
  // Gunakan Web Share API jika didukung oleh mobile browser atau Capacitor WebView
  if (navigator.share) {
    navigator.share({
      title: 'Pengumuman Resmi Sekolah',
      text: text
    }).catch((err) => {
      if (err?.name === 'AbortError') return
      const waUrl = `https://api.whatsapp.com/send?text=${encoded}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    })
    return
  }

  // Fallback standar ke WhatsApp web/aplikasi
  const waUrl = `https://api.whatsapp.com/send?text=${encoded}`
  try {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isMobile) {
      window.location.href = waUrl
      return
    }
  } catch (e) {}
  window.open(waUrl, '_blank', 'noopener,noreferrer')
}

export function createAttendanceReminderTemplate({ schoolName = 'Sekolah', dateStr }) {
  const d = dateStr || new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return `🔔 *PENGINGAT PRESENSI PAGI*
*${schoolName.toUpperCase()}*
Hari/Tanggal: ${d}

Yth. Bapak/Ibu Guru dan Tenaga Kependidikan,
Diingatkan untuk segera melakukan presensi masuk (*Clock In*) melalui aplikasi GammaraApp sebelum pukul 07.30 WITA.

Terima kasih atas kedisiplinan dan dedikasi Bapak/Ibu sekalian. 🙏`
}

export function createPersonalReminderTemplate({ teacherName = 'Bapak/Ibu Guru', schoolName = 'Sekolah' }) {
  return `Halo Bapak/Ibu *${teacherName}*,
Sekadar mengingatkan untuk melakukan presensi kehadiran di aplikasi GammaraApp (${schoolName}) hari ini. Terima kasih! 🙏`
}

export function createStudentAbsenceTemplate({ schoolName = 'Sekolah', studentName, className, status = 'Sakit', dateStr }) {
  const d = dateStr || new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const statusLabel = status.toUpperCase()
  return `Yth. Orang Tua / Wali dari *${studentName}* (${className}),
${schoolName}

Kami menginformasikan bahwa ananda pada hari ini (${d}) tercatat: *${statusLabel}*.

Mohon konfirmasi jika ada surat keterangan atau keperluan yang perlu disampaikan ke pihak sekolah. Semoga ananda senantiasa sehat. Terima kasih. 🙏
- Wali Kelas / Pihak Sekolah`
}

export function createAnnouncementWhatsAppTemplate({ schoolName = 'Sekolah', title = '', content = '', dateStr }) {
  const d = dateStr || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const sName = (schoolName || 'Sekolah').toUpperCase()
  const cleanTitle = title && title.trim() ? `*${title.trim().toUpperCase()}*\n\n` : ''
  const cleanContent = (content && content.trim()) || 'Dihimbau kepada seluruh Bapak/Ibu Guru dan Tenaga Kependidikan untuk senantiasa memperhatikan kedisiplinan dan koordinasi kegiatan sekolah.'

  return `📢 *PENGUMUMAN RESMI SEKOLAH*
*${sName}*
Tanggal: ${d}

${cleanTitle}${cleanContent}

Demikian pengumuman ini disampaikan untuk menjadi perhatian bersama. Terima kasih. 🙏`
}
