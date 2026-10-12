// ==============================================================================
// SERVICE GOOGLE GEMINI AI - ABSENSI GURU & KBM
// Auto-Fallback Model: Gemini 3.8 Flash -> Gemini 2.0 Flash -> Gemini 1.5 Flash
// ==============================================================================

import { Preferences } from '@capacitor/preferences'

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
]

// Memory cache untuk akses instan antar komponen
let inMemoryGeminiKey = ''

/**
 * Mengambil API Key yang tersimpan secara sinkronus (untuk pemanggilan instan)
 */
export function getSavedGeminiKey(userId, userObj = null, profileObj = null) {
  if (inMemoryGeminiKey && inMemoryGeminiKey.trim()) {
    return inMemoryGeminiKey.trim()
  }

  // 1. Cek user metadata jika tersedia
  if (userObj?.user_metadata?.gemini_api_key) {
    const key = String(userObj.user_metadata.gemini_api_key).trim()
    if (key) {
      inMemoryGeminiKey = key
      return key
    }
  }

  // 2. Cek profile kolom jika tersedia
  if (profileObj?.gemini_api_key) {
    const key = String(profileObj.gemini_api_key).trim()
    if (key) {
      inMemoryGeminiKey = key
      return key
    }
  }

  // 3. Cek per-user localStorage
  if (userId) {
    try {
      const userKey = localStorage.getItem(`gemini_api_key_${userId}`)
      if (userKey && userKey.trim()) {
        inMemoryGeminiKey = userKey.trim()
        return inMemoryGeminiKey
      }
    } catch {}
  }

  // 4. Cek global localStorage
  try {
    const globalKey = localStorage.getItem('gemini_api_key')
    if (globalKey && globalKey.trim()) {
      inMemoryGeminiKey = globalKey.trim()
      return inMemoryGeminiKey
    }
  } catch {}

  // 5. Cek developer session jika sedang mode pengembang
  try {
    const devSession = localStorage.getItem('panrita_developer_session')
    if (devSession) {
      const parsed = JSON.parse(devSession)
      if (parsed?.gemini_api_key && String(parsed.gemini_api_key).trim()) {
        inMemoryGeminiKey = String(parsed.gemini_api_key).trim()
        return inMemoryGeminiKey
      }
    }
  } catch {}

  const envKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  if (envKey) {
    inMemoryGeminiKey = envKey
    return envKey
  }

  return ''
}

/**
 * Mengambil API Key yang tersimpan secara asinkronus (mendukung Capacitor Preferences & Cloud)
 */
export async function loadSavedGeminiKeyAsync(userId, userObj = null, profileObj = null) {
  // 1. Cek sinkronus terlebih dahulu
  const syncKey = getSavedGeminiKey(userId, userObj, profileObj)
  if (syncKey) return syncKey

  // 2. Cek Capacitor Preferences per-user (Persistent di Android APK)
  if (userId) {
    try {
      const { value } = await Preferences.get({ key: `gemini_api_key_${userId}` })
      if (value && value.trim()) {
        const clean = value.trim()
        inMemoryGeminiKey = clean
        try { localStorage.setItem(`gemini_api_key_${userId}`, clean) } catch {}
        try { localStorage.setItem('gemini_api_key', clean) } catch {}
        return clean
      }
    } catch {}
  }

  // 3. Cek Capacitor Preferences global
  try {
    const { value } = await Preferences.get({ key: 'gemini_api_key' })
    if (value && value.trim()) {
      const clean = value.trim()
      inMemoryGeminiKey = clean
      try { localStorage.setItem('gemini_api_key', clean) } catch {}
      return clean
    }
  } catch {}

  return ''
}

/**
 * Menyimpan API Key untuk user aktif (Simpan ke Memory, LocalStorage, Capacitor Preferences, dan Cloud Supabase)
 */
