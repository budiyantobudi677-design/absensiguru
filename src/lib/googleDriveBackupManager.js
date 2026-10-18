import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import {
  exportSuratTugasDocx,
  exportSuratRekomendasiDocx,
  exportSuratPindahDocx,
  exportSppdDocx
} from './persuratanDocx'
import { DEFAULT_KOP_DATA } from './persuratanGenerator'

export const GDRIVE_CONFIG_KEY = 'panrita_gdrive_config'
export const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

/**
 * Konfigurasi default Google Drive Backup
 */
export const DEFAULT_GDRIVE_CONFIG = {
  clientId: '185061686206-fmppn34daf8sifnsfhi5u2dksqntah27.apps.googleusercontent.com',
  accessToken: '',
  tokenExpiresAt: 0,
  userEmail: '',
  userName: '',
  userAvatar: '',
  frequency: '24h', // '24h' | '48h' | 'weekly' | 'manual'
  lastBackupAt: null,
  lastBackupStatus: null, // 'success' | 'failed'
  lastBackupSummary: '',
  rootFolderId: '',
  rootFolderUrl: '',
  autoBackupEnabled: true
}

/**
 * Mengambil konfigurasi dari localStorage
 */
export function getGDriveConfig() {
  try {
    const raw = localStorage.getItem(GDRIVE_CONFIG_KEY)
    if (!raw) return { ...DEFAULT_GDRIVE_CONFIG }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_GDRIVE_CONFIG, ...parsed }
  } catch (e) {
    console.error('Error parsing gdrive config:', e)
    return { ...DEFAULT_GDRIVE_CONFIG }
  }
}

/**
 * Menyimpan pembaruan konfigurasi ke localStorage
 */
export function saveGDriveConfig(updates) {
  try {
    const current = getGDriveConfig()
    const merged = { ...current, ...updates }
    localStorage.setItem(GDRIVE_CONFIG_KEY, JSON.stringify(merged))
    return merged
  } catch (e) {
    console.error('Error saving gdrive config:', e)
    return null
  }
}

/**
 * Memutuskan koneksi akun Google Drive
 */
export function disconnectGDrive() {
  const current = getGDriveConfig()
  const cleared = {
    ...current,
    accessToken: '',
    tokenExpiresAt: 0,
    userEmail: '',
    userName: '',
    userAvatar: '',
    rootFolderId: '',
    rootFolderUrl: ''
  }
  localStorage.setItem(GDRIVE_CONFIG_KEY, JSON.stringify(cleared))
  return cleared
}

/**
 * Memuat Google Identity Services (GIS) client script secara dinamis
 */
export function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      return resolve(true)
    }

    const existingScript = document.getElementById('gsi-client-script')
    if (existingScript) {
      existingScript.onload = () => resolve(true)
      existingScript.onerror = (e) => reject(new Error('Gagal memuat Google Identity Services script.'))
      return
    }

    const script = document.createElement('script')
    script.id = 'gsi-client-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Koneksi internet bermasalah saat memuat Google Identity Services.'))
    document.head.appendChild(script)
  })
}

/**
 * Memvalidasi format Google OAuth Client ID
 */
export function validateGoogleClientId(clientId) {
  if (!clientId || !clientId.trim()) {
    return { valid: false, error: 'Google OAuth Client ID belum diisi.' }
  }
  const val = clientId.trim()
  if (val.startsWith('AIzaSy')) {
    return {
      valid: false,
      error: 'Nilai yang Anda masukkan adalah Google API Key (seperti kunci Gemini AI), BUKAN OAuth Client ID. OAuth Client ID berakhiran .apps.googleusercontent.com.'
    }
  }
  if (val.includes('@')) {
    return {
      valid: false,
      error: 'Nilai yang Anda masukkan adalah alamat email. Yang dibutuhkan adalah OAuth Client ID resmi dari Google Cloud Console.'
    }
  }
  if (!val.includes('.apps.googleusercontent.com')) {
    return {
      valid: false,
      error: 'Format tidak valid. Google OAuth Client ID resmi selalu berakhiran ".apps.googleusercontent.com" (Contoh: 123456789-xxxx.apps.googleusercontent.com).'
    }
  }
  if (!/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(val)) {
    return {
      valid: false,
      error: 'Format tidak sesuai pola Google. Pastikan diawali nomor proyek angka dan berakhiran .apps.googleusercontent.com.'
    }
  }
  return { valid: true }
}

