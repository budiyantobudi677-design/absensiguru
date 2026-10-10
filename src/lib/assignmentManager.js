// Utility helper for managing global teacher assignments in cloud and local storage

const CONFIG_TARGET_TYPE = '__SYSTEM_CONFIG_TEACHER_ASSIGNMENTS__'

/**
 * Membaca data penugasan semua guru dari Cloud Supabase.
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

    const { data, error } = await supabase
      .from('pengumuman')
      .select('*')
      .eq('target_type', CONFIG_TARGET_TYPE)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const parsed = JSON.parse(data[0].pesan)
      if (parsed && typeof parsed === 'object') {
        localStorage.setItem('panrita_cloud_teacher_assignments', JSON.stringify(parsed))
        
        // Cermin ke key localStorage per-guru jika belum ada
        Object.entries(parsed).forEach(([teacherId, info]) => {
          if (info.tipe) localStorage.setItem(`guru_tipe_${teacherId}`, info.tipe)
          if (info.mapel) localStorage.setItem(`guru_mapel_${teacherId}`, info.mapel)
          if (Array.isArray(info.assignedClasses)) {
            localStorage.setItem(`guru_assigned_classes_${teacherId}`, JSON.stringify(info.assignedClasses))
          }
        })

        window.dispatchEvent(new Event('teacher_assignments_updated'))
        return parsed
      }
    }
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
 * Menyimpan atau memperbarui penugasan seorang guru ke Cloud Supabase & LocalStorage
 */
export async function saveTeacherAssignmentToCloud({ teacherId, tipe, mapel, assignedClasses, supabase }) {
  try {
    if (!teacherId) return

    // 1. Update localStorage lokal seketika
    if (tipe) localStorage.setItem(`guru_tipe_${teacherId}`, tipe)
    if (mapel !== undefined) localStorage.setItem(`guru_mapel_${teacherId}`, mapel)
    if (Array.isArray(assignedClasses)) {
      localStorage.setItem(`guru_assigned_classes_${teacherId}`, JSON.stringify(assignedClasses))
    }

    // 2. Ambil peta saat ini
    let currentMap = getCachedAssignmentsMap()

    // Jika cloud tersedia, coba ambil yang paling baru terlebih dahulu
    if (supabase) {
      try {
        const { data: latestRow } = await supabase
          .from('pengumuman')
          .select('id, pesan')
          .eq('target_type', CONFIG_TARGET_TYPE)
          .limit(1)
        if (latestRow && latestRow.length > 0) {
          const parsed = JSON.parse(latestRow[0].pesan)
          if (parsed && typeof parsed === 'object') {
            currentMap = { ...parsed }
          }
        }
      } catch (e) {}
    }

    // 3. Masukkan data penugasan guru ini
    currentMap[teacherId] = {
      tipe: tipe || currentMap[teacherId]?.tipe || 'guru_kelas',
      mapel: mapel !== undefined ? mapel : (currentMap[teacherId]?.mapel || ''),
      assignedClasses: Array.isArray(assignedClasses) ? assignedClasses : (currentMap[teacherId]?.assignedClasses || []),
      updatedAt: new Date().toISOString()
    }

    localStorage.setItem('panrita_cloud_teacher_assignments', JSON.stringify(currentMap))
    window.dispatchEvent(new Event('teacher_assignments_updated'))

    // 4. Upsert row config di Supabase (tabel pengumuman)
    if (supabase) {
      const payloadStr = JSON.stringify(currentMap)
      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', CONFIG_TARGET_TYPE)
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('pengumuman')
          .update({ pesan: payloadStr })
          .eq('id', existing[0].id)
      } else {
        await supabase
          .from('pengumuman')
          .insert([{
            pesan: payloadStr,
            target_type: CONFIG_TARGET_TYPE,
            target_users: ''
          }])
      }
    }
    return currentMap
  } catch (err) {
    console.error('Error saving teacher assignment to cloud:', err)
  }
}

/**
 * Mendapatkan daftar ID kelas yang sudah dipilih oleh guru lain (khususnya sesama Guru Kelas / Wali Kelas)
 * Format return: Set<classId> atau Array objek { classId, teacherId, teacherName, tipe }
 */
export function getClassesTakenByOtherTeachers(currentTeacherId, profiles = []) {
  const currentMap = getCachedAssignmentsMap()
  const takenMap = {} // { [classId]: { teacherId, teacherName, tipe } }

  // 1. Baca dari currentMap cloud
  Object.entries(currentMap).forEach(([tId, info]) => {
    if (tId !== currentTeacherId && info.tipe === 'guru_kelas' && Array.isArray(info.assignedClasses)) {
      info.assignedClasses.forEach(clsId => {
        const prof = profiles.find(p => p.id === tId)
        takenMap[clsId] = {
          teacherId: tId,
          teacherName: prof?.full_name || prof?.email || 'Guru Lain',
          tipe: 'guru_kelas'
        }
      })
    }
  })

  // 2. Baca juga dari profiles array jika ada jabatan yang mengandung nama wali
  profiles.forEach(p => {
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
                teacherName: p.full_name || p.email || 'Guru Lain',
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