export async function saveGeminiKey(apiKey, userId, supabaseClient = null) {
  const cleanKey = (apiKey || '').trim()
  inMemoryGeminiKey = cleanKey

  // 1. Simpan ke LocalStorage
  if (userId) {
    try { localStorage.setItem(`gemini_api_key_${userId}`, cleanKey) } catch {}
  }
  try { localStorage.setItem('gemini_api_key', cleanKey) } catch {}

  // 2. Simpan ke Capacitor Preferences (Native Android Persistence)
  if (userId) {
    try { await Preferences.set({ key: `gemini_api_key_${userId}`, value: cleanKey }) } catch {}
  }
  try { await Preferences.set({ key: 'gemini_api_key', value: cleanKey }) } catch {}

  // 3. Simpan ke Developer Session jika ada
  try {
    const devSession = localStorage.getItem('panrita_developer_session')
    if (devSession) {
      const parsed = JSON.parse(devSession)
      parsed.gemini_api_key = cleanKey
      localStorage.setItem('panrita_developer_session', JSON.stringify(parsed))
    }
  } catch {}

  // 4. Simpan ke Cloud Supabase (User Metadata Auth + Profiles table jika ada)
  if (supabaseClient) {
    try {
      // Simpan ke Supabase Auth user_metadata (paling aman & selalu berhasil tanpa migrasi tabel)
      await supabaseClient.auth.updateUser({
        data: { gemini_api_key: cleanKey }
      })
    } catch (e) {
      console.warn('[Gemini AI] Gagal update user_metadata auth:', e)
    }

    if (userId) {
      try {
        await supabaseClient.from('profiles').update({ gemini_api_key: cleanKey }).eq('id', userId)
      } catch (e) {
        // Kolom DB mungkin belum ada di tabel profiles
      }
    }
  }

  return cleanKey
}

/**
 * Mengubah file gambar ke base64 (tanpa prefix data:image/xxx;base64,)
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      const mimeType = file.type || 'image/jpeg'
      const base64Data = result.split(',')[1] || result
      resolve({ mimeType, base64Data })
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

/**
 * Helper untuk memanggil Gemini API dengan mekanisme Auto-Fallback
 */
async function callGeminiWithFallback({ apiKey, contents, systemInstruction = null, maxTokens = 4096, temperature = 0.2 }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API Key Gemini belum diatur. Silakan masukkan API Key Anda di menu Profil / Pengaturan Akun.')
  }

  const cleanKey = apiKey.trim()
  let lastError = null

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`[Gemini AI] Mencoba memanggil model: ${model}...`)
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`

      const bodyPayload = {
        contents,
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens,
        }
      }

      if (systemInstruction) {
        bodyPayload.systemInstruction = {
          parts: [{ text: systemInstruction }]
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData?.error?.message || `HTTP ${response.status} ${response.statusText}`
        const status = response.status

        console.warn(`[Gemini AI] Model ${model} gagal (${status}): ${errorMsg}`)

        // Jika kuota habis (429 / RESOURCE_EXHAUSTED) atau model not found (404), lanjutkan fallback ke model berikutnya
        if (status === 429 || status === 404 || status === 503 || errorMsg.includes('quota') || errorMsg.includes('not found')) {
          lastError = new Error(`Model ${model} tidak tersedia / kuota limit: ${errorMsg}`)
          continue
        }

        // Jika API Key tidak valid (400 atau 403 INVALID_ARGUMENT / API_KEY_INVALID), hentikan langsung
        if (status === 400 || status === 403 || errorMsg.toLowerCase().includes('api key')) {
          throw new Error(`API Key Gemini tidak valid atau belum diaktifkan: ${errorMsg}`)
        }

        lastError = new Error(`Gagal (${status}): ${errorMsg}`)
        continue
      }

      const data = await response.json()
      const candidate = data.candidates?.[0]
      const textOutput = candidate?.content?.parts?.map(p => p.text).join('') || ''

      if (!textOutput) {
        throw new Error('AI tidak mengembalikan teks jawaban.')
      }

      console.log(`[Gemini AI] Berhasil dengan model: ${model}`)
      return {
        text: textOutput,
        usedModel: model
      }
    } catch (err) {
      console.warn(`[Gemini AI] Error saat mencoba ${model}:`, err.message)
      lastError = err
      if (err.message.includes('API Key Gemini tidak valid')) {
        throw err
      }
    }
  }

  throw lastError || new Error('Semua model Gemini mengalami kendala atau kuota harian habis. Coba lagi nanti.')
}

/**
 * Membersihkan respons teks JSON dari markdown codeblocks
 */
function cleanJsonOutput(text) {
  let cleaned = text.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return cleaned.trim()
}

/**
 * Tes koneksi Gemini API Key
 */
export async function testGeminiConnection(apiKey) {
  const result = await callGeminiWithFallback({
    apiKey,
    contents: [
      {
        parts: [{ text: 'Halo, jawab dengan satu kata saja: "AKTIF"' }]
      }
    ]
  })
  return result
}

/**
 * FITUR 1: AI Ekstrak / Generate Jurnal KBM dari Teks atau Foto Modul Ajar
 */
export async function generateJurnalFromModul({ apiKey, text, imageBase64, imageMimeType, mataPelajaran, namaKelas }) {
  const promptInstruction = `
