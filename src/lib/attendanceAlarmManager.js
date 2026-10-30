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
 * Membuat date object untuk jam dan menit tertentu hari ini (WITA)
 */
function getScheduleDate(hour, minute) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

/**
 * Menjadwalkan pengingat presensi cerdas (Smart Attendance Reminder)
 * Jadwal Pagi: 06.45, 07.00, 07.15
 * Jadwal Siang: 14.00, 14.05, 14.15
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

      const now = new Date()
      const notificationsToSchedule = []

      // 1. JADWAL PAGI (Clock In) - Hanya jika belum presensi masuk
      if (!hasCheckedIn) {
        const t1 = getScheduleDate(6, 45)
        if (t1 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.PAGI_1,
            title: '🔔 Persiapan Presensi Masuk',
            body: 'Selamat pagi! Presensi masuk dibuka mulai pukul 07.00 WITA. Siapkan aplikasi Anda.',
            schedule: { at: t1 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }

        const t2 = getScheduleDate(7, 0)
        if (t2 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.PAGI_2,
            title: '⏰ Waktu Clock In Tiba!',
            body: 'Pukul 07.00 WITA. Silakan buka aplikasi dan lakukan Clock In presensi sekarang.',
            schedule: { at: t2 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }

        const t3 = getScheduleDate(7, 15)
        if (t3 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.PAGI_3,
            title: '⚠️ Peringatan Batas Presensi!',
            body: 'Pukul 07.15 WITA. Segera Clock In sebelum batas toleransi 07.30 agar tidak tercatat terlambat!',
            schedule: { at: t3 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }
      } else {
        // Batalkan notifikasi pagi jika sudah presensi masuk
        await cancelMorningReminders()
      }

      // 2. JADWAL SIANG (Clock Out) - Hanya jika belum presensi pulang
      if (!hasCheckedOut) {
        const [pH, pM] = jamPulangShift.split(':').map(Number)
        const hourPulang = isNaN(pH) ? 14 : pH
        const minPulang = isNaN(pM) ? 0 : pM

        const tPulang1 = getScheduleDate(hourPulang, minPulang)
        if (tPulang1 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.SIANG_1,
            title: '🔔 Jam Kepulangan Telah Tiba',
            body: `Pukul ${jamPulangShift} WITA. Waktu tugas Anda hari ini telah selesai. Silakan lakukan Clock Out sebelum pulang.`,
            schedule: { at: tPulang1 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }

        const tPulang2 = getScheduleDate(hourPulang, minPulang + 5)
        if (tPulang2 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.SIANG_2,
            title: '⏰ Pengingat Presensi Pulang',
            body: 'Jangan lupa Clock Out! Catat kepulangan Anda di aplikasi Gammara sekarang.',
            schedule: { at: tPulang2 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }

        const tPulang3 = getScheduleDate(hourPulang, minPulang + 15)
        if (tPulang3 > now) {
          notificationsToSchedule.push({
            id: NOTIF_IDS.SIANG_3,
            title: '⚠️ Peringatan Belum Clock Out!',
            body: 'Anda belum mencatat presensi pulang. Mohon segera Clock Out agar rekap presensi lengkap.',
            schedule: { at: tPulang3 },
            channelId: 'absensi_alarm_channel',
            sound: 'res_custom_notification',
            smallIcon: 'ic_launcher'
          })
        }
      } else {
        // Batalkan notifikasi siang jika sudah presensi pulang
        await cancelAfternoonReminders()
      }

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
