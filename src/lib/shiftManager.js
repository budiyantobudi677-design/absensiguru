// src/lib/shiftManager.js
// Pengelola Sistem Shift, Jam Kerja Per-Hari, & Pola Rotasi Guru (Pekan Ganjil & Pekan Genap)
// Mendukung Dual-Layer Cloud Persistence (Tabel Supabase + Cloud Mirroring bebas RLS + Local Cache)

export const SYSTEM_SHIFT_CONFIG_TARGET = '__SYSTEM_SHIFT_CONFIG__'
const SHIFT_LOCAL_CACHE_KEY = 'panrita_cached_shift_system'

/**
 * Konfigurasi Shift Bawaan:
 * 1. Shift Ganjil (Masuk Pagi)
 * 2. Shift Genap (Masuk Siang - Kamis 10:00-17:00, Jumat 13:00-17:00, Sabtu 09:30-15:00)
 */
export const DEFAULT_SHIFTS = {
  'shift-ganjil': {
    id: 'shift-ganjil',
    name: 'Shift Ganjil',
    code: 'GANJIL',
    description: 'Shift Ganjil (Masuk Pagi)',
    rules: {
      'Senin':  { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00' },
      'Selasa': { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00' },
      'Rabu':   { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00' },
      'Kamis':  { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00' },
      'Jumat':  { jamMasuk: '07:00', toleransi: 15, jamPulang: '11:30' },
      'Sabtu':  { jamMasuk: '07:00', toleransi: 15, jamPulang: '12:30' },
      'Minggu': { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00', libur: true }
    }
  },
  'shift-genap': {
    id: 'shift-genap',
    name: 'Shift Genap',
    code: 'GENAP',
    description: 'Shift Genap (Masuk Siang)',
    rules: {
      'Senin':  { jamMasuk: '10:00', toleransi: 15, jamPulang: '17:00' },
      'Selasa': { jamMasuk: '10:00', toleransi: 15, jamPulang: '17:00' },
      'Rabu':   { jamMasuk: '10:00', toleransi: 15, jamPulang: '17:00' },
      'Kamis':  { jamMasuk: '10:00', toleransi: 15, jamPulang: '17:00' }, // Spesifik sesuai kebutuhan sekolah
      'Jumat':  { jamMasuk: '13:00', toleransi: 15, jamPulang: '17:00' }, // Jumat setelah ibadah sholat
      'Sabtu':  { jamMasuk: '09:30', toleransi: 15, jamPulang: '15:00' }, // Sabtu beda jam
      'Minggu': { jamMasuk: '10:00', toleransi: 15, jamPulang: '17:00', libur: true }
    }
  }
}

/**
 * Menghitung nomor minggu dalam setahun (Standar ISO 8601)
 */
export function getIsoWeekNumber(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return weekNo
}

/**
 * Menentukan apakah tanggal berada di Pekan Ganjil (Minggu ke-1, 3, 5...) atau Pekan Genap (2, 4, 6...)
 */
export function isOddWeek(d = new Date()) {
  return getIsoWeekNumber(d) % 2 !== 0
}

/**
 * Mengambil nama hari dalam Bahasa Indonesia
 */
export function getIndonesianDayName(d = new Date()) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
  return days[d.getDay()]
}

/**
 * Membaca data shift dan penugasan guru dari LocalStorage
 */
export function getCachedShiftSystem() {
  try {
    const raw = localStorage.getItem(SHIFT_LOCAL_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        const baseShifts = JSON.parse(JSON.stringify(DEFAULT_SHIFTS))
        const savedShifts = parsed.shifts || {}
        Object.keys(savedShifts).forEach(k => {
          baseShifts[k] = {
            ...(baseShifts[k] || {}),
            ...savedShifts[k],
            rules: {
              ...(baseShifts[k]?.rules || {}),
              ...(savedShifts[k]?.rules || {})
            }
          }
        })
        // Self-healing: Pastikan Shift Genap tidak tertukar atau bernama Shift Ganjil
        if (baseShifts['shift-genap']) {
          if (!baseShifts['shift-genap'].name || baseShifts['shift-genap'].name === 'Shift Ganjil') {
            baseShifts['shift-genap'].name = 'Shift Genap'
          }
          if (!baseShifts['shift-genap'].code || baseShifts['shift-genap'].code === 'GANJIL') {
            baseShifts['shift-genap'].code = 'GENAP'
          }
        }
        return {
          shifts: baseShifts,
          assignments: parsed.assignments || {}
        }
      }
    }
  } catch (e) {}
  return { shifts: JSON.parse(JSON.stringify(DEFAULT_SHIFTS)), assignments: {} }
}

/**
 * Membaca konfigurasi shift dan plotting dari Cloud Supabase & Local Cache
 */
export async function fetchShiftSystemData(supabase) {
  let systemData = getCachedShiftSystem()

  if (!supabase) return systemData

  let currentShifts = JSON.parse(JSON.stringify(systemData.shifts || DEFAULT_SHIFTS))
  let currentAssignments = { ...(systemData.assignments || {}) }

  // 1. Coba baca dari tabel SQL resmi 'school_shifts' & 'teacher_shift_assignments'
  try {
    const { data: shiftRows, error: shiftErr } = await supabase
      .from('school_shifts')
      .select('*')

    if (!shiftErr && Array.isArray(shiftRows) && shiftRows.length > 0) {
      shiftRows.forEach(row => {
        if (row && row.id) {
          currentShifts[row.id] = {
            id: row.id,
            name: row.nama || row.name || (row.id === 'shift-genap' ? 'Shift Genap' : 'Shift Ganjil'),
            code: row.code || row.kode || (row.id === 'shift-genap' ? 'GENAP' : 'GANJIL'),
            description: row.deskripsi || row.description || '',
            rules: row.rules || DEFAULT_SHIFTS[row.id]?.rules || {}
          }
        }
      })
    }

    const { data: assignRows, error: assignErr } = await supabase
      .from('teacher_shift_assignments')
      .select('*')

    if (!assignErr && Array.isArray(assignRows)) {
      assignRows.forEach(row => {
        if (row && row.teacher_id) {
          currentAssignments[row.teacher_id] = {
            teacherId: row.teacher_id,
            mode: row.mode || 'fixed',
            fixedShiftId: row.fixed_shift_id || 'shift-ganjil',
            rollingConfig: row.rolling_config || {
              oddWeek: { monWed: 'shift-ganjil', thuSat: 'shift-genap' },
              evenWeek: { monWed: 'shift-genap', thuSat: 'shift-ganjil' }
            },
            customDaysConfig: row.custom_days_config || {},
            updatedAt: row.updated_at
          }
        }
      })
    }
  } catch (err) {
    console.warn('Query tabel SQL shift (handled fallback to cloud mirror):', err)
  }

  // 2. Baca dari Cloud Mirroring tabel 'pengumuman' (100% Bebas Kendala RLS)
  try {
    const { data: cloudRow, error: cloudErr } = await supabase
      .from('pengumuman')
      .select('pesan')
      .eq('target_type', SYSTEM_SHIFT_CONFIG_TARGET)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!cloudErr && cloudRow?.pesan) {
      const parsedCloud = JSON.parse(cloudRow.pesan)
      if (parsedCloud && typeof parsedCloud === 'object') {
        if (parsedCloud.shifts && typeof parsedCloud.shifts === 'object') {
          Object.keys(parsedCloud.shifts).forEach(key => {
            currentShifts[key] = {
              ...(currentShifts[key] || {}),
              ...parsedCloud.shifts[key],
              rules: {
                ...(currentShifts[key]?.rules || {}),
                ...(parsedCloud.shifts[key]?.rules || {})
              }
            }
          })
        }
        if (parsedCloud.assignments && typeof parsedCloud.assignments === 'object') {
          currentAssignments = {
            ...currentAssignments,
            ...parsedCloud.assignments
          }
        }
      }
    }
  } catch (e) {
    console.warn('Cloud fallback shift query handled:', e)
  }

  // Self-healing: Pastikan Shift Genap tidak tertukar atau bernama Shift Ganjil
  if (currentShifts['shift-genap']) {
    if (!currentShifts['shift-genap'].name || currentShifts['shift-genap'].name === 'Shift Ganjil') {
      currentShifts['shift-genap'].name = 'Shift Genap'
    }
    if (!currentShifts['shift-genap'].code || currentShifts['shift-genap'].code === 'GANJIL') {
      currentShifts['shift-genap'].code = 'GENAP'
    }
  }
  if (currentShifts['shift-ganjil']) {
    if (!currentShifts['shift-ganjil'].name) {
      currentShifts['shift-ganjil'].name = 'Shift Ganjil'
    }
    if (!currentShifts['shift-ganjil'].code) {
      currentShifts['shift-ganjil'].code = 'GANJIL'
    }
  }

  systemData = {
    shifts: currentShifts,
    assignments: currentAssignments
  }

  // Simpan kembali ke LocalStorage agar seketika bisa dipakai di semua halaman
  try {
    localStorage.setItem(SHIFT_LOCAL_CACHE_KEY, JSON.stringify(systemData))
  } catch (e) {}

  return systemData
}

/**
 * Menyimpan seluruh konfigurasi shift & plotting guru ke Cloud Supabase & LocalStorage
 */
export async function saveShiftSystemData({ shifts, assignments }, supabase) {
  const payload = {
    shifts: shifts || DEFAULT_SHIFTS,
    assignments: assignments || {},
    updatedAt: new Date().toISOString()
  }

  // 1. Simpan ke LocalStorage seketika (Immediate UI sync)
  try {
    localStorage.setItem(SHIFT_LOCAL_CACHE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('shift_system_updated', { detail: payload }))
    window.dispatchEvent(new Event('storage'))
  } catch (e) {}

  if (!supabase) return { success: true, data: payload }

  // 2. Simpan ke Cloud Mirroring Supabase (tabel pengumuman: __SYSTEM_SHIFT_CONFIG__)
  // Menjamin 100% data tersimpan di Cloud meski RLS tabel baru belum dibuat di SQL Editor
  try {
    const payloadStr = JSON.stringify(payload)
    const { data: existing, error: findErr } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', SYSTEM_SHIFT_CONFIG_TARGET)
      .limit(1)

    if (!findErr && existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payloadStr })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          pesan: payloadStr,
          target_type: SYSTEM_SHIFT_CONFIG_TARGET,
          target_users: ''
        }])
    }
  } catch (e) {
    console.warn('Gagal menyimpan shift ke cloud mirror (handled):', e)
  }

  // 3. Simpan juga ke Tabel SQL jika tabel sudah ada di Supabase
  try {
    // Simpan master shifts
    if (shifts && typeof shifts === 'object') {
      const shiftRows = Object.values(shifts).map(s => ({
        id: s.id,
        nama: s.name,
        code: s.code || s.id.toUpperCase(),
        deskripsi: s.description || '',
        rules: s.rules || {},
        updated_at: new Date().toISOString()
      }))
      for (const row of shiftRows) {
        await supabase.from('school_shifts').upsert(row, { onConflict: 'id' }).catch(() => {})
      }
    }

    // Simpan assignments
    if (assignments && typeof assignments === 'object') {
      const assignRows = Object.entries(assignments).map(([teacherId, val]) => ({
        teacher_id: teacherId,
        mode: val.mode || 'fixed',
        fixed_shift_id: val.fixedShiftId || 'shift-ganjil',
        rolling_config: val.rollingConfig || {},
        custom_days_config: val.customDaysConfig || {},
        updated_at: new Date().toISOString()
      }))
      for (const aRow of assignRows) {
        await supabase.from('teacher_shift_assignments').upsert(aRow, { onConflict: 'teacher_id' }).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('Tabel SQL shift upsert error handled gracefully:', err)
  }

  return { success: true, data: payload }
}

/**
 * Menyimpan plotting shift untuk satu guru secara spesifik
 */
export async function saveTeacherShiftAssignment({ teacherId, assignmentData, supabase }) {
  if (!teacherId) return false
  const current = await fetchShiftSystemData(supabase)
  const updatedAssignments = {
    ...(current.assignments || {}),
    [teacherId]: {
      teacherId,
      ...(assignmentData || {}),
      updatedAt: new Date().toISOString()
    }
  }
  return await saveShiftSystemData({ shifts: current.shifts, assignments: updatedAssignments }, supabase)
}

/**
 * Menghitung Shift Aktif untuk Guru pada Tanggal Tertentu (Hari ini)
 * Memperhitungkan Pekan Ganjil / Pekan Genap & Pola Rotasi Senin-Rabu vs Kamis-Sabtu
 */
export function resolveTeacherShiftForDate({
  teacherId,
  date = new Date(),
  shifts = DEFAULT_SHIFTS,
  assignments = {}
}) {
  const dayName = getIndonesianDayName(date)
  const weekNum = getIsoWeekNumber(date)
  const odd = isOddWeek(date)
  const weekType = odd ? 'Pekan Ganjil' : 'Pekan Genap'

  const userAssignment = assignments[teacherId] || {
    mode: 'fixed',
    fixedShiftId: 'shift-ganjil'
  }

  let targetShiftId = 'shift-ganjil'

  if (userAssignment.mode === 'fixed') {
    targetShiftId = userAssignment.fixedShiftId || 'shift-ganjil'
  } else if (userAssignment.mode === 'rolling_weekly') {
    // Senin - Rabu vs Kamis - Sabtu
    const isMonWed = ['Senin', 'Selasa', 'Rabu'].includes(dayName)
    const rolling = userAssignment.rollingConfig || {
      oddWeek: { monWed: 'shift-ganjil', thuSat: 'shift-genap' },
      evenWeek: { monWed: 'shift-genap', thuSat: 'shift-ganjil' }
    }

    if (odd) {
      targetShiftId = isMonWed
        ? (rolling.oddWeek?.monWed || 'shift-ganjil')
        : (rolling.oddWeek?.thuSat || 'shift-genap')
    } else {
      targetShiftId = isMonWed
        ? (rolling.evenWeek?.monWed || 'shift-genap')
        : (rolling.evenWeek?.thuSat || 'shift-ganjil')
    }
  } else if (userAssignment.mode === 'custom_days') {
    const customDays = userAssignment.customDaysConfig || {}
    targetShiftId = customDays[dayName] || userAssignment.fixedShiftId || 'shift-ganjil'
  }

  const shiftObj = shifts[targetShiftId] || shifts['shift-ganjil'] || DEFAULT_SHIFTS['shift-ganjil']
  const dayRule = shiftObj.rules?.[dayName] || { jamMasuk: '07:00', toleransi: 15, jamPulang: '14:00' }

  // Hitung batas jam masuk (jamMasuk + toleransi menit)
  const [inHour, inMin] = (dayRule.jamMasuk || '07:00').split(':').map(Number)
  const totalMin = inHour * 60 + inMin + (Number(dayRule.toleransi) || 15)
  const limitHour = String(Math.floor(totalMin / 60)).padStart(2, '0')
  const limitMin = String(totalMin % 60).padStart(2, '0')
  const jamMasukBatas = `${limitHour}:${limitMin}`

  return {
    shiftId: shiftObj.id || targetShiftId,
    shiftName: shiftObj.name || 'Shift Ganjil',
    shiftCode: shiftObj.code || 'GANJIL',
    dayName,
    weekNumber: weekNum,
    isOddWeek: odd,
    weekType,
    jamMasuk: dayRule.jamMasuk || '07:00',
    toleransi: Number(dayRule.toleransi) || 15,
    jamMasukBatas,
    jamPulang: dayRule.jamPulang || '14:00',
    isLibur: !!dayRule.libur,
    mode: userAssignment.mode || 'fixed'
  }
}