Kamu adalah asisten guru profesional Indonesia yang ahli dalam Kurikulum Merdeka dan penyusunan Jurnal Mengajar KBM.
Tugasmu adalah menganalisis dokumen/materi/modul ajar yang diberikan dan menyusun data Jurnal Mengajar secara lengkap, terstruktur, dan siap pakai.

Target Mapel: ${mataPelajaran || 'Sesuai dokumen'}
Target Kelas: ${namaKelas || 'Sesuai dokumen'}

Berikan keluaran HANYA dalam format JSON murni tanpa pembuka/penutup penjelasan lain:
{
  "topik": "Judul materi pokok / capaian pembelajaran ringkas dan jelas",
  "teknik": "Luring", // Pilihan: "Luring", "Daring", atau "Hybrid"
  "kegiatan": "Uraian kegiatan KBM yang rapi dengan pembagian:\\n1. Pendahuluan/Apersepsi (10 menit): ...\\n2. Kegiatan Inti (60 menit): ...\\n3. Penutup & Refleksi (10 menit): ...",
  "penilaian": "Teknik penilaian yang sesuai (misal: Asesmen formatif observasi keaktifan, unjuk kerja diskusi, atau tes tertulis singkat)",
  "catatan": "Catatan tindak lanjut singkat untuk siswa yang butuh bimbingan dan apresiasi kelas"
}
`

  const parts = []
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType || 'image/jpeg',
        data: imageBase64
      }
    })
  }
  
  const contentText = text && text.trim() 
    ? `Bahan / Rangkuman Modul Ajar:\n${text}\n\n${promptInstruction}`
    : `Silakan baca dokumen / foto modul ajar di atas.\n\n${promptInstruction}`

  parts.push({ text: contentText })

  const result = await callGeminiWithFallback({
    apiKey,
    contents: [{ parts }]
  })

  try {
    const jsonStr = cleanJsonOutput(result.text)
    const parsed = JSON.parse(jsonStr)
    return {
      data: parsed,
      usedModel: result.usedModel
    }
  } catch (err) {
    console.error('Gagal parse JSON Jurnal AI:', result.text)
    throw new Error('AI merespons tetapi format data tidak terbaca dengan benar. Silakan coba kembali.')
  }
}

/**
 * FITUR 2: AI Scan & Ekstrak Daftar Siswa dari Foto Dokumen / Absen Kertas
 */
export async function scanStudentsFromImage({ apiKey, imageBase64, imageMimeType }) {
  const promptInstruction = `
