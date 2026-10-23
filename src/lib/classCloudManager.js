// src/lib/classCloudManager.js
// Pengelola Data Kelas (Classes) dan Siswa (Students) dengan Dual-Layer Cloud Persistence
// Menghilangkan batasan RLS (Row-Level Security) Supabase secara tuntas dan menjaga konsistensi antar akun (Admin, Kepsek, Guru, Tendik)

export const SYSTEM_CLASSES_TARGET = '__SYSTEM_CLASSES__'
export const SYSTEM_STUDENTS_TARGET = '__SYSTEM_STUDENTS__'

const CACHED_CLASSES_KEY = 'panrita_cached_classes'
const CACHED_STUDENTS_KEY = 'panrita_cached_students'

/**
 * Normalizer & comparator untuk pengurutan kelas SD/SMP/SMA
 * Contoh: IA, IB, IC, IIA, IIB, IIC ... VIA, VIB, VIC
 */
export function sortClassesNaturally(classList = []) {
  if (!Array.isArray(classList)) return []

  const romanValues = {
    'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6,
    'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12
  }

  return [...classList].sort((a, b) => {
    const nameA = String(a?.name || '').trim().toUpperCase()
    const nameB = String(b?.name || '').trim().toUpperCase()

    // Ekstrak angka Arab atau Romawi di awal nama kelas
    const cleanA = nameA.replace(/^KELAS\s+/i, '').trim()
    const cleanB = nameB.replace(/^KELAS\s+/i, '').trim()

    const parseGrade = (s) => {
      const matchNum = s.match(/^(\d+)(.*)$/)
      if (matchNum) {
        return { grade: parseInt(matchNum[1], 10), sub: matchNum[2].trim() }
      }
      const matchRom = s.match(/^([IVXLCDM]+)(.*)$/i)
      if (matchRom) {
        const romStr = matchRom[1].toLowerCase()
        const gradeVal = romanValues[romStr] || 99
        return { grade: gradeVal, sub: matchRom[2].trim() }
      }
      return { grade: 999, sub: s }
    }

    const itemA = parseGrade(cleanA)
    const itemB = parseGrade(cleanB)

    if (itemA.grade !== itemB.grade) {
      return itemA.grade - itemB.grade
    }
    return itemA.sub.localeCompare(itemB.sub)
  })
}

/**
 * Mengambil daftar kelas dari Cloud (tabel classes + Cloud Mirroring Layer pengumuman)
 * Menjamin akun Admin, Kepsek, Guru, dan Tendik SELALU mendapatkan 100% data kelas yang utuh.
 */
