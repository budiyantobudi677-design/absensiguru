import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// ID channel alarm (menggunakan ID baru agar Android membuat ulang channel dengan suara default aktif)
export const ALARM_CHANNEL_ID = 'gammara_alarm_v3'

// ID notifikasi hari ini (Day 0)
export const TODAY_NOTIF_IDS = {
  PAGI_1: 1001, // 06.45 WITA
  PAGI_2: 1002, // 07.00 WITA
  PAGI_3: 1003, // 07.15 WITA
  SIANG_1: 2001, // Jam Pulang
  SIANG_2: 2002, // Jam Pulang + 5m
  SIANG_3: 2003  // Jam Pulang + 15m
}

// Daftar ID lama untuk dibersihkan
const LEGACY_IDS = [101, 102, 103, 201, 202, 203]

/**
 * Meminta izin notifikasi ke sistem operasi perangkat
 */
export async function requestNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission()
        } catch {}
      }
    }
    return true
  }

  try {
    const status = await LocalNotifications.checkPermissions()
    if (status.display !== 'granted') {
      const res = await LocalNotifications.requestPermissions()
      return res.display === 'granted'
    }
    return true
  } catch (err) {
    console.warn('Request notification permission error:', err)
    return false
  }
}

/**
 * Membuat tanggal spesifik untuk hari ke-(offset) pada jam & menit tertentu
 */
function getOffsetDate(dayOffset, hour, minute) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d
}

/**
 * Menjadwalkan pengingat presensi cerdas (Smart Attendance Reminder)
 * - Suara nyaring bawaan sistem Android (channel high-importance)
 * - Tembus mode sleep / Doze mode (allowWhileIdle: true + WAKE_LOCK)
 * - Menjadwalkan hingga 7 hari ke depan secara otomatis
 * - Jika hari ini sudah presensi masuk / pulang, jadwal hari ini tidak berbunyi
 */