Kamu adalah asisten administrasi sekolah yang bertugas membaca dokumen/foto lembar daftar siswa atau absensi kertas secara akurat (OCR Dokumen Sekolah).
Tugasmu:
1. Ekstrak seluruh daftar nama siswa, NISN (jika ada), dan jenis kelamin (L atau P jika ada).
2. Bersihkan nomor urut atau coretan yang tidak relevan dari nama siswa.
3. Huruf kapital di awal kata untuk nama siswa (Title Case atau UPPPERCASE sesuai dokumen).
4. Jika NISN tidak ada atau buram, beri nilai string kosong "".
5. Jika jenis kelamin tidak diketahui, default ke "L".

Berikan keluaran HANYA dalam format JSON murni tanpa teks pengantar:
{
  "students": [
    {
      "name": "Nama Lengkap Siswa",
      "nisn": "0012345678",
      "gender": "L"
    }
  ]
}
`

  const parts = [
    {
      inlineData: {
        mimeType: imageMimeType || 'image/jpeg',
        data: imageBase64
      }
    },
    {
      text: promptInstruction
    }
  ]

  const result = await callGeminiWithFallback({
    apiKey,
    contents: [{ parts }]
  })

  try {
    const jsonStr = cleanJsonOutput(result.text)
    const parsed = JSON.parse(jsonStr)
    const studentsList = Array.isArray(parsed?.students) ? parsed.students : []
    return {
      students: studentsList,
      usedModel: result.usedModel
    }
  } catch (err) {
    console.error('Gagal parse JSON Siswa AI:', result.text)
    throw new Error('AI merespons tetapi gagal membaca susunan tabel siswa. Pastikan foto dokumen cukup terang dan terbaca jelas.')
  }
}

/**
 * FITUR 3: AI Pembuatan Modul Ajar / Rencana Pembelajaran Mendalam (RPM) Kurikulum Merdeka - Deep Learning
 * Mengikuti format standar dokumen RPM KELAS 5 BAHASA INDONESIA BAB 1
 */
export async function generateModulAjarAI({ apiKey, inputData }) {
  const {
    namaGuru = 'Budianto, S.Pd., Gr.',
    namaSekolah = 'UPTD SPF SD Inpres Tangkala II',
    tahunPelajaran = '2026/2027',
    semester = '1 (Satu)',
    mataPelajaran = 'Bahasa Indonesia',
    kelas = 'Kelas 5',
    fase = 'Fase C',
    topik = 'Bab 1: Aku yang Unik',
    elemen = 'Membaca dan Memirsa | Menulis dan Mempresentasikan',
    alokasiWaktu = '2 Pertemuan × 3 × 35 Menit',
    model = 'PBL (Problem Based Learning)',
    catatanTambahan = '',
    jumlahSesi = 2
  } = inputData || {}

  const promptInstruction = `
Kamu adalah pakar kurikulum dan pengembang kurikulum pendidikan dasar nasional di Indonesia.
Tugasmu adalah menyusun dokumen lengkap "RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA - DEEP LEARNING" 
yang berfokus pada 3 Prinsip Pembelajaran Mendalam: Berkesadaran (Mindful), Bermakna (Meaningful), dan Menggembirakan (Joyful).

Data Masukan:
- Penyusun: ${namaGuru}
- Satuan Pendidikan: ${namaSekolah}
- Tahun Pelajaran: ${tahunPelajaran}
- Semester: ${semester}
- Mata Pelajaran: ${mataPelajaran}
- Kelas / Fase: ${kelas} / ${fase}
- Topik / Materi Pokok: ${topik}
- Elemen: ${elemen}
- Alokasi Waktu: ${alokasiWaktu}
- Model Pembelajaran: ${model}
- Jumlah Pertemuan/Sesi Skenario: ${jumlahSesi} sesi
${catatanTambahan ? `- Catatan Khusus Guru: ${catatanTambahan}` : ''}