/**
 * Melakukan otorisasi OAuth 2.0 untuk mendapatkan Access Token Google Drive
 */
export async function requestGDriveAccessToken(clientId) {
  const check = validateGoogleClientId(clientId)
  if (!check.valid) {
    throw new Error(check.error)
  }

  await loadGsiScript()

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: GDRIVE_SCOPE,
        callback: async (response) => {
          if (response.error) {
            reject(new Error(`Otorisasi Google Drive gagal: ${response.error_description || response.error}`))
            return
          }

          const accessToken = response.access_token
          const expiresIn = response.expires_in || 3600
          const tokenExpiresAt = Date.now() + expiresIn * 1000

          let userEmail = ''
          let userName = ''
          let userAvatar = ''

          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            })
            if (userInfoRes.ok) {
              const uInfo = await userInfoRes.json()
              userEmail = uInfo.email || ''
              userName = uInfo.name || ''
              userAvatar = uInfo.picture || ''
            }
          } catch (e) {
            console.warn('Gagal mengambil info user Google:', e)
          }

          const updated = saveGDriveConfig({
            clientId: clientId.trim(),
            accessToken,
            tokenExpiresAt,
            userEmail,
            userName,
            userAvatar
          })

          resolve({
            accessToken,
            tokenExpiresAt,
            userEmail,
            userName,
            userAvatar,
            config: updated
          })
        }
      })

      // Minta izin token (akan menampilkan popup akun Google resmi)
      client.requestAccessToken({ prompt: 'consent' })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Mencari atau membuat folder di Google Drive
 */
export async function findOrCreateFolder(accessToken, folderName, parentFolderId = null) {
  const cleanName = folderName.replace(/'/g, "\\'")
  let q = `mimeType='application/vnd.google-apps.folder' and name='${cleanName}' and trashed=false`
  if (parentFolderId) {
    q += ` and '${parentFolderId}' in parents`
  }

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    if (searchRes.ok) {
      const data = await searchRes.json()
      if (data.files && data.files.length > 0) {
        return data.files[0]
      }
    }

    // Jika tidak ditemukan, buat folder baru
    const createBody = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    }
    if (parentFolderId) {
      createBody.parents = [parentFolderId]
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createBody)
    })

    if (!createRes.ok) {
      const err = await createRes.json()
      throw new Error(`Gagal membuat folder Google Drive [${folderName}]: ${err.error?.message || createRes.statusText}`)
    }

    return await createRes.json()
  } catch (e) {
    throw new Error(`Operasi folder Google Drive gagal: ${e.message}`)
  }
}

/**
 * Mengunggah file ke Google Drive menggunakan Multipart Upload
 */
export async function uploadFileToFolder(accessToken, parentFolderId, fileName, mimeType, fileBlob) {
  const boundary = '-------PanritaEduBoundary' + Math.random().toString(36).substring(2)
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelim = `\r\n--${boundary}--`

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    ...(parentFolderId ? { parents: [parentFolderId] } : {})
  }

  const multipartBody = new Blob(
    [
      delimiter,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      delimiter,
      `Content-Type: ${mimeType}\r\n\r\n`,
      fileBlob,
      closeDelim
    ],
    { type: `multipart/related; boundary=${boundary}` }
  )

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  )

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(`Gagal mengunggah file ${fileName}: ${errData.error?.message || res.statusText}`)
  }

  return await res.json()
}

/**
 * 1. PENGHASIL DOKUMEN: Data Siswa & Kelas (.xlsx)
 */
