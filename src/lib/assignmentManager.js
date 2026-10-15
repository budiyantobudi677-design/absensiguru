// Utility helper for managing global teacher assignments in cloud and local storage

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

    const currentMap = { ...getCachedAssignmentsMap() }

    // 1. Baca data dari tabel 'classes' langsung (sumber kebenaran utama database)
    try {
      const { data: clsData } = await supabase.from('classes').select('id, name, teacher_id')
      if (Array.isArray(clsData)) {
        clsData.forEach(c => {
          if (c.teacher_id) {
            currentMap[c.teacher_id] = {
              tipe: 'guru_kelas',
              mapel: currentMap[c.teacher_id]?.mapel || '',
              assignedClasses: [c.id],
              updatedAt: new Date().toISOString()
            }
          }
        })
      }
    } catch (err) {
      console.warn('Error reading classes for assignments:', err)
    }

    // 2. Baca dari tabel 'pengumuman' config
    try {
      const { data, error } = await supabase
        .from('pengumuman')
        .select('*')
        .eq('target_type', CONFIG_TARGET_TYPE)
        .order('id', { ascending: false })
        .limit(1)

      if (!error && data && data.length > 0) {
        const parsed = JSON.parse(data[0].pesan)
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([tId, info]) => {
            // Pengaturan eksplisit Admin memiliki otoritas tertinggi (menimpa classes lama)
            currentMap[tId] = {
              ...(currentMap[tId] || {}),
              ...info
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
      assignedClasses: tipe === 'tendik' ? [] : selectedClasses,
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
          // Guru Mapel bukan wali kelas, lepaskan dari kelas manapun
          await supabase.from('classes').update({ teacher_id: null }).eq('teacher_id', teacherId)
        }
      } catch (e) {
        console.warn('Error updating classes.teacher_id:', e)
      }

      // 5. Upsert row config di Supabase (tabel pengumuman)
      try {
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
export function getClassesTakenByOtherTeachers(currentTeacherId, profiles = [], classesList = []) {
  const currentMap = getCachedAssignmentsMap()
  const takenMap = {} // { [classId]: { teacherId, teacherName, tipe } }

  // 1. Cek langsung dari classesList (data dari tabel classes Supabase dengan teacher_id)
  if (Array.isArray(classesList)) {
    classesList.forEach(cls => {
      if (cls.teacher_id && cls.teacher_id !== currentTeacherId) {
        const prof = profiles.find(p => p.id === cls.teacher_id)
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
      info.assignedClasses.forEach(clsId => {
        if (!takenMap[clsId]) {
          const prof = profiles.find(p => p.id === tId)
          takenMap[clsId] = {
            teacherId: tId,
            teacherName: prof?.full_name || prof?.email?.split('@')[0] || 'Guru Lain',
            tipe: 'guru_kelas'
          }
        }
      })
    }
  })

  // 3. Baca juga dari profiles array (jika jabatan mengandung indikasi wali kelas)
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
