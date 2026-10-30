/**
 * Manajer Pembaruan Aplikasi (App Version & Force Update Manager)
 * Mendukung deteksi versi baru, notifikasi update, dan penguncian aplikasi kedaluwarsa.
 */

export const CURRENT_APP_VERSION = '1.1.0'
export const CURRENT_APP_VERSION_CODE = 2

const VERSION_CONFIG_TARGET = '__APP_VERSION_CONFIG__'
const DEFAULT_DOWNLOAD_URL = 'https://github.com/budiyantobudi677-design/absensiguru/raw/main/GammaraApp.apk'

/**
 * Membandingkan dua string versi (semver sederhana seperti '1.1.0' vs '1.0.0')
 * Return: -1 jika v1 < v2, 0 jika v1 === v2, 1 jika v1 > v2
 */
export function compareAppVersions(v1, v2) {
  if (!v1 || !v2) return 0
  const p1 = String(v1).replace(/^v/i, '').split('.').map(Number)
  const p2 = String(v2).replace(/^v/i, '').split('.').map(Number)

  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = isNaN(p1[i]) ? 0 : p1[i]
    const num2 = isNaN(p2[i]) ? 0 : p2[i]
    if (num1 < num2) return -1
    if (num1 > num2) return 1
  }
  return 0
}

/**
 * Mengambil konfigurasi versi terbaru dari Cloud Supabase
 */
export async function fetchAppVersionConfig(supabase) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('pengumuman')
      .select('*')
      .eq('target_type', VERSION_CONFIG_TARGET)
      .order('id', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      const config = JSON.parse(data[0].pesan || '{}')
      return config
    }
  } catch (err) {
    console.warn('Fetch app version config warning:', err)
  }
  return null
}

/**
 * Menyimpan konfigurasi versi baru ke Cloud Supabase (hanya oleh Admin/Sistem)
 */
export async function saveAppVersionConfig({
  latestVersion = CURRENT_APP_VERSION,
  minSupportedVersion = CURRENT_APP_VERSION,
  downloadUrl = DEFAULT_DOWNLOAD_URL,
  releaseNotes = 'Pembaruan stabilitas presensi, perbaikan jam kepulangan, dan alarm pengingat.',
  forceUpdate = true,
  supabase
}) {
  if (!supabase) return false
  try {
    const payload = JSON.stringify({
      latest_version: latestVersion,
      min_supported_version: minSupportedVersion,
      download_url: downloadUrl,
      release_notes: releaseNotes,
      force_update: forceUpdate,
      updated_at: new Date().toISOString()
    })

    const { data: existing } = await supabase
      .from('pengumuman')
      .select('id')
      .eq('target_type', VERSION_CONFIG_TARGET)
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase
        .from('pengumuman')
        .update({ pesan: payload })
        .eq('id', existing[0].id)
    } else {
      await supabase
        .from('pengumuman')
        .insert([{
          pesan: payload,
          target_type: VERSION_CONFIG_TARGET,
          target_users: ''
        }])
    }
    return true
  } catch (err) {
    console.warn('Save app version config error:', err)
    return false
  }
}

/**
 * Memeriksa status update aplikasi saat ini
 */
export async function checkAppUpdateStatus(supabase) {
  const config = await fetchAppVersionConfig(supabase)
  if (!config) {
    return {
      isOutdated: false,
      isForced: false,
      config: {
        latest_version: CURRENT_APP_VERSION,
        min_supported_version: CURRENT_APP_VERSION,
        download_url: DEFAULT_DOWNLOAD_URL,
        release_notes: '',
        force_update: false
      }
    }
  }

  const latest = config.latest_version || CURRENT_APP_VERSION
  const minRequired = config.min_supported_version || CURRENT_APP_VERSION
  const isForcedSetting = Boolean(config.force_update)

  // 1. Cek apakah di bawah versi minimal yang diizinkan (Wajib Update / Kunci Layar)
  const isBelowMin = compareAppVersions(CURRENT_APP_VERSION, minRequired) < 0
  const isBelowLatest = compareAppVersions(CURRENT_APP_VERSION, latest) < 0

  if (isBelowMin || (isBelowLatest && isForcedSetting)) {
    return {
      isOutdated: true,
      isForced: true,
      config
    }
  }

  // 2. Cek apakah ada update minor opsional
  if (isBelowLatest) {
    return {
      isOutdated: true,
      isForced: false,
      config
    }
  }

  return {
    isOutdated: false,
    isForced: false,
    config
  }
}
