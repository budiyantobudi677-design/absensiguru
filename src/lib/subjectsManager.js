// Helper utility for managing custom & default subjects across the KBM modules

export const DEFAULT_SUBJECTS = [
  'Pendidikan Agama & Budi Pekerti',
  'Pendidikan Pancasila / PKn',
  'Bahasa Indonesia',
  'Matematika',
  'IPAS (IPA & IPS)',
  'Bahasa Inggris',
  'Pendidikan Jasmani (PJOK)',
  'Seni Musik',
  'Seni Rupa',
  'Seni Tari',
  'Seni Teater',
  'Kokurikuler / P5',
  'Informatika / TIK',
  'Muatan Lokal / Bahasa Daerah'
]

export function getCustomSubjects() {
  try {
    const saved = localStorage.getItem('panrita_kbm_subjects')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.error('Error reading subjects from localStorage', err)
  }
  return DEFAULT_SUBJECTS
}

/**
 * Sinkronisasi daftar mata pelajaran dari Supabase ke localStorage
 * sehingga akun guru di browser/perangkat berbeda otomatis mendapatkan daftar mapel terbaru.
 */
export async function syncCloudSubjects(supabase) {
  try {
    if (!supabase) return getCustomSubjects()
    const { data, error } = await supabase
      .from('pengumuman')
      .select('*')
      .eq('target_type', '__SYSTEM_CONFIG_SUBJECTS__')
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const parsed = JSON.parse(data[0].pesan)
      if (Array.isArray(parsed) && parsed.length > 0) {
        localStorage.setItem('panrita_kbm_subjects', JSON.stringify(parsed))
        window.dispatchEvent(new Event('kbm_subjects_updated'))
        return parsed
      }
    }
  } catch (err) {
    console.error('Error syncing cloud subjects:', err)
  }
  return getCustomSubjects()
}

/**
 * Menyimpan mata pelajaran ke localStorage dan database Supabase (cloud)
 */
export async function saveCustomSubjects(subjectsList, supabase) {
  try {
    localStorage.setItem('panrita_kbm_subjects', JSON.stringify(subjectsList))
    window.dispatchEvent(new Event('kbm_subjects_updated'))

    if (supabase) {
      const payloadStr = JSON.stringify(subjectsList)
      // Cek apakah sudah ada row config
      const { data: existing } = await supabase
        .from('pengumuman')
        .select('id')
        .eq('target_type', '__SYSTEM_CONFIG_SUBJECTS__')
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
            target_type: '__SYSTEM_CONFIG_SUBJECTS__',
            target_users: ''
          }])
      }
    }
  } catch (err) {
    console.error('Error saving subjects to cloud/localStorage', err)
  }
}

/**
 * Mendapatkan map mata pelajaran yang telah diampu oleh Guru Mapel beserta informasi gurunya.
 * Membaca dari data profil guru yang tersimpan di profiles dan localStorage.
 * Format return: { [namaMapel]: { teacherId, teacherName, assignedClasses } }
 */
export async function getAssignedMapelInfo(supabase) {
  try {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, jabatan, role')
    const mapelAssignedMap = {}

    if (profiles) {
      profiles.forEach(p => {
        const tipe = localStorage.getItem(`guru_tipe_${p.id}`) || (p.jabatan?.includes('Guru Mapel') ? 'guru_mapel' : '')
        let mapel = localStorage.getItem(`guru_mapel_${p.id}`) || ''
        
        // Coba ekstrak dari string jabatan jika belum ada di localStorage (contoh: "Guru IPAS • Guru Mapel")
        if (!mapel && p.jabatan && p.jabatan.includes('Guru Mapel')) {
          const match = p.jabatan.match(/Guru\s+(.*?)\s*•/)
          if (match && match[1]) {
            mapel = match[1].trim()
          }
        }

        if ((tipe === 'guru_mapel' || p.jabatan?.includes('Guru Mapel')) && mapel) {
          const assignedClasses = JSON.parse(localStorage.getItem(`guru_assigned_classes_${p.id}`) || '[]')
          mapelAssignedMap[mapel] = {
            teacherId: p.id,
            teacherName: p.full_name || p.email,
            assignedClasses: assignedClasses
          }
        }
      })
    }
    return mapelAssignedMap
  } catch (e) {
    console.error('Error fetching assigned mapel info', e)
    return {}
  }
}

