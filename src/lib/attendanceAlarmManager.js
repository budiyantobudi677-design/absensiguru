import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// ID unik untuk notifikasi
const NOTIF_IDS = {
  PAGI_1: 101, // 06.45 WITA
  PAGI_2: 102, // 07.00 WITA
  PAGI_3: 103, // 07.15 WITA
  SIANG_1: 201, // 14.00 WITA
  SIANG_2: 202, // 14.05 WITA
  SIANG_3: 203  // 14.15 WITA
}

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
 * Menghitung tanggal target untuk jam dan menit tertentu.
 * Jika forceTomorrow = true ATAU waktu target hari ini sudah lewat,
 * jadwalkan untuk BESOK pada jam:menit yang sama.
 */
function getNextOccurrenceDate(hour, minute, forceTomorrow = false) {
  const now = new Date()
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  if (forceTomorrow || d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

/**
 * Menjadwalkan pengingat presensi cerdas (Smart Attendance Reminder)
 * Jadwal Pagi: 06.45, 07.00, 07.15 (berulang harian every: 'day')
 * Jadwal Siang: Jam Pulang, +5 menit, +15 menit (berulang harian every: 'day')
 */
export async function scheduleAttendanceReminders({
  hasCheckedIn = false,
  hasCheckedOut = false,
  jamPulangShift = '14:00'
} = {}) {
  const isNative = Capacitor.isNativePlatform()

  if (isNative) {
    try {
      await requestNotificationPermission()

      // Buat notification channel untuk Android 8+
      try {
        await LocalNotifications.createChannel({
          id: 'absensi_alarm_channel',
          name: 'Alarm Presensi Guru',
          description: 'Pengingat otomatis jam masuk dan jam kepulangan guru',
          importance: 5, // High importance
          visibility: 1,
          sound: 'res_custom_notification',
          vibration: true
        })
      } catch {}

      const notificationsToSchedule = []

      // 1. JADWAL PAGI (Clock In)
      // Jika sudah clock in hari ini -> jadwalkan mulai besok pagi (forceTomorrow = true)
      // Jika belum clock in hari ini -> jadwalkan hari ini jika belum lewat, atau besok pagi jika sudah lewat
      const forceTomorrowMorning = Boolean(hasCheckedIn)

      notificationsToSchedule.push({
        id: NOTIF_IDS.PAGI_1,
        title: '🔔 Persiapan Presensi Masuk',
        body: 'Selamat pagi! Presensi masuk dibuka mulai pukul 07.00 WITA. Siapkan aplikasi Anda.',
        schedule: {
          at: getNextOccurrenceDate(6, 45, forceTomorrowMorning),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      notificationsToSchedule.push({
        id: NOTIF_IDS.PAGI_2,
        title: '⏰ Waktu Clock In Tiba!',
        body: 'Pukul 07.00 WITA. Silakan buka aplikasi dan lakukan Clock In presensi sekarang.',
        schedule: {
          at: getNextOccurrenceDate(7, 0, forceTomorrowMorning),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      notificationsToSchedule.push({
        id: NOTIF_IDS.PAGI_3,
        title: '⚠️ Peringatan Batas Presensi!',
        body: 'Pukul 07.15 WITA. Segera Clock In sebelum batas toleransi 07.30 agar tidak tercatat terlambat!',
        schedule: {
          at: getNextOccurrenceDate(7, 15, forceTomorrowMorning),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      // 2. JADWAL SIANG (Clock Out)
      // Parse jam pulang shift
      const [pH, pM] = String(jamPulangShift || '14:00').split(':').map(Number)
      const hourPulang = isNaN(pH) ? 14 : pH
      const minPulang = isNaN(pM) ? 0 : pM

      // Jika sudah clock out hari ini -> jadwalkan mulai besok siang (forceTomorrow = true)
      // Jika belum clock out hari ini -> jadwalkan hari ini jika belum lewat, atau besok siang jika sudah lewat
      const forceTomorrowAfternoon = Boolean(hasCheckedOut)

      notificationsToSchedule.push({
        id: NOTIF_IDS.SIANG_1,
        title: '🔔 Jam Kepulangan Telah Tiba',
        body: `Pukul ${jamPulangShift || '14:00'} WITA. Waktu tugas Anda hari ini telah selesai. Silakan lakukan Clock Out sebelum pulang.`,
        schedule: {
          at: getNextOccurrenceDate(hourPulang, minPulang, forceTomorrowAfternoon),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      notificationsToSchedule.push({
        id: NOTIF_IDS.SIANG_2,
        title: '⏰ Pengingat Presensi Pulang',
        body: 'Jangan lupa Clock Out! Catat kepulangan Anda di aplikasi Gammara sekarang.',
        schedule: {
          at: getNextOccurrenceDate(hourPulang, minPulang + 5, forceTomorrowAfternoon),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      notificationsToSchedule.push({
        id: NOTIF_IDS.SIANG_3,
        title: '⚠️ Peringatan Belum Clock Out!',
        body: 'Anda belum mencatat presensi pulang. Mohon segera Clock Out agar rekap presensi lengkap.',
        schedule: {
          at: getNextOccurrenceDate(hourPulang, minPulang + 15, forceTomorrowAfternoon),
          every: 'day',
          allowWhileIdle: true
        },
        channelId: 'absensi_alarm_channel',
        sound: 'res_custom_notification',
        smallIcon: 'ic_launcher'
      })

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule })
      }
    } catch (err) {
      console.warn('Schedule local notifications warning:', err)
    }
  }
}

/**
 * Batalkan notifikasi sesi pagi jika sudah presensi masuk
 */
export async function cancelMorningReminders() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: NOTIF_IDS.PAGI_1 },
          { id: NOTIF_IDS.PAGI_2 },
          { id: NOTIF_IDS.PAGI_3 }
        ]
      })
    } catch {}
  }
}

/**
 * Batalkan notifikasi sesi siang jika sudah presensi pulang
 */
export async function cancelAfternoonReminders() {
  if (Capacitor.isNativePlatform()) {
    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: NOTIF_IDS.SIANG_1 },
          { id: NOTIF_IDS.SIANG_2 },
          { id: NOTIF_IDS.SIANG_3 }
        ]
      })
    } catch {}
  }
}