export async function scheduleAttendanceReminders({
  hasCheckedIn = false,
  hasCheckedOut = false,
  jamPulangShift = '14:00'
} = {}) {
  const isNative = Capacitor.isNativePlatform()
  if (!isNative) return

  try {
    await requestNotificationPermission()

    // 1. Bersihkan channel lama yang berstatus bisu (mute)
    try {
      await LocalNotifications.deleteChannel({ id: 'absensi_alarm_channel' })
    } catch {}

    // 2. Buat channel notifikasi baru dengan prioritas tertinggi & suara default HP
    try {
      await LocalNotifications.createChannel({
        id: ALARM_CHANNEL_ID,
        name: 'Alarm Presensi Guru',
        description: 'Pengingat jam masuk dan jam kepulangan guru',
        importance: 5, // High importance (pop-up banner, suara notifikasi nyaring, getar)
        visibility: 1, // Tampil di lockscreen saat HP terkunci
        vibration: true,
        lights: true
      })
    } catch {}

    const now = new Date()
    const notificationsToSchedule = []

    // Parse jam pulang
    const [pH, pM] = String(jamPulangShift || '14:00').split(':').map(Number)
    const hourPulang = isNaN(pH) ? 14 : pH
    const minPulang = isNaN(pM) ? 0 : pM

    // Jadwalkan untuk 7 hari ke depan (Day 0 = Hari ini, Day 1..6 = 6 hari ke depan)
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const isToday = dayOffset === 0

      // A. JADWAL PAGI (Clock In)
      // Hari ini: hanya jika belum clock in
      // Hari berikutnya: selalu dijadwalkan
      const shouldScheduleMorning = isToday ? !hasCheckedIn : true

      if (shouldScheduleMorning) {
        // Slot 1: 06.45 WITA
        const t1 = getOffsetDate(dayOffset, 6, 45)
        if (t1.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 1000 + dayOffset * 10 + 1,
            title: '🔔 Persiapan Presensi Masuk',
            body: 'Selamat pagi! Presensi masuk dibuka mulai pukul 07.00 WITA. Siapkan aplikasi Anda.',
            schedule: { at: t1, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }

        // Slot 2: 07.00 WITA
        const t2 = getOffsetDate(dayOffset, 7, 0)
        if (t2.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 1000 + dayOffset * 10 + 2,
            title: '⏰ Waktu Clock In Tiba!',
            body: 'Pukul 07.00 WITA. Silakan buka aplikasi dan lakukan Clock In presensi sekarang.',
            schedule: { at: t2, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }

        // Slot 3: 07.15 WITA
        const t3 = getOffsetDate(dayOffset, 7, 15)
        if (t3.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 1000 + dayOffset * 10 + 3,
            title: '⚠️ Peringatan Batas Presensi!',
            body: 'Pukul 07.15 WITA. Segera Clock In sebelum batas toleransi 07.30 agar tidak tercatat terlambat!',
            schedule: { at: t3, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }
      }

      // B. JADWAL SIANG (Clock Out)
      // Hari ini: hanya jika belum clock out
      // Hari berikutnya: selalu dijadwalkan
      const shouldScheduleAfternoon = isToday ? !hasCheckedOut : true

      if (shouldScheduleAfternoon) {
        // Slot 1: Jam Pulang
        const tP1 = getOffsetDate(dayOffset, hourPulang, minPulang)
        if (tP1.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 2000 + dayOffset * 10 + 1,
            title: '🔔 Jam Kepulangan Telah Tiba',
            body: `Pukul ${jamPulangShift || '14:00'} WITA. Waktu tugas Anda hari ini telah selesai. Silakan lakukan Clock Out sebelum pulang.`,
            schedule: { at: tP1, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }

        // Slot 2: Jam Pulang + 5 menit
        const tP2 = getOffsetDate(dayOffset, hourPulang, minPulang + 5)
        if (tP2.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 2000 + dayOffset * 10 + 2,
            title: '⏰ Pengingat Presensi Pulang',
            body: 'Jangan lupa Clock Out! Catat kepulangan Anda di aplikasi Gammara sekarang.',
            schedule: { at: tP2, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }

        // Slot 3: Jam Pulang + 15 menit
        const tP3 = getOffsetDate(dayOffset, hourPulang, minPulang + 15)
        if (tP3.getTime() > now.getTime()) {
          notificationsToSchedule.push({
            id: 2000 + dayOffset * 10 + 3,
            title: '⚠️ Peringatan Belum Clock Out!',
            body: 'Anda belum mencatat presensi pulang. Mohon segera Clock Out agar rekap presensi lengkap.',
            schedule: { at: tP3, allowWhileIdle: true },
            channelId: ALARM_CHANNEL_ID,
            smallIcon: 'ic_launcher'
          })
        }
      }
    }

    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: notificationsToSchedule })
    }
  } catch (err) {
    console.warn('Schedule local notifications warning:', err)
  }
}

/**
 * Batalkan notifikasi sesi pagi hari ini jika sudah presensi masuk
 */
export async function cancelMorningReminders() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: TODAY_NOTIF_IDS.PAGI_1 },
          { id: TODAY_NOTIF_IDS.PAGI_2 },
          { id: TODAY_NOTIF_IDS.PAGI_3 },
          { id: LEGACY_IDS[0] },
          { id: LEGACY_IDS[1] },
          { id: LEGACY_IDS[2] }
        ]
      })
    } catch {}
  }
}

/**
 * Batalkan notifikasi sesi siang hari ini jika sudah presensi pulang
 */
export async function cancelAfternoonReminders() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: TODAY_NOTIF_IDS.SIANG_1 },
          { id: TODAY_NOTIF_IDS.SIANG_2 },
          { id: TODAY_NOTIF_IDS.SIANG_3 },
          { id: LEGACY_IDS[3] },
          { id: LEGACY_IDS[4] },
          { id: LEGACY_IDS[5] }
        ]
      })
    } catch {}
  }
}