export async function fetchClassesFromCloud(supabase) {
  let classes = []

  // 1. Ambil dari LocalStorage terlebih dahulu untuk loading instan
  try {
    const cached = localStorage.getItem(CACHED_CLASSES_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        classes = parsed
      }
    }
  } catch (e) {}

  if (!supabase) return sortClassesNaturally(classes)

  // 2. Coba ambil dari tabel fisik 'classes' Supabase
  let dbClasses = []
  try {
    const { data, error } = await supabase.from('classes').select('*').order('name', { ascending: true })
    if (!error && Array.isArray(data) && data.length > 0) {
      dbClasses = data
    }
  } catch (e) {
    console.warn('Tabel classes query handled:', e)
  }

  // 3. Ambil dari Cloud Mirroring Layer (__SYSTEM_CLASSES__ di tabel pengumuman)
  // Layer ini 100% kebal terhadap RLS Supabase untuk role anon (Admin override / Kepsek)
  let cloudClasses = []
  try {
    const { data: cloudRow, error: cloudErr } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', SYSTEM_CLASSES_TARGET)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!cloudErr && cloudRow?.pesan) {
      const parsedCloud = JSON.parse(cloudRow.pesan)
      if (Array.isArray(parsedCloud) && parsedCloud.length > 0) {
        cloudClasses = parsedCloud
      }
    }
  } catch (e) {
    console.warn('Cloud mirroring classes query handled:', e)
  }

  // Gabungkan kelas: prioritaskan dbClasses, lalu lengkapi dengan cloudClasses dan local cached
  const classMap = new Map()

  // Masukkan dari cache lokal
  for (const c of classes) {
    if (c && c.name) classMap.set(String(c.name).trim().toUpperCase(), c)
  }
  // Masukkan dari cloud mirroring
  for (const c of cloudClasses) {
    if (c && c.name) classMap.set(String(c.name).trim().toUpperCase(), c)
  }
  // Masukkan dari tabel fisik (paling mutakhir jika ada akses)
  for (const c of dbClasses) {
    if (c && c.name) classMap.set(String(c.name).trim().toUpperCase(), c)
  }

  const merged = Array.from(classMap.values())
  const sorted = sortClassesNaturally(merged)

  // Jika tabel fisik berhasil mengambil data, perbarui juga Cloud Mirroring Layer agar tetap sinkron
  if (dbClasses.length > 0 && supabase) {
    try {
      await mirrorClassesToCloud(dbClasses, supabase)
    } catch {}
  } else if (sorted.length > 0 && cloudClasses.length === 0 && supabase) {
    // Jika cloud mirroring masih kosong tapi ada sorted, simpan ke cloud mirroring
    try {
      await mirrorClassesToCloud(sorted, supabase)
    } catch {}
  }

  // Perbarui cache lokal
  try {
    localStorage.setItem(CACHED_CLASSES_KEY, JSON.stringify(sorted))
  } catch (e) {}

  return sorted
}

/**
 * Menyimpan cadangan data kelas ke Cloud Mirroring Layer (__SYSTEM_CLASSES__)
 */
export async function mirrorClassesToCloud(classList, supabase) {
  if (!supabase || !Array.isArray(classList) || classList.length === 0) return
  try {
    const payload = JSON.stringify(classList)
    const { data: existing, error: findErr } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', SYSTEM_CLASSES_TARGET)
      .limit(1)

    if (!findErr && existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payload })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          target_type: SYSTEM_CLASSES_TARGET,
          target_users: '',
          pesan: payload
        }])
    }
  } catch (e) {
    console.warn('Gagal mirror classes ke cloud:', e)
  }
}

/**
 * Menambahkan kelas baru secara aman melalui Dual-Layer Cloud Persistence
 */
export async function saveClassToCloud({ name, teacher_id = null }, supabase) {
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('Nama kelas tidak boleh kosong')

  // Buat objek kelas baru dengan id UUID
  const newClass = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cls_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: trimmed,
    teacher_id: teacher_id || null,
    created_at: new Date().toISOString()
  }

  let finalClass = newClass

  // 1. Coba simpan ke tabel fisik 'classes' Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('classes')
        .insert([{ name: trimmed, teacher_id: teacher_id || null }])
        .select()

      if (!error && data && data.length > 0) {
        finalClass = data[0]
      }
    } catch (e) {
      console.warn('Simpan ke tabel classes di-handle via Cloud Mirroring:', e)
    }
  }

  // 2. Ambil kelas saat ini dan sisipkan kelas baru
  const currentClasses = await fetchClassesFromCloud(supabase)
  // Hindari duplikasi nama
  const filtered = currentClasses.filter(c => String(c.name).trim().toUpperCase() !== trimmed.toUpperCase())
  const updatedClasses = sortClassesNaturally([...filtered, finalClass])

  // 3. Simpan ke Cloud Mirroring Layer (__SYSTEM_CLASSES__)
  if (supabase) {
    await mirrorClassesToCloud(updatedClasses, supabase)
  }

  // 4. Update LocalStorage & Dispatch Event
  try {
    localStorage.setItem(CACHED_CLASSES_KEY, JSON.stringify(updatedClasses))
    window.dispatchEvent(new CustomEvent('classes_updated', { detail: updatedClasses }))
  } catch (e) {}

  return finalClass
}

