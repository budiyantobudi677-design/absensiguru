// ==============================================================================
// APP RESET MANAGER - RESET ULANG APLIKASI MULAI KEMBALI DARI 0
// Khusus diakses oleh Akun Pengembang (Developer)
// ==============================================================================

/**
 * Unduh snapshot cadangan lengkap seluruh database ke format file JSON sebelum reset
 */
export async function downloadFullSystemBackup(supabase) {
  try {
    const fetchSafe = async (tableName) => {
      try {
        const { data, error } = await supabase.from(tableName).select('*').limit(2000)
        if (error) return []
        return data || []
      } catch {
        return []
      }
    }

    const [
      profiles,
      settings,
      classes,
      students,
      absensi,
      journals,
      studentAttendance,
      studentGrades,
      behaviorNotes,
      holidays,
      announcements
    ] = await Promise.all([
      fetchSafe('profiles'),
      fetchSafe('settings'),
      fetchSafe('classes'),
      fetchSafe('students'),
      fetchSafe('absensi'),
      fetchSafe('learning_journals'),
      fetchSafe('student_attendance'),
      fetchSafe('student_grades'),
      fetchSafe('student_behavior_notes'),
      fetchSafe('hari_libur'),
      fetchSafe('pengumuman')
    ])

    const backupData = {
      backupTitle: 'GAMMARA APP - FULL SYSTEM BACKUP SEBELUM FACTORY RESET',
      exportedAt: new Date().toISOString(),
      metadata: {
        totalProfiles: profiles.length,
        totalAbsensi: absensi.length,
        totalStudents: students.length,
        totalClasses: classes.length,
        totalJournals: journals.length
      },
      database: {
        profiles,
        settings,
        classes,
        students,
        absensi,
        learning_journals: journals,
        student_attendance: studentAttendance,
        student_grades: studentGrades,
        student_behavior_notes: behaviorNotes,
        hari_libur: holidays,
        pengumuman: announcements
      }
    }

    const jsonStr = JSON.stringify(backupData, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const filename = `Backup_GammaraApp_Sebelum_Reset_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return { success: true, filename }
  } catch (err) {
    console.error('Gagal membuat file backup:', err)
    throw new Error('Gagal mengunduh cadangan sistem: ' + err.message)
  }
}

/**
 * Eksekusi Factory Reset Aplikasi: Mengosongkan semua riwayat & data mulai kembali dari 0
 * @param {object} supabase - Supabase client instance
 * @param {function} onProgress - Callback (message, percent)
 */
export async function executeAppFactoryReset(supabase, onProgress = () => {}) {
  const logStep = (msg, pct) => {
    console.log(`[Factory Reset ${pct}%] ${msg}`)
    onProgress(msg, pct)
  }

  try {
    // 1. Coba panggil RPC PostgreSQL jika sudah tersedia di database Supabase
    logStep('Menghubungi Cloud RPC reset_application_to_zero...', 10)
    let rpcSuccess = false
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('reset_application_to_zero')
      if (!rpcErr && rpcRes?.success) {
        rpcSuccess = true
        logStep('Prosedur Cloud RPC berhasil dieksekusi.', 80)
      }
    } catch (e) {
      console.warn('RPC reset_application_to_zero tidak ditemukan, beralih ke penghapusan terkelola:', e)
    }

    // 2. Jika RPC tidak tersedia, jalankan pembersihan menyeluruh via REST client
    if (!rpcSuccess) {
      logStep('Mereset riwayat presensi pegawai & absensi guru...', 20)
      try {
        await supabase
          .from('absensi')
          .delete()
          .not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus absensi:', e)
      }

      logStep('Mereset riwayat jurnal & KBM guru...', 35)
      try {
        await supabase.from('learning_journals').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus learning_journals:', e)
      }
      try {
        await supabase.from('jurnal').delete().not('id', 'is', null)
      } catch {}

      logStep('Mereset presensi dan nilai siswa...', 50)
      try {
        await supabase.from('student_attendance').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus student_attendance:', e)
      }
      try {
        await supabase.from('student_grades').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus student_grades:', e)
      }
      try {
        await supabase.from('student_behavior_notes').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus student_behavior_notes:', e)
      }

      logStep('Mereset data siswa dan kelas...', 65)
      try {
        await supabase.from('students').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus students:', e)
      }
      try {
        await supabase.from('classes').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus classes:', e)
      }
      try {
        await supabase.from('hari_libur').delete().not('id', 'is', null)
      } catch (e) {
        console.warn('Error menghapus hari_libur:', e)
      }

      logStep('Membersihkan pengumuman & konfigurasi sementara...', 75)
      try {
        // Amankan Master Key Developer & Kredensial Admin, hapus pengumuman umum & config lainnya
        const { data: pList } = await supabase.from('pengumuman').select('id, target_type')
        if (pList && pList.length > 0) {
          const deleteIds = pList
            .filter(p => p.target_type !== '__SYSTEM_DEVELOPER_KEY_CONFIG__' && p.target_type !== '__SYSTEM_ADMIN_CREDENTIALS__')
            .map(p => p.id)

          if (deleteIds.length > 0) {
            await supabase.from('pengumuman').delete().in('id', deleteIds)
          }
        }
      } catch (e) {
        console.warn('Error membersihkan pengumuman:', e)
      }

      logStep('Mereset penugasan akun guru & pegawai...', 85)
      try {
        // Kosongkan penugasan mata pelajaran, jabatan, dan foto profil guru (akun auth tetap ada agar dapat login)
        await supabase
          .from('profiles')
          .update({
            mata_pelajaran: null,
            jabatan: null,
            foto_profil: null
          })
          .neq('role', 'admin')
      } catch (e) {
        console.warn('Error mereset profiles:', e)
      }

      logStep('Mereset pengaturan sekolah ke setelan pabrik...', 90)
      try {
        await supabase.from('settings').upsert({
          id: 1,
          nama_sekolah: 'SDN 173 Gammara',
          logo_sekolah: null,
          hari_kerja: 5,
          rekap_tampil_jam: true,
          geofence_enabled: false,
          school_lat: -5.147665,
          school_lng: 119.432732,
          school_radius: 100
        }, { onConflict: 'id' })
      } catch (e) {
        console.warn('Error mereset settings:', e)
      }
    }

    // 3. Bersihkan Cache Lokal & Offline Storage
    logStep('Membersihkan cache lokal browser & storage perangkat...', 95)
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (
          k &&
          (k.startsWith('panrita_') ||
           k.startsWith('pengumuman_') ||
           k.startsWith('offline_') ||
           k.startsWith('absensi_') ||
           k.includes('device') ||
           k.includes('assignment')) &&
          k !== 'panrita_developer_session' // Jangan logoutkan developer saat reset berhasil
        ) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {
      console.warn('Error clearing localStorage:', e)
    }

    logStep('Selesai! Aplikasi berhasil direset total kembali dari 0.', 100)
    return {
      success: true,
      message: 'Aplikasi dan seluruh data berhasil direset kembali mulai dari 0!'
    }
  } catch (err) {
    console.error('Fatal reset error:', err)
    throw new Error('Terjadi kendala saat mereset aplikasi: ' + err.message)
  }
}
