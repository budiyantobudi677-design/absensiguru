// ==============================================================================
// SERVICE GOOGLE GEMINI AI - ABSENSI GURU & KBM
// Auto-Fallback Model: Gemini 3.8 Flash -> Gemini 2.0 Flash -> Gemini 1.5 Flash
// ==============================================================================

export const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
]

/**
 * Mengambil API Key yang tersimpan untuk user aktif (atau fallback lokal)
 */
export function getSavedGeminiKey(userId) {
  if (userId) {
    const userKey = localStorage.getItem(`gemini_api_key_${userId}`)
    if (userKey && userKey.trim()) return userKey.trim()
  }
  const globalKey = localStorage.getItem('gemini_api_key')
  if (globalKey && globalKey.trim()) return globalKey.trim()
  
  return (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
}

/**
 * Menyimpan API Key untuk user aktif
 */
export function saveGeminiKey(apiKey, userId) {
  const cleanKey = (apiKey || '').trim()
  if (userId) {
    localStorage.setItem(`gemini_api_key_${userId}`, cleanKey)
  }
  localStorage.setItem('gemini_api_key', cleanKey)
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
async function callGeminiWithFallback({ apiKey, contents, systemInstruction = null }) {
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
          temperature: 0.2,
          maxOutputTokens: 2048,
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