PANDUAN STRUKTUR DOKUMEN:
Kamu HARUS menghasilkan keluaran dalam format JSON MURNI yang valid dengan struktur persis seperti berikut:
{
  "judul": "RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA - DEEP LEARNING",
  "identifikasi": {
    "penyusun": "${namaGuru}",
    "sekolah": "${namaSekolah}",
    "tahunPelajaran": "${tahunPelajaran}",
    "semester": "${semester}",
    "mataPelajaran": "${mataPelajaran}",
    "kelasFase": "${kelas} / ${fase}",
    "topikElemen": "${topik} | ${elemen}",
    "alokasiWaktu": "${alokasiWaktu}",
    "pengetahuanAwal": ["Poin prasyarat pengetahuan 1", "Poin 2", "Poin 3", "Poin 4"],
    "minatBelajar": ["Poin minat siswa 1", "Poin minat siswa 2", "Poin 3"],
    "latarBelakang": "Uraian latar belakang perkembangan siswa dan relevansi topik materi dengan kehidupan nyata.",
    "kebutuhanBelajar": {
      "visual": "Kebutuhan visual (gambar, video, diagram)",
      "kinestetik": "Kebutuhan kinestetik (permainan peran, simulasi, membuat karya)",
      "audio": "Kebutuhan audio (cerita lisan, rekaman, dialog)",
      "pendampinganKhusus": "Bimbingan untuk siswa yang membutuhkan adaptasi khusus"
    }
  },
  "profilLulusan": [
    { "dimensi": "Komunikasi", "deskripsi": "Uraian bagaimana materi ini melatih komunikasi siswa" },
    { "dimensi": "Kreativitas", "deskripsi": "Uraian bagaimana materi ini mendorong kreativitas siswa" },
    { "dimensi": "Penalaran Kritis", "deskripsi": "Uraian bagaimana materi ini mengasah penalaran kritis siswa" },
    { "dimensi": "Kolaborasi", "deskripsi": "Uraian bagaimana siswa bekerja sama dan berdiskusi" }
  ],
  "desainPembelajaran": {
    "capaianPembelajaran": "Uraian Capaian Pembelajaran (CP) resmi untuk Fase ${fase} mata pelajaran ${mataPelajaran}.",
    "tujuanPembelajaran": [
      "TP 1: Peserta didik dapat ... (C3 – Memahami)",
      "TP 2: Peserta didik dapat ... (C4 – Menganalisis)",
      "TP 3: Peserta didik dapat ... (C6 – Mencipta)"
    ],
    "lintasDisiplinIlmu": [
      { "mapel": "Seni Budaya", "uraian": "Koneksi lintas materi visual/karya seni" },
      { "mapel": "PPKn", "uraian": "Koneksi nilai karakter/kebangsaan/kebhinekaan" },
      { "mapel": "IPS", "uraian": "Koneksi konteks sosial dan lingkungan sekitar" }
    ],
    "topikPembelajaran": [
      { "pertemuan": "Pertemuan 1", "subtopik": ["Subtopik 1", "Subtopik 2"] },
      { "pertemuan": "Pertemuan 2", "subtopik": ["Subtopik 3", "Subtopik 4"] }
    ],
    "praktikPedagogi": {
      "model": "${model} – 5 sintaks utama",
      "pendekatan": "Pembelajaran Mendalam / Deep Learning (Berkesadaran, Bermakna, Menggembirakan)",
      "metode": "Ceramah Interaktif, Diskusi Kelompok, Tanya Jawab, Penugasan Kreatif",
      "strategi": "Think-Pair-Share, Gallery Walk, Peer Review, Investigasi Mandiri"
    },
    "lingkunganBelajar": {
      "ruangFisik": "Kelas fleksibel dengan penataan meja kelompok, sudut baca, dan area pajang karya.",
      "platformVirtual": "Google Classroom, Padlet (pajang karya digital), Quizizz (asesmen awal).",
      "budayaBelajar": "Saling mengapresiasi, kolaboratif, terbuka, dan berani mengemukakan pendapat.",
      "sumberBelajar": "Buku Siswa & Buku Guru ${mataPelajaran} ${kelas} Kurikulum Merdeka (Kemendikdasmen)."
    },
    "kemitraanPembelajaran": {
      "guruKelas": "Kolaborasi perencanaan dan penilaian antarmata pelajaran.",
      "orangTua": "Mendukung pembiasaan positif di rumah dan berbagi pengalaman keluarga.",
      "komunitas": "Narasumber lingkungan sekitar atau perpustakaan sekolah."
    },
    "pemanfaatanDigital": [
      { "alat": "Canva for Education", "kegunaan": "Membuat media presentasi dan karya visual menarik." },
      { "alat": "Padlet", "kegunaan": "Papan pajang karya digital untuk umpan balik antar teman." },
      { "alat": "Quizizz", "kegunaan": "Kuis pemantik dan asesmen formatif interaktif menyenangkan." }
    ]
  },
  "pengalamanBelajar": [
    {
      "sesi": 1,
      "label": "Pertemuan 1, Sesi 1",
      "topik": "Topik bahasan sesi 1",
      "durasi": "3 × 35 Menit",
      "pembuka": {
        "deskripsi": "Apersepsi & Motivasi: Guru menyapa dan memantik rasa ingin tahu siswa dengan stimulus kontekstual. Pertanyaan pemantik: '...'. Guru menyampaikan tujuan pembelajaran sesi ini.",
        "waktuPrinsip": "10 Menit | Bermakna"
      },
      "inti": {
        "memahami": "(Langkah 1 Model) Guru menyajikan masalah kontekstual... Siswa membaca bahan dan mengidentifikasi informasi penting melalui ceramah interaktif.",
        "mengaplikasikan": "(Langkah 2–4 Model) Siswa membentuk kelompok kerja, mendiskusikan LKPD Sesi 1, melakukan penyelidikan, dan mempresentasikan hasil di depan kelas.",
        "merefleksikan": "(Langkah 5 Model) Tanya jawab reflektif: '...' Guru memberikan apresiasi dan umpan balik konstruktif.",
        "waktuPrinsip": "85 Menit | Bermakna, Menggembirakan, Berkesadaran"
      },
      "penutup": {
        "deskripsi": "Guru bersama siswa menyimpulkan poin inti pelajaran. Apresiasi dan penguatan positif. Penyampaian materi pertemuan selanjutnya dan doa penutup.",
        "waktuPrinsip": "10 Menit | Berkesadaran"
      }
    },
    {
      "sesi": 2,
      "label": "Pertemuan 2, Sesi 2",
      "topik": "Topik bahasan sesi 2",
      "durasi": "3 × 35 Menit",
      "pembuka": {
        "deskripsi": "Ulasan singkat sesi sebelumnya melalui kuis cepat. Pertanyaan pemantik lanjutan: '...'. Penyampaian tujuan sesi 2.",
        "waktuPrinsip": "10 Menit | Bermakna"
      },
      "inti": {
        "memahami": "Orientasi proyek / penyelidikan lanjutan materi ...",
        "mengaplikasikan": "Penyusunan karya / unjuk kerja / tugas terstruktur ...",
        "merefleksikan": "Gallery walk / presentasi antar kelompok dan pemberian bintang apresiasi ...",
        "waktuPrinsip": "85 Menit | Bermakna, Menggembirakan, Berkesadaran"
      },
      "penutup": {
        "deskripsi": "Refleksi diri peserta didik ('Satu hal berharga yang kupelajari hari ini...'). Simpulan dan apresiasi guru.",
        "waktuPrinsip": "10 Menit | Berkesadaran"
      }
    }
  ],
  "asesmen": {
    "tabelJenis": [
      { "jenis": "Asesmen Awal (Diagnostik)", "instrumen": "Pertanyaan pemantik lisan 3 butir; observasi kesiapan awal", "waktu": "Awal sesi pembelajaran" },
      { "jenis": "Asesmen Formatif (As & For Learning)", "instrumen": "Penilaian diri (self-assessment), observasi diskusi kelompok, checklist LKPD, peer review", "waktu": "Selama proses KBM" },
      { "jenis": "Asesmen Sumatif (Of Learning)", "instrumen": "Soal uraian HOTS 5 butir; penilaian produk karya; rubrik skala 1–4", "waktu": "Akhir pembelajaran / bab" }
    ],
    "lampiranAsesmenAwal": [
      { "soal": "Pertanyaan pemantik diagnostik 1?", "harapanJawaban": "Jawaban yang diharapkan siswa..." },
      { "soal": "Pertanyaan pemantik diagnostik 2?", "harapanJawaban": "Jawaban yang diharapkan siswa..." }
    ],
    "rubrikSikap": [
      { "aspek": "Disiplin", "skor4": "Selalu tepat waktu dan tertib menyelesaikan tugas", "skor3": "Sering tepat waktu dan tertib", "skor2": "Kadang kurang tepat waktu", "skor1": "Perlu bimbingan intensif" },
      { "aspek": "Tanggung Jawab", "skor4": "Menyelesaikan seluruh tugas dengan tuntas dan mandiri", "skor3": "Menyelesaikan sebagian besar tugas dengan baik", "skor2": "Menyelesaikan tugas hanya jika diingatkan", "skor1": "Jarang menyelesaikan tugas" },
      { "aspek": "Kerjasama", "skor4": "Sangat aktif berkontribusi dan mendukung rekan kelompok", "skor3": "Aktif berdiskusi dalam kelompok", "skor2": "Cenderung pasif dalam diskusi kelompok", "skor1": "Tidak terlibat dalam kerja kelompok" },
      { "aspek": "Toleransi", "skor4": "Selalu menghargai keberagaman gagasan dan keunikan teman", "skor3": "Menghargai perbedaan pendapat dengan baik", "skor2": "Kadang memaksakan kehendak", "skor1": "Kurang menghargai teman" }
    ],
    "rubrikPengetahuan": [
      { "aspek": "Penguasaan Konsep Materi", "skor4": "Mampu menjelaskan seluruh konsep materi dengan bukti tepat dan mendalam", "skor3": "Mampu menjelaskan sebagian besar konsep materi dengan benar", "skor2": "Menjelaskan konsep materi dengan cukup baik namun kurang bukti", "skor1": "Belum mampu menjelaskan konsep materi" }
    ],
    "rubrikKeterampilan": [
      { "aspek": "Penyajian Hasil Karya & Presentasi", "skor4": "Karya sangat kreatif, sistematis, dan dipresentasikan dengan percaya diri tinggi", "skor3": "Karya baik dan dipresentasikan dengan jelas", "skor2": "Karya cukup baik namun presentasi kurang lancar", "skor1": "Karya belum selesai dan kesulitan presentasi" }
    ],
    "soalSumatifHots": [
      { "no": 1, "soal": "Soal uraian HOTS 1 (analisis / kontekstual)...", "kunciJawaban": "Kunci jawaban dan kriteria penskoran..." },
      { "no": 2, "soal": "Soal uraian HOTS 2...", "kunciJawaban": "Kunci jawaban..." },
      { "no": 3, "soal": "Soal uraian HOTS 3...", "kunciJawaban": "Kunci jawaban..." }
    ]
  },
  "materiAjar": {
    "pendahuluan": "Pengantar materi yang menarik dan relevan untuk siswa sekolah dasar.",
    "poinPenting": [
      { "subjudul": "Subjudul Materi 1", "uraian": "Penjelasan konsep secara jelas, ramah anak, dan terstruktur." },
      { "subjudul": "Subjudul Materi 2", "uraian": "Penjelasan konsep dengan contoh nyata dalam kehidupan sehari-hari." }
    ],
    "rangkuman": "Poin-poin kesimpulan penting dari materi."
  },
  "lkpd": [
    {
      "sesi": 1,
      "judul": "LKPD Sesi 1: Penyelidikan Materi",
      "sintaksPbl": "Langkah 1 (Orientasi) → Langkah 2 (Organisasi) → Langkah 3 (Penyelidikan) → Langkah 4 (Penyajian) → Langkah 5 (Refleksi)",
      "kegiatanMemahami": {
        "bacaanAtauStimulus": "Teks bacaan singkat atau gambar stimulus kontekstual...",
        "pertanyaan": [
          "Pertanyaan pemahaman 1?",
          "Pertanyaan pemahaman 2?"
        ]
      },
      "kegiatanMengaplikasikan": {
        "petunjuk": "Petunjuk kerja kelompok atau unjuk kerja praktis...",
        "tabelAtauTugas": "Tugas pengisian tabel atau karya mandiri..."
      },
      "rubrikMandiri": [
        "Saya memahami materi ini dengan baik",
        "Saya menyelesaikan tugas secara mandiri dan bertanggung jawab",
        "Saya aktif berdiskusi dan saling membantu rekan sekelompok"
      ]
    }
  ],
  "tindakLanjutRefleksi": {
    "programRemedial": "Bimbingan individu dan pendampingan kembali pada indikator yang belum tuntas melalui penugasan terstruktur.",
    "programPengayaan": "Proyek eksplorasi mini dan pembuatan portofolio kreatif tingkat lanjut bagi siswa yang telah mencapai ketuntasan.",
    "refleksiGuru": [
      "Apakah tujuan pembelajaran tercapai secara menyeluruh oleh peserta didik?",
      "Strategi atau media apa yang paling membangkitkan antusiasme belajar siswa?",
      "Langkah perbaikan apa yang perlu dipersiapkan untuk pertemuan berikutnya?"
    ],
    "refleksiSiswa": [
      "Apa hal baru dan paling mengesankan yang kamu pelajari hari ini?",
      "Bagian materi mana yang masih membutuhkan latihan tambahan?",
      "Bagaimana perasaanmu selama mengikuti kegiatan pembelajaran hari ini?"
    ]
  },
  "daftarPustaka": [
    "Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi. Buku Panduan Guru ${mataPelajaran} ${kelas} Kurikulum Merdeka.",
    "Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi. Buku Siswa ${mataPelajaran} ${kelas} Kurikulum Merdeka.",
    "Badan Standar, Kurikulum, dan Asesmen Pendidikan (BSKAP). Capaian Pembelajaran Kurikulum Merdeka."
  ],
  "glosarium": [
    { "istilah": "Deep Learning", "definisi": "Pendekatan pembelajaran mendalam yang berfokus pada keterlibatan berkesadaran, bermakna, dan menggembirakan." },
    { "istilah": "${model.split(' ')[0]}", "definisi": "Model pembelajaran terstruktur berbasis investigasi dan pemecahan masalah." }
  ],
  "pengesahan": {
    "kota": "Makassar",
    "tanggal": "${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}",
    "kepalaSekolah": { "nama": "KURNIATI, S.Pd., M.Pd.", "nip": "19811208 200801 2 007" },
    "guru": { "nama": "${namaGuru}", "nip": "19920512 202221 1 015" }
  }
}

PENTING:
- Keluarkan HANYA JSON valid murni! Jangan menambahkan teks penjelasan, sapaan, atau markdown di luar kurung kurawal JSON.
- Pastikan seluruh konten detail, bermutu tinggi, mendalam, dan relevan dengan topik "${topik}".
`

  const result = await callGeminiWithFallback({
    apiKey,
    contents: [{ parts: [{ text: promptInstruction }] }],
    maxTokens: 8192,
    temperature: 0.3
  })

  try {
    const jsonStr = cleanJsonOutput(result.text)
    const parsed = JSON.parse(jsonStr)
    return {
      data: parsed,
      usedModel: result.usedModel
    }
  } catch (err) {
    console.error('Gagal parse JSON Modul Ajar AI:', result.text)
    throw new Error('AI merespons tetapi data tidak sesuai format JSON yang valid. Silakan klik "Generate Ulang".')
  }
}

