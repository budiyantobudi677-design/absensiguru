// Utility helper for managing global teacher assignments in cloud and local storage
import { fetchDeletedAccountsRegistry, isAccountDeleted } from './deletedAccountsManager'

const CONFIG_TARGET_TYPE = '__SYSTEM_CONFIG_TEACHER_ASSIGNMENTS__'

/**
 * Membaca data penugasan semua guru dari Cloud Supabase (classes table & pengumuman config).
 * Format data:
 * {
 *   [teacherId]: {
 *     tipe: 'guru_kelas' | 'guru_mapel',
 *     mapel: string,
 *     assignedClasses: string[],
 *     updatedAt: string
 *   }
 * }
 */
export async function syncCloudTeacherAssignments(supabase) {
  try {
    if (!supabase) return getCachedAssignmentsMap()

    const deletedReg = await fetchDeletedAccountsRegistry(supabase).catch(() => ({ deletedIds: [], deletedEmails: [] }))
    const deletedIds = Array.isArray(deletedReg?.deletedIds) ? deletedReg.deletedIds : []
    const deletedEmails = Array.isArray(deletedReg?.deletedEmails) ? deletedReg.deletedEmails : []

    const currentMap = { ...getCachedAssignmentsMap() }

    // 1. Baca data dari tabel 'classes' langsung (sumber kebenaran utama database)
    try {
      const { data: clsData } = await supabase.from('classes').select('id, name, teacher_id')
      if (Array.isArray(clsData)) {
        for (const c of clsData) {
          if (c.teacher_id) {
            // Jika teacher_id adalah akun yang telah dihapus (misal akun Guna), bebaskan kelas di database & jangan masukkan ke currentMap
            if (deletedIds.includes(c.teacher_id) || isAccountDeleted(c.teacher_id, deletedReg)) {
              try {
                await supabase.from('classes').update({ teacher_id: null }).eq('id', c.id)
                c.teacher_id = null
              } catch (e) {}
              continue
            }

            currentMap[c.teacher_id] = {
              ...(currentMap[c.teacher_id] || {}),
              tipe: currentMap[c.teacher_id]?.tipe || 'guru_kelas',
              mapel: currentMap[c.teacher_id]?.mapel || '',
              assignedClasses: [c.id],
              tipe_perangkat: currentMap[c.teacher_id]?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${c.teacher_id}`) || 'android',
              updatedAt: new Date().toISOString()
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error reading classes for assignments:', err)
    }

    // 2. Baca dari tabel 'pengumuman' config
    let pengumumanRowId = null
    let configNeedsPrune = false
    try {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', CONFIG_TARGET_TYPE)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        pengumumanRowId = data[0].id
        const parsed = JSON.parse(data[0].pesan)
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([tId, info]) => {
            // Periksa apakah guru ini masuk dalam daftar akun yang telah dihapus atau akun Guna
            const isGunaOrDeleted = deletedIds.includes(tId) || 
                                    isAccountDeleted(tId, deletedReg) || 
                                    (info?.namaGuru && String(info.namaGuru).toLowerCase().includes('guna')) ||
                                    (info?.teacherName && String(info.teacherName).toLowerCase().includes('guna')) ||
                                    (info?.email && deletedEmails.includes(String(info.email).toLowerCase()))

            if (isGunaOrDeleted) {
              delete currentMap[tId]
              configNeedsPrune = true
              return
            }

            // Pengaturan eksplisit Admin memiliki otoritas tertinggi (menimpa classes lama)
            currentMap[tId] = {
              ...(currentMap[tId] || {}),
              ...info,
              tipe_perangkat: info.tipe_perangkat || currentMap[tId]?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${tId}`) || 'android'
            }
            if (info.tipe === 'tendik') {
              currentMap[tId].assignedClasses = []
            }
          })
        }
      }
    } catch (err) {
      console.warn('Error reading pengumuman config assignments:', err)
    }

    // Bersihkan semua entri di currentMap yang cocok dengan akun terhapus
    Object.keys(currentMap).forEach(tId => {
      if (deletedIds.includes(tId) || isAccountDeleted(tId, deletedReg)) {
        delete currentMap[tId]
        configNeedsPrune = true
      }
    })

    // Jika ada akun terhapus di pengumuman config, update cloud config agar bersih permanen
    if (configNeedsPrune && pengumumanRowId) {
      try {
        await supabase
          .from('pengumuman')
          .update({ pesan: JSON.stringify(currentMap) })
          .eq('id', pengumumanRowId)
      } catch (e) {}
    }

    // 3. Simpan hasil penggabungan ke LocalStorage
    localStorage.setItem('panrita_cloud_teacher_assignments', JSON.stringify(currentMap))
    
    // Cermin ke key localStorage per-guru
    Object.entries(currentMap).forEach(([teacherId, info]) => {
      if (info.tipe) {
        localStorage.setItem(`guru_tipe_${teacherId}`, info.tipe)
        localStorage.setItem(`penugasan_tipe_${teacherId}`, info.tipe)
      }
      if (info.mapel !== undefined) localStorage.setItem(`guru_mapel_${teacherId}`, info.mapel)
      if (Array.isArray(info.assignedClasses)) {
        localStorage.setItem(`guru_assigned_classes_${teacherId}`, JSON.stringify(info.assignedClasses))
      }
      if (info.jabatan) {
        localStorage.setItem(`guru_jabatan_${teacherId}`, info.jabatan)
        localStorage.setItem(`tendik_penugasan_${teacherId}`, info.jabatan)
      }
      if (info.tipe_perangkat) {
        localStorage.setItem(`guru_tipe_perangkat_${teacherId}`, info.tipe_perangkat)
      }
      if (info.tipe === 'tendik') {
        const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(info.jabatan || '')
        localStorage.setItem(`tendik_kategori_${teacherId}`, isNonOp ? 'non_operator' : 'operator')
        localStorage.setItem(`panrita_role_${teacherId}`, isNonOp ? 'nonoperator' : 'operator')
      }
    })

    window.dispatchEvent(new Event('teacher_assignments_updated'))
    return currentMap
  } catch (err) {
    console.error('Error syncing cloud teacher assignments:', err)
  }
  return getCachedAssignmentsMap()
}