export async function generateStudentsWorkbook(supabase) {
  const [{ data: classesData }, { data: studentsData }, { data: profilesData }] = await Promise.all([
    supabase.from('classes').select('*').order('name'),
    supabase.from('students').select('*').order('name'),
    supabase.from('profiles').select('*')
  ])

  const classes = classesData || []
  const students = studentsData || []
  const profiles = profilesData || []

  const profileMap = {}
  profiles.forEach(p => {
    profileMap[p.id] = p.full_name || p.email
  })

  const classMap = {}
  classes.forEach(c => {
    classMap[c.id] = {
      name: c.name,
      teacher: profileMap[c.teacher_id] || '-'
    }
  })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Semua Siswa
  const allRows = [
    ['REKAP LENGKAP DATA SISWA'],
    [`Dicadangkan pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['No', 'NISN', 'Nama Lengkap Siswa', 'Jenis Kelamin', 'Kelas', 'Wali Kelas']
  ]

  students.forEach((s, idx) => {
    const cInfo = classMap[s.class_id] || { name: '-', teacher: '-' }
    allRows.push([
      idx + 1,
      s.nisn || '-',
      s.name,
      s.gender === 'L' ? 'Laki-laki' : (s.gender === 'P' ? 'Perempuan' : (s.gender || '-')),
      cInfo.name,
      cInfo.teacher
    ])
  })

  const wsAll = XLSX.utils.aoa_to_sheet(allRows)
  XLSX.utils.book_append_sheet(wb, wsAll, 'Semua_Siswa')

  // Sheet 2: Per Kelas
  classes.forEach(cls => {
    const clsStudents = students.filter(s => s.class_id === cls.id)
    const clsRows = [
      [`DAFTAR SISWA KELAS ${cls.name.toUpperCase()}`],
      [`Wali Kelas: ${profileMap[cls.teacher_id] || '-'}`],
      [`Jumlah Siswa: ${clsStudents.length} Orang`],
      [],
      ['No', 'NISN', 'Nama Lengkap Siswa', 'Jenis Kelamin']
    ]

    clsStudents.forEach((cs, i) => {
      clsRows.push([
        i + 1,
        cs.nisn || '-',
        cs.name,
        cs.gender === 'L' ? 'Laki-laki' : (cs.gender === 'P' ? 'Perempuan' : (cs.gender || '-'))
      ])
    })

    const cleanSheetName = `Kelas_${cls.name.replace(/[^a-zA-Z0-9]/g, '_')}`.slice(0, 31)
    const wsCls = XLSX.utils.aoa_to_sheet(clsRows)
    XLSX.utils.book_append_sheet(wb, wsCls, cleanSheetName)
  })

  // Sheet 3: Ringkasan Kelas
  const classSummaryRows = [
    ['DAFTAR ROMBONGAN BELAJAR & WALI KELAS'],
    [],
    ['No', 'Nama Kelas', 'Wali Kelas', 'Total Siswa']
  ]

  classes.forEach((c, idx) => {
    const totalInCls = students.filter(s => s.class_id === c.id).length
    classSummaryRows.push([
      idx + 1,
      c.name,
      profileMap[c.teacher_id] || '-',
      totalInCls
    ])
  })

  const wsSummary = XLSX.utils.aoa_to_sheet(classSummaryRows)
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Daftar_Kelas')

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * 2. PENGHASIL DOKUMEN: Nilai & Legger Akademik (.xlsx)
 */
export async function generateGradesWorkbook(supabase) {
  const [{ data: gradesData }, { data: studentsData }, { data: classesData }] = await Promise.all([
    supabase.from('student_grades').select('*').limit(5000),
    supabase.from('students').select('*'),
    supabase.from('classes').select('*')
  ])

  const grades = gradesData || []
  const students = studentsData || []
  const classes = classesData || []

  const studentMap = {}
  students.forEach(s => { studentMap[s.id] = s })

  const classMap = {}
  classes.forEach(c => { classMap[c.id] = c.name })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Rincian Seluruh Nilai
  const rawRows = [
    ['DATA LENGKAP NILAI SISWA (TP, STS, SAS)'],
    [`Dicadangkan pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Mata Pelajaran', 'Semester', 'Tahun Ajaran', 'Tipe Penilaian', 'Nomor', 'Nilai']
  ]

  grades.forEach((g, idx) => {
    const st = studentMap[g.student_id]
    rawRows.push([
      idx + 1,
      st?.nisn || '-',
      st?.name || 'Siswa tidak ditemukan',
      classMap[g.class_id] || '-',
      g.mata_pelajaran || '-',
      (g.semester || '-').toUpperCase(),
      g.tahun_ajaran || '-',
      (g.tipe_penilaian || '-').toUpperCase(),
      g.nomor_penilaian || 1,
      Number(g.nilai) || 0
    ])
  })

  const wsRaw = XLSX.utils.aoa_to_sheet(rawRows)
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Rincian_Nilai')

  // Sheet 2: Legger Rata-Rata per Siswa per Mapel
  const studentSubjectAverages = {}
  grades.forEach(g => {
    const key = `${g.student_id}_${g.mata_pelajaran}`
    if (!studentSubjectAverages[key]) {
      studentSubjectAverages[key] = {
        studentId: g.student_id,
        mapel: g.mata_pelajaran,
        total: 0,
        count: 0
      }
    }
    studentSubjectAverages[key].total += Number(g.nilai) || 0
    studentSubjectAverages[key].count += 1
  })

  const leggerRows = [
    ['LEGGER RATA-RATA NILAI SISWA'],
    [],
    ['No', 'NISN', 'Nama Siswa', 'Kelas', 'Mata Pelajaran', 'Jumlah Nilai', 'Rata-Rata Akhir']
  ]

  let lIdx = 1
  Object.values(studentSubjectAverages).forEach(item => {
    const st = studentMap[item.studentId]
    const avg = item.count > 0 ? (item.total / item.count).toFixed(2) : '0'
    leggerRows.push([
      lIdx++,
      st?.nisn || '-',
      st?.name || '-',
      classMap[st?.class_id] || '-',
      item.mapel,
      item.count,
      avg
    ])
  })

  const wsLegger = XLSX.utils.aoa_to_sheet(leggerRows)
  XLSX.utils.book_append_sheet(wb, wsLegger, 'Legger_Rata_Rata')

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * 3. PENGHASIL DOKUMEN: Rekap Presensi Siswa & Pegawai (.xlsx)
 */
export async function generateAttendanceWorkbook(supabase) {
  const [
    { data: studentAttData },
    { data: employeeAttData },
    { data: studentsData },
    { data: classesData },
    { data: profilesData }
  ] = await Promise.all([
    supabase.from('student_attendance').select('*').order('tanggal', { ascending: false }).limit(3000),
    supabase.from('absensi').select('*').order('tanggal', { ascending: false }).limit(3000),
    supabase.from('students').select('*'),
    supabase.from('classes').select('*'),
    supabase.from('profiles').select('*')
  ])

  const studentAtt = studentAttData || []
  const employeeAtt = employeeAttData || []
  const students = studentsData || []
  const classes = classesData || []
  const profiles = profilesData || []

  const studentMap = {}
  students.forEach(s => { studentMap[s.id] = s })

  const classMap = {}
  classes.forEach(c => { classMap[c.id] = c.name })

  const profileMap = {}
  profiles.forEach(p => { profileMap[p.id] = p })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Presensi Siswa
  const studentRows = [
    ['REKAPITULASI PRESENSI HARIAN SISWA'],
    [`Dicadangkan pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['No', 'Tanggal', 'NISN', 'Nama Siswa', 'Kelas', 'Status Kehadiran', 'Keterangan']
  ]

  studentAtt.forEach((sa, idx) => {
    const st = studentMap[sa.student_id]
    studentRows.push([
      idx + 1,
      sa.tanggal || '-',
      st?.nisn || '-',
      st?.name || '-',
      classMap[sa.class_id] || '-',
      (sa.status || '-').toUpperCase(),
      sa.keterangan || '-'
    ])
  })

  const wsStudent = XLSX.utils.aoa_to_sheet(studentRows)
  XLSX.utils.book_append_sheet(wb, wsStudent, 'Presensi_Siswa')

  // Sheet 2: Presensi Guru & Pegawai
  const empRows = [
    ['REKAPITULASI PRESENSI GURU & TENAGA KEPENDIDIKAN'],
    [`Dicadangkan pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    ['No', 'Tanggal', 'Nama Pegawai', 'NIP', 'Jabatan', 'Status', 'Waktu Masuk', 'Waktu Pulang', 'Keterangan', 'Lokasi Masuk', 'Lokasi Pulang']
  ]

  employeeAtt.forEach((ea, idx) => {
    const pr = profileMap[ea.user_id]
    empRows.push([
      idx + 1,
      ea.tanggal || '-',
      pr?.full_name || pr?.email || '-',
      pr?.nip || '-',
      pr?.jabatan || pr?.role || '-',
      (ea.status || 'hadir').toUpperCase(),
      ea.waktu_masuk ? new Date(ea.waktu_masuk).toLocaleTimeString('id-ID') : '-',
      ea.waktu_pulang ? new Date(ea.waktu_pulang).toLocaleTimeString('id-ID') : '-',
      ea.keterangan || '-',
      ea.lokasi_masuk || '-',
      ea.lokasi_pulang || '-'
    ])
  })

  const wsEmp = XLSX.utils.aoa_to_sheet(empRows)
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Presensi_Pegawai')

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * 4. PENGHASIL DOKUMEN: Arsip Persuratan Resmi (DOCX & Kop JSON)
 */
export async function generatePersuratanFiles() {
  let kopData = DEFAULT_KOP_DATA
  try {
    const savedKop = localStorage.getItem('panrita_kop_surat')
    if (savedKop) kopData = JSON.parse(savedKop)
  } catch (e) {
    console.warn('Gagal membaca kop surat lokal:', e)
  }

  const files = []

  // Kop Surat JSON
  const kopJsonBlob = new Blob([JSON.stringify(kopData, null, 2)], { type: 'application/json' })
  files.push({
    fileName: 'Kop_Surat_Resmi_Sekolah.json',
    mimeType: 'application/json',
    blob: kopJsonBlob
  })

  // Template DOCX Surat Tugas
  try {
    const suratTugasBlob = await exportSuratTugasDocx(null, kopData, 'Surat_Tugas_Template', true)
    files.push({
      fileName: 'Template_Surat_Tugas_Resmi.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      blob: suratTugasBlob
    })
  } catch (e) {
    console.warn('Gagal render Surat Tugas DOCX:', e)
  }

  // Template DOCX Surat Rekomendasi
  try {
    const suratRekomendasiBlob = await exportSuratRekomendasiDocx(null, kopData, 'Surat_Rekomendasi_Template', true)
    files.push({
      fileName: 'Template_Surat_Rekomendasi_Menerima.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      blob: suratRekomendasiBlob
    })
  } catch (e) {
    console.warn('Gagal render Surat Rekomendasi DOCX:', e)
  }

  // Template DOCX Surat Pindah
  try {
    const suratPindahBlob = await exportSuratPindahDocx(null, kopData, 'Surat_Pindah_Template', true)
    files.push({
      fileName: 'Template_Surat_Pindah_Sekolah.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      blob: suratPindahBlob
    })
  } catch (e) {
    console.warn('Gagal render Surat Pindah DOCX:', e)
  }

  // Template DOCX SPPD
  try {
    const sppdBlob = await exportSppdDocx(null, kopData, 'SPPD_Template', true)
    files.push({
      fileName: 'Template_SPPD_Perjalanan_Dinas.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      blob: sppdBlob
    })
  } catch (e) {
    console.warn('Gagal render SPPD DOCX:', e)
  }

  return files
}

/**
 * Helper aman untuk query tabel supabase tanpa error
 */
async function safeFetchTable(supabase, tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*')
    if (error) {
      console.warn(`Peringatan membaca tabel ${tableName}:`, error.message)
      return []
    }
    return data || []
  } catch (err) {
    console.warn(`Gagal membaca tabel ${tableName}:`, err)
    return []
  }
}

/**
 * 5. PENGHASIL DOKUMEN: Snapshot Database Darurat (JSON Pemulihan Sistem)
 */
export async function generateDatabaseSnapshotJson(supabase) {
  const [
    schoolSettings,
    settings,
    profiles,
    classes,
    students,
    studentGrades,
    studentAtt,
    employeeAtt,
    journals,
    behaviorNotes,
    holidays
  ] = await Promise.all([
    safeFetchTable(supabase, 'school_settings'),
    safeFetchTable(supabase, 'settings'),
    safeFetchTable(supabase, 'profiles'),
    safeFetchTable(supabase, 'classes'),
    safeFetchTable(supabase, 'students'),
    safeFetchTable(supabase, 'student_grades'),
    safeFetchTable(supabase, 'student_attendance'),
    safeFetchTable(supabase, 'absensi'),
    safeFetchTable(supabase, 'learning_journals'),
    safeFetchTable(supabase, 'student_behavior_notes'),
    safeFetchTable(supabase, 'hari_libur')
  ])

  // Ambil local storage snapshot jika ada
  let localAssignments = null
  let localKop = null
  try {
    localAssignments = localStorage.getItem('panrita_cloud_assignments')
    localKop = localStorage.getItem('panrita_kop_surat')
  } catch (e) {
    // ignore
  }

  const dump = {
    appName: 'PanritaEdu / GammaraApp',
    snapshotCreatedAt: new Date().toISOString(),
    schoolName: schoolSettings?.[0]?.school_name || settings?.[0]?.school_name || 'Sekolah',
    schemaVersion: '2.0-kbm-terpadu',
    database: {
      school_settings: schoolSettings || [],
      settings: settings || [],
      profiles: profiles || [],
      classes: classes || [],
      students: students || [],
      student_grades: studentGrades || [],
      student_attendance: studentAtt || [],
      absensi: employeeAtt || [],
      learning_journals: journals || [],
      student_behavior_notes: behaviorNotes || [],
      hari_libur: holidays || []
    },
    localConfig: {
      panrita_kop_surat: localKop ? JSON.parse(localKop) : null,
      panrita_cloud_assignments: localAssignments ? JSON.parse(localAssignments) : null
    }
  }

  const jsonString = JSON.stringify(dump, null, 2)
  return new Blob([jsonString], { type: 'application/json' })
}

/**
 * Menjalankan Full Backup ke Google Drive
 */
export async function runFullBackupToDrive({ supabase, onProgress = () => {}, silent = false }) {
  const config = getGDriveConfig()

  if (!config.accessToken) {
    throw new Error('Google Drive belum terhubung. Silakan hubungkan akun Google Drive terlebih dahulu.')
  }

  // Cek masa berlaku token (buffer 1 menit)
  if (config.tokenExpiresAt && Date.now() > config.tokenExpiresAt - 60000) {
    throw new Error('Sesi Google Drive telah kedaluwarsa. Silakan klik "Hubungkan Ulang Google Drive".')
  }

  const accessToken = config.accessToken

  try {
    // 0. Ambil nama sekolah untuk nama folder
    const { data: sSet } = await supabase.from('school_settings').select('school_name').limit(1)
    const schoolName = sSet?.[0]?.school_name || 'PanritaEdu'
    const cleanSchoolName = schoolName.replace(/[/\\?%*:|"<>]/g, '_')

    const dateStamp = new Date().toISOString().slice(0, 10)
    const timeStamp = new Date().toTimeString().slice(0, 5).replace(':', '-')
    const stamp = `${dateStamp}_${timeStamp}`

    // 1. Root Folder
    onProgress({ step: 1, total: 6, message: 'Menyiapkan folder utama di Google Drive...' })
    const rootFolder = await findOrCreateFolder(accessToken, `PanritaEdu - Backup ${cleanSchoolName}`)
    const rootFolderId = rootFolder.id
    const rootFolderUrl = rootFolder.webViewLink || `https://drive.google.com/drive/folders/${rootFolderId}`

    saveGDriveConfig({ rootFolderId, rootFolderUrl })

    // 2. Subfolder Struktur
    const sub01 = await findOrCreateFolder(accessToken, '01_Data_Siswa_dan_Kelas', rootFolderId)
    const sub02 = await findOrCreateFolder(accessToken, '02_Nilai_dan_Legger_Akademik', rootFolderId)
    const sub03 = await findOrCreateFolder(accessToken, '03_Rekap_Presensi_dan_Kehadiran', rootFolderId)
    const sub04 = await findOrCreateFolder(accessToken, '04_Arsip_Persuratan_Resmi', rootFolderId)
    const sub05 = await findOrCreateFolder(accessToken, '05_Snapshot_Database_Darurat', rootFolderId)

    const uploadedFiles = []

    // 3. Upload Data Siswa & Kelas
    onProgress({ step: 2, total: 6, message: 'Membuat & mengunggah Data Siswa & Rombel (.xlsx)...' })
    const studentsBlob = await generateStudentsWorkbook(supabase)
    const upStudents = await uploadFileToFolder(
      accessToken,
      sub01.id,
      `Data_Siswa_dan_Kelas_${cleanSchoolName}_${stamp}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      studentsBlob
    )
    uploadedFiles.push(upStudents)

    // 4. Upload Nilai & Legger
    onProgress({ step: 3, total: 6, message: 'Membuat & mengunggah Legger & Nilai Siswa (.xlsx)...' })
    const gradesBlob = await generateGradesWorkbook(supabase)
    const upGrades = await uploadFileToFolder(
      accessToken,
      sub02.id,
      `Legger_Nilai_Siswa_${cleanSchoolName}_${stamp}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      gradesBlob
    )
    uploadedFiles.push(upGrades)

    // 5. Upload Rekap Presensi
    onProgress({ step: 4, total: 6, message: 'Membuat & mengunggah Rekap Presensi Siswa & Pegawai (.xlsx)...' })
    const attBlob = await generateAttendanceWorkbook(supabase)
    const upAtt = await uploadFileToFolder(
      accessToken,
      sub03.id,
      `Rekap_Presensi_Siswa_dan_Pegawai_${cleanSchoolName}_${stamp}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      attBlob
    )
    uploadedFiles.push(upAtt)

    // 6. Upload Arsip Persuratan Resmi (DOCX + Kop JSON)
    onProgress({ step: 5, total: 6, message: 'Membuat & mengunggah Arsip Persuratan Resmi (.docx)...' })
    const persuratanFiles = await generatePersuratanFiles()
    for (const pf of persuratanFiles) {
      const upPf = await uploadFileToFolder(
        accessToken,
        sub04.id,
        `${pf.fileName.replace(/\.([a-z]+)$/i, '')}_${stamp}.${pf.fileName.split('.').pop()}`,
        pf.mimeType,
        pf.blob
      )
      uploadedFiles.push(upPf)
    }

    // 7. Upload Snapshot Database JSON
    onProgress({ step: 6, total: 6, message: 'Membuat & mengunggah Snapshot Database Darurat (.json)...' })
    const dbBlob = await generateDatabaseSnapshotJson(supabase)
    const upDb = await uploadFileToFolder(
      accessToken,
      sub05.id,
      `Snapshot_Database_PanritaEdu_${cleanSchoolName}_${stamp}.json`,
      'application/json',
      dbBlob
    )
    uploadedFiles.push(upDb)

    const summary = `${uploadedFiles.length} file berhasil dicadangkan ke Google Drive`
    saveGDriveConfig({
      lastBackupAt: new Date().toISOString(),
      lastBackupStatus: 'success',
      lastBackupSummary: summary,
      rootFolderId,
      rootFolderUrl
    })

    return {
      success: true,
      rootFolderUrl,
      filesUploaded: uploadedFiles,
      summary
    }
  } catch (err) {
    saveGDriveConfig({
      lastBackupStatus: 'failed',
      lastBackupSummary: `Gagal: ${err.message}`
    })
    throw err
  }
}

/**
 * Unduh Langsung Seluruh Paket Cadangan secara Offline (Direct Download ke PC / HP)
 */
export async function downloadDirectBackupBundle(supabase, onProgress = () => {}) {
  const dateStamp = new Date().toISOString().slice(0, 10)
  const timeStamp = new Date().toTimeString().slice(0, 5).replace(':', '-')
  const stamp = `${dateStamp}_${timeStamp}`

  const { data: sSet } = await supabase.from('school_settings').select('school_name').limit(1)
  const schoolName = (sSet?.[0]?.school_name || 'Sekolah').replace(/[/\\?%*:|"<>]/g, '_')

  onProgress('Menyiapkan berkas Data Siswa & Kelas...')
  const studentsBlob = await generateStudentsWorkbook(supabase)
  saveAs(studentsBlob, `01_Data_Siswa_dan_Kelas_${schoolName}_${stamp}.xlsx`)

  onProgress('Menyiapkan berkas Legger & Nilai...')
  const gradesBlob = await generateGradesWorkbook(supabase)
  saveAs(gradesBlob, `02_Nilai_dan_Legger_${schoolName}_${stamp}.xlsx`)

  onProgress('Menyiapkan berkas Presensi...')
  const attBlob = await generateAttendanceWorkbook(supabase)
  saveAs(attBlob, `03_Rekap_Presensi_Lengkap_${schoolName}_${stamp}.xlsx`)

  onProgress('Menyiapkan berkas Snapshot Database...')
  const dbBlob = await generateDatabaseSnapshotJson(supabase)
  saveAs(dbBlob, `05_Snapshot_Database_PanritaEdu_${schoolName}_${stamp}.json`)

  onProgress('Selesai! Berkas telah tersimpan di perangkat Anda.')
  return true
}

/**
 * Memeriksa jadwal pencadangan otomatis (Auto Backup Scheduler)
 * Dipanggil saat admin / kepsek membuka dashboard.
 */
export async function checkAutoBackupSchedule(supabase) {
  try {
    const config = getGDriveConfig()

    // Jika belum login Google Drive atau mode manual, lewati
    if (!config.accessToken || !config.autoBackupEnabled || config.frequency === 'manual') {
      return { triggered: false, reason: 'not_configured_or_manual' }
    }

    // Jika token sudah kedaluwarsa, tidak bisa silent backup
    if (config.tokenExpiresAt && Date.now() > config.tokenExpiresAt) {
      console.warn('Google Drive token expired, skipping auto backup.')
      return { triggered: false, reason: 'token_expired' }
    }

    const intervals = {
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000
    }

    const intervalMs = intervals[config.frequency] || intervals['24h']
    const lastBackupTime = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0
    const now = Date.now()

    if (now - lastBackupTime >= intervalMs) {
      console.log(`[GoogleDriveBackup] Waktunya pencadangan otomatis (${config.frequency}). Menjalankan di latar belakang...`)
      const res = await runFullBackupToDrive({ supabase, silent: true })
      return { triggered: true, result: res }
    }

    return { triggered: false, reason: 'not_due_yet' }
  } catch (err) {
    console.warn('[GoogleDriveBackup] Auto backup check error:', err)
    return { triggered: false, error: err.message }
  }
}