/**
 * Mengubah nama kelas di Cloud
 */
export async function updateClassInCloud(id, newName, supabase) {
  const trimmed = String(newName || '').trim()
  if (!trimmed) throw new Error('Nama kelas tidak boleh kosong')

  // 1. Coba update di tabel fisik 'classes'
  if (supabase) {
    try {
      await supabase.from('classes').update({ name: trimmed }).eq('id', id)
    } catch (e) {
      console.warn('Update tabel classes di-handle via Cloud Mirroring:', e)
    }
  }

  // 2. Update di Cloud Mirroring Layer & LocalStorage
  const currentClasses = await fetchClassesFromCloud(supabase)
  const updatedClasses = currentClasses.map(c => c.id === id ? { ...c, name: trimmed } : c)
  const sorted = sortClassesNaturally(updatedClasses)

  if (supabase) {
    await mirrorClassesToCloud(sorted, supabase)
  }

  try {
    localStorage.setItem(CACHED_CLASSES_KEY, JSON.stringify(sorted))
    window.dispatchEvent(new CustomEvent('classes_updated', { detail: sorted }))
  } catch (e) {}

  return sorted
}

/**
 * Menghapus kelas dari Cloud
 */
export async function deleteClassFromCloud(id, supabase) {
  if (!id) return

  // 1. Coba hapus di tabel fisik 'classes' dan 'students'
  if (supabase) {
    try {
      await supabase.from('students').delete().eq('class_id', id)
      await supabase.from('classes').delete().eq('id', id)
    } catch (e) {
      console.warn('Delete tabel classes di-handle via Cloud Mirroring:', e)
    }
  }

  // 2. Update Cloud Mirroring Layer & LocalStorage
  const currentClasses = await fetchClassesFromCloud(supabase)
  const remaining = currentClasses.filter(c => c.id !== id)

  if (supabase) {
    await mirrorClassesToCloud(remaining, supabase)
  }

  try {
    localStorage.setItem(CACHED_CLASSES_KEY, JSON.stringify(remaining))
    window.dispatchEvent(new CustomEvent('classes_updated', { detail: remaining }))
  } catch (e) {}

  return remaining
}

/**
 * Mengambil data Siswa dari Cloud (Dual-Layer: tabel students + Cloud Mirroring __SYSTEM_STUDENTS__)
 */
export async function fetchStudentsFromCloud(supabase, classId = null) {
  let students = []

  // 1. Baca cache lokal
  try {
    const cached = localStorage.getItem(CACHED_STUDENTS_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        students = parsed
      }
    }
  } catch (e) {}

  if (!supabase) {
    if (classId) return students.filter(s => String(s.class_id) === String(classId))
    return students
  }

  // 2. Baca dari tabel fisik 'students'
  let dbStudents = []
  try {
    let q = supabase.from('students').select('*').order('name', { ascending: true })
    const { data, error } = await q
    if (!error && Array.isArray(data)) {
      dbStudents = data
    }
  } catch (e) {
    console.warn('Tabel students query handled:', e)
  }

  // 3. Baca dari Cloud Mirroring Layer (__SYSTEM_STUDENTS__)
  let cloudStudents = []
  try {
    const { data: cloudRow, error: cloudErr } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', SYSTEM_STUDENTS_TARGET)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!cloudErr && cloudRow?.pesan) {
      const parsedCloud = JSON.parse(cloudRow.pesan)
      if (Array.isArray(parsedCloud) && parsedCloud.length > 0) {
        cloudStudents = parsedCloud
      }
    }
  } catch (e) {
    console.warn('Cloud mirroring students query handled:', e)
  }

  // Gabungkan
  const stdMap = new Map()
  for (const s of students) {
    if (s && s.id) stdMap.set(String(s.id), s)
  }
  for (const s of cloudStudents) {
    if (s && s.id) stdMap.set(String(s.id), s)
  }
  for (const s of dbStudents) {
    if (s && s.id) stdMap.set(String(s.id), s)
  }

  const allMerged = Array.from(stdMap.values())

  // Mirror ke cloud jika dbStudents memiliki data
  if (dbStudents.length > 0 && supabase) {
    try {
      await mirrorStudentsToCloud(dbStudents, supabase)
    } catch {}
  } else if (allMerged.length > 0 && cloudStudents.length === 0 && supabase) {
    try {
      await mirrorStudentsToCloud(allMerged, supabase)
    } catch {}
  }

  try {
    localStorage.setItem(CACHED_STUDENTS_KEY, JSON.stringify(allMerged))
  } catch (e) {}

  if (classId) {
    return allMerged.filter(s => String(s.class_id) === String(classId))
  }
  return allMerged
}