export function getCachedAssignmentsMap() {
  try {
    const raw = localStorage.getItem('panrita_cloud_teacher_assignments')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch (err) {
    console.error('Error reading cached assignments map', err)
  }
  return {}
}

/**
 * Menyimpan atau memperbarui penugasan seorang guru ke Cloud Supabase (classes table + config) & LocalStorage
 */
export async function saveTeacherAssignmentToCloud({ teacherId, tipe, mapel, jabatan, assignedClasses, tipe_perangkat, supabase }) {
  try {
    if (!teacherId) return

    const selectedClasses = Array.isArray(assignedClasses) ? assignedClasses : []

    // 1. Update localStorage lokal seketika
    if (tipe) {
      localStorage.setItem(`guru_tipe_${teacherId}`, tipe)
      localStorage.setItem(`penugasan_tipe_${teacherId}`, tipe)
    }
    if (mapel !== undefined) localStorage.setItem(`guru_mapel_${teacherId}`, mapel)
    if (jabatan !== undefined) {
      localStorage.setItem(`guru_jabatan_${teacherId}`, jabatan)
      localStorage.setItem(`tendik_penugasan_${teacherId}`, jabatan)
    }
    if (tipe_perangkat) {
      localStorage.setItem(`guru_tipe_perangkat_${teacherId}`, tipe_perangkat)
    }

    if (tipe === 'tendik') {
      const isNonOp = ['Pustakawan', 'Bujang', 'Satpam'].includes(jabatan || '')
      localStorage.setItem(`tendik_kategori_${teacherId}`, isNonOp ? 'non_operator' : 'operator')
      localStorage.setItem(`panrita_role_${teacherId}`, isNonOp ? 'nonoperator' : 'operator')
      localStorage.setItem(`guru_assigned_classes_${teacherId}`, '[]')
    } else {
      localStorage.setItem(`guru_assigned_classes_${teacherId}`, JSON.stringify(selectedClasses))
    }

    // 2. Ambil peta saat ini
    let currentMap = { ...getCachedAssignmentsMap() }

    // 3. Masukkan data penugasan guru ini
    currentMap[teacherId] = {
      tipe: tipe || currentMap[teacherId]?.tipe || 'guru_kelas',
      mapel: mapel !== undefined ? mapel : (currentMap[teacherId]?.mapel || ''),
      jabatan: jabatan !== undefined ? jabatan : (currentMap[teacherId]?.jabatan || ''),
      tipe_perangkat: tipe_perangkat || currentMap[teacherId]?.tipe_perangkat || localStorage.getItem(`guru_tipe_perangkat_${teacherId}`) || 'android',
      assignedClasses: (tipe === 'tendik' || tipe === 'admin' || tipe === 'kepsek') ? [] : selectedClasses,
      updatedAt: new Date().toISOString()
    }

    localStorage.setItem('panrita_cloud_teacher_assignments', JSON.stringify(currentMap))
    window.dispatchEvent(new Event('teacher_assignments_updated'))

    // 4. Update tabel 'classes' di Supabase (Kunci database utama)
    if (supabase) {
      try {
        if (tipe === 'guru_kelas') {
          // Lepaskan kelas lama yang dipegang guru ini
          await supabase.from('classes').update({ teacher_id: null }).eq('teacher_id', teacherId)
          // Kunci kelas baru yang dipilih
          if (selectedClasses.length > 0) {
            await supabase.from('classes').update({ teacher_id: teacherId }).eq('id', selectedClasses[0])
          }
        } else {
          // Guru Mapel, Tendik, Admin, Kepsek bukan wali kelas, lepaskan dari kelas manapun
          await supabase.from('classes').update({ teacher_id: null }).eq('teacher_id', teacherId)
        }
      } catch (e) {
        console.warn('Error updating classes.teacher_id:', e)
      }

      // 5. Upsert row config di Supabase (tabel pengumuman)
      try {
        const payloadStr = JSON.stringify(currentMap)
        const { data: updated, error: updateErr } = await supabase
          .from('pengumuman')
          .update({ pesan: payloadStr })
          .eq('target_type', CONFIG_TARGET_TYPE)
          .select('id')

        if (updateErr || !updated || updated.length === 0) {
          await supabase
            .from('pengumuman')
            .insert([{
              pesan: payloadStr,
              target_type: CONFIG_TARGET_TYPE,
              target_users: ''
            }])
        }
      } catch (e) {
        console.warn('Error updating cloud config row:', e)
      }
    }
    return currentMap
  } catch (err) {
    console.error('Error saving teacher assignment to cloud:', err)
  }
}

/**
 * Mendapatkan daftar ID kelas yang sudah dipilih oleh guru lain (khususnya sesama Guru Kelas / Wali Kelas)
 * Format return: { [classId]: { teacherId, teacherName, tipe } }
 */
export function getClassesTakenByOtherTeachers(currentTeacherId, profiles = [], classesList = [], deletedReg = null) {
  const currentMap = getCachedAssignmentsMap()
  const takenMap = {} // { [classId]: { teacherId, teacherName, tipe } }

  // Ambil daftar akun terhapus dari registry parameter atau localStorage
  let deletedIds = Array.isArray(deletedReg?.deletedIds) ? deletedReg.deletedIds : []
  let deletedEmails = Array.isArray(deletedReg?.deletedEmails) ? deletedReg.deletedEmails : []
  if (deletedIds.length === 0) {
    try {
      const localIds = JSON.parse(localStorage.getItem('panrita_deleted_account_ids') || '[]')
      if (Array.isArray(localIds)) deletedIds = localIds
    } catch (e) {}
  }
  if (deletedEmails.length === 0) {
    try {
      const localEmails = JSON.parse(localStorage.getItem('panrita_deleted_account_emails') || '[]')
      if (Array.isArray(localEmails)) deletedEmails = localEmails
    } catch (e) {}
  }

  // Filter profil aktif yang valid saja (bukan admin, kepsek, tendik, dan bukan akun terhapus)
  const activeProfilesList = Array.isArray(profiles) ? profiles.filter(p => {
    if (!p || !p.id) return false
    if (p.role === 'admin' || p.role === 'kepsek' || p.role === 'tendik') return false
    if (deletedIds.includes(p.id)) return false
    if (p.email && deletedEmails.includes(String(p.email).toLowerCase())) return false
    if (deletedReg && isAccountDeleted(p, deletedReg)) return false
    // Akun Guna yang telah dihapus
    if (p.full_name && String(p.full_name).toLowerCase().includes('guna') && deletedIds.includes(p.id)) return false
    return true
  }) : []

  // 1. Cek langsung dari classesList (data dari tabel classes Supabase dengan teacher_id)
  if (Array.isArray(classesList)) {
    classesList.forEach(cls => {
      if (cls.teacher_id && cls.teacher_id !== currentTeacherId) {
        // Jika teacher_id adalah akun terhapus, JANGAN KUNCI KELAS!
        if (deletedIds.includes(cls.teacher_id)) return
        if (deletedReg && isAccountDeleted(cls.teacher_id, deletedReg)) return

        // Cari profil guru pengampu di profil aktif
        const prof = activeProfilesList.find(p => p.id === cls.teacher_id)
        
        // PENTING: Jika profil tidak ditemukan dalam daftar aktif (akun yatim/telah dihapus seperti akun Guna),
        // JANGAN KUNCI KELAS! Kelas harus bebas agar bisa dipilih oleh guru lain.
        if (!prof && activeProfilesList.length > 0) {
          return
        }

        // Jika terdeteksi akun yang telah dihapus
        if (prof?.full_name && String(prof.full_name).toLowerCase().includes('guna') && deletedIds.includes(cls.teacher_id)) {
          return
        }

        // Hanya Guru yang bisa mengunci kelas. Akun Admin, Kepsek, atau Tendik BUKAN wali kelas dan tidak boleh mengunci kelas!
        if (prof?.role === 'admin' || prof?.role === 'kepsek' || prof?.role === 'tendik') {
          return
        }

        takenMap[cls.id] = {
          teacherId: cls.teacher_id,
          teacherName: prof?.full_name || prof?.email?.split('@')[0] || 'Guru Lain',
          tipe: 'guru_kelas'
        }
      }
    })
  }

  // 2. Baca dari currentMap cloud
  Object.entries(currentMap).forEach(([tId, info]) => {
    if (tId !== currentTeacherId && info.tipe === 'guru_kelas' && Array.isArray(info.assignedClasses)) {
      // Lewati jika akun guru ini terhapus atau akun Guna yang telah dihapus
      if (deletedIds.includes(tId)) return
      if (deletedReg && isAccountDeleted(tId, deletedReg)) return
      if (String(info?.teacherName || '').toLowerCase().includes('guna') || String(info?.namaGuru || '').toLowerCase().includes('guna')) {
        const isStillActive = activeProfilesList.some(p => p.id === tId)
        if (!isStillActive) return
      }

      const prof = activeProfilesList.find(p => p.id === tId)
      // Jika profil tidak ditemukan dalam daftar aktif, jangan kunci kelas!
      if (!prof && activeProfilesList.length > 0) {
        return
      }

      // Abaikan jika akun admin, kepsek, atau tendik
      if (prof?.role === 'admin' || prof?.role === 'kepsek' || prof?.role === 'tendik' || info.tipe === 'admin' || info.tipe === 'kepsek' || info.tipe === 'tendik') {
        return
      }

      info.assignedClasses.forEach(clsId => {
        if (!takenMap[clsId]) {
          takenMap[clsId] = {
            teacherId: tId,
            teacherName: prof?.full_name || prof?.email?.split('@')[0] || info.teacherName || 'Guru Lain',
            tipe: 'guru_kelas'
          }
        }
      })
    }
  })

  // 3. Baca juga dari activeProfilesList (jika jabatan mengandung indikasi wali kelas)
  activeProfilesList.forEach(p => {
    if (p.id !== currentTeacherId) {
      try {
        const rawAssigned = localStorage.getItem(`guru_assigned_classes_${p.id}`)
        const assigned = rawAssigned ? JSON.parse(rawAssigned) : []
        const tipe = localStorage.getItem(`guru_tipe_${p.id}`) || (p.role === 'guru_mapel' ? 'guru_mapel' : 'guru_kelas')
        if (tipe === 'guru_kelas' && Array.isArray(assigned)) {
          assigned.forEach(clsId => {
            if (!takenMap[clsId]) {
              takenMap[clsId] = {
                teacherId: p.id,
                teacherName: p.full_name || p.email?.split('@')[0] || 'Guru Lain',
                tipe: 'guru_kelas'
              }
            }
          })
        }
      } catch (e) {}
    }
  })

  return takenMap
}

/**
 * Membersihkan kunci kelas dari akun guru yang telah dihapus (seperti akun Guna).
 * Membebaskan kelas (seperti kelas IA) di tabel classes dan config pengumuman.
 */
export async function cleanupDeletedTeacherClassLocks(supabase) {
  try {
    if (!supabase) return false

    const deletedReg = await fetchDeletedAccountsRegistry(supabase).catch(() => ({ deletedIds: [], deletedEmails: [] }))
    const deletedIds = Array.isArray(deletedReg?.deletedIds) ? deletedReg.deletedIds : []
    const deletedEmails = Array.isArray(deletedReg?.deletedEmails) ? deletedReg.deletedEmails : []

    // 1. Ambil daftar profil aktif dari profiles
    let activeProfileIds = []
    let activeProfiles = []
    try {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email, role')
      if (Array.isArray(profs)) {
        activeProfiles = profs.filter(p => !isAccountDeleted(p, deletedReg) && !deletedIds.includes(p.id))
        activeProfileIds = activeProfiles.map(p => p.id)
      }
    } catch (e) {
      console.warn('Gagal ambil profiles di cleanup:', e)
    }

    // 2. Ambil kelas dari database Supabase
    try {
      const { data: classesData } = await supabase.from('classes').select('id, name, teacher_id')
      if (Array.isArray(classesData)) {
        for (const cls of classesData) {
          if (!cls.teacher_id) continue

          const isDeletedTeacher = deletedIds.includes(cls.teacher_id) || 
                                   isAccountDeleted(cls.teacher_id, deletedReg) || 
                                   (activeProfileIds.length > 0 && !activeProfileIds.includes(cls.teacher_id))
          
          // Periksa juga jika ada kelas yang dikunci oleh nama 'Guna'
          const profOwner = activeProfiles.find(p => p.id === cls.teacher_id)
          const isGuna = profOwner?.full_name?.toLowerCase().includes('guna')

          if (isDeletedTeacher || (cls.name === 'IA' && !profOwner) || (isGuna && !activeProfileIds.includes(cls.teacher_id))) {
            console.log(`[PanritaEdu] Membebaskan kelas ${cls.name} (ID: ${cls.id}) dari pengampu yang tidak valid/terhapus:`, cls.teacher_id)
            await supabase.from('classes').update({ teacher_id: null }).eq('id', cls.id)
            cls.teacher_id = null
          }
        }
        localStorage.setItem('panrita_cached_classes', JSON.stringify(classesData))
      }
    } catch (err) {
      console.warn('Gagal membersihkan classes teacher_id:', err)
    }

    // 3. Bersihkan config cloud pengumuman
    try {
      const { data: configData } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', CONFIG_TARGET_TYPE)
        .order('id', { ascending: false })
        .limit(1)

      if (configData && configData.length > 0) {
        let parsed = JSON.parse(configData[0].pesan || '{}')
        let modified = false
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(tId => {
            const info = parsed[tId] || {}
            const isOrphanOrDeleted = deletedIds.includes(tId) || 
                                      isAccountDeleted(tId, deletedReg) || 
                                      (activeProfileIds.length > 0 && !activeProfileIds.includes(tId)) ||
                                      String(info?.namaGuru || '').toLowerCase().includes('guna') ||
                                      String(info?.teacherName || '').toLowerCase().includes('guna') ||
                                      String(tId).toLowerCase().includes('guna')

            if (isOrphanOrDeleted) {
              delete parsed[tId]
              modified = true
            }
          })

          if (modified) {
            await supabase
              .from('pengumuman')
              .update({ pesan: JSON.stringify(parsed) })
              .eq('id', configData[0].id)
            localStorage.setItem('panrita_cloud_teacher_assignments', JSON.stringify(parsed))
          }
        }
      }
    } catch (err) {
      console.warn('Gagal membersihkan config pengumuman penugasan:', err)
    }

    // 4. Bersihkan localStorage
    deletedIds.forEach(id => {
      localStorage.removeItem(`guru_assigned_classes_${id}`)
      localStorage.removeItem(`guru_tipe_${id}`)
      localStorage.removeItem(`guru_mapel_${id}`)
      localStorage.removeItem(`guru_jabatan_${id}`)
      localStorage.removeItem(`guru_tipe_perangkat_${id}`)
    })

    // Bersihkan semua kunci localStorage yang menyimpan nama 'guna' atau id guna
    try {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k) continue
        if (k.toLowerCase().includes('guna')) {
          keysToRemove.push(k)
        } else if (k.startsWith('guru_assigned_classes_') || k.startsWith('guru_tipe_')) {
          const val = localStorage.getItem(k)
          if (val && val.toLowerCase().includes('guna')) {
            keysToRemove.push(k)
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch (e) {}

    window.dispatchEvent(new Event('teacher_assignments_updated'))
    return true
  } catch (err) {
    console.error('Error in cleanupDeletedTeacherClassLocks:', err)
    return false
  }
}

// Alias untuk kompatibilitas
export const releaseClassFromDeletedTeachers = cleanupDeletedTeacherClassLocks