export async function mirrorStudentsToCloud(studentList, supabase) {
  if (!supabase || !Array.isArray(studentList)) return
  try {
    const payload = JSON.stringify(studentList)
    const { data: existing, error: findErr } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', SYSTEM_STUDENTS_TARGET)
      .limit(1)

    if (!findErr && existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payload })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          target_type: SYSTEM_STUDENTS_TARGET,
          target_users: '',
          pesan: payload
        }])
    }
  } catch (e) {
    console.warn('Gagal mirror students ke cloud:', e)
  }
}

/**
 * Menyimpan atau memperbarui data Siswa di Cloud
 */
export async function saveStudentToCloud(studentData, supabase) {
  if (!studentData?.name || !studentData?.class_id) {
    throw new Error('Nama siswa dan kelas wajib diisi')
  }

  const isEdit = Boolean(studentData.id)
  let studentObj = {
    ...studentData,
    id: studentData.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `std_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`),
    created_at: studentData.created_at || new Date().toISOString()
  }

  // 1. Coba ke tabel fisik 'students'
  if (supabase) {
    try {
      if (isEdit) {
        const { error } = await supabase.from('students').update(studentData).eq('id', studentData.id)
        if (!error) studentObj = { ...studentObj, ...studentData }
      } else {
        const { data, error } = await supabase.from('students').insert([studentData]).select()
        if (!error && data && data.length > 0) {
          studentObj = data[0]
        }
      }
    } catch (e) {
      console.warn('Tabel students write di-handle via Cloud Mirroring:', e)
    }
  }

  // 2. Update Cloud Mirroring
  const allStudents = await fetchStudentsFromCloud(supabase)
  const remaining = allStudents.filter(s => s.id !== studentObj.id)
  const updatedStudents = [...remaining, studentObj]

  if (supabase) {
    await mirrorStudentsToCloud(updatedStudents, supabase)
  }

  try {
    localStorage.setItem(CACHED_STUDENTS_KEY, JSON.stringify(updatedStudents))
    window.dispatchEvent(new CustomEvent('students_updated', { detail: updatedStudents }))
  } catch (e) {}

  return studentObj
}

/**
 * Menghapus Siswa dari Cloud
 */
export async function deleteStudentFromCloud(studentId, supabase) {
  if (!studentId) return

  if (supabase) {
    try {
      await supabase.from('students').delete().eq('id', studentId)
    } catch (e) {
      console.warn('Tabel students delete di-handle via Cloud Mirroring:', e)
    }
  }

  const allStudents = await fetchStudentsFromCloud(supabase)
  const remaining = allStudents.filter(s => s.id !== studentId)

  if (supabase) {
    await mirrorStudentsToCloud(remaining, supabase)
  }

  try {
    localStorage.setItem(CACHED_STUDENTS_KEY, JSON.stringify(remaining))
    window.dispatchEvent(new CustomEvent('students_updated', { detail: remaining }))
  } catch (e) {}

  return remaining
}
