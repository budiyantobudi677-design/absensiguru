import { createClient } from '@supabase/supabase-js'
import { Preferences } from '@capacitor/preferences'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

// Helper sinkron untuk window.localStorage
const getLocalItem = (key) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key)
    }
  } catch {
    // ignore
  }
  return null
}

const setLocalItem = (key, value) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, String(value))
    }
  } catch {
    // ignore
  }
}

const removeLocalItem = (key) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

// Custom storage adapter yang menggabungkan Capacitor Preferences (Android SharedPreferences)
// dan localStorage browser/WebView secara dua arah (dual-layer sync).
// Memastikan sesi login tetap aman dan tersimpan permanen saat aplikasi ditutup/dikeluarkan dan dibuka kembali.
const capacitorStorage = {
  getItem: async (key) => {
    // 1. Cek localStorage terlebih dahulu (langsung seketika tanpa latency bridge)
    const localVal = getLocalItem(key)
    if (localVal !== null && localVal !== undefined && localVal !== '') {
      return localVal
    }

    // 2. Jika di localStorage kosong, ambil dari native Preferences (Android SharedPreferences)
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null && value !== undefined && value !== '') {
        // Pulihkan ke localStorage agar akses berikutnya instan
        setLocalItem(key, value)
        return value
      }
    } catch {
      // ignore
    }

    return null
  },
  setItem: async (key, value) => {
    const strVal = String(value)
    // Simpan ke localStorage seketika
    setLocalItem(key, strVal)

    // Simpan ke Preferences native secara permanen
    try {
      await Preferences.set({ key, value: strVal })
    } catch {
      // ignore
    }
  },
  removeItem: async (key) => {
    removeLocalItem(key)
    try {
      await Preferences.remove({ key })
    } catch {
      // ignore
    }
  },
}

// Pre-hydrate native Preferences ke localStorage saat awal booting aplikasi
if (typeof window !== 'undefined') {
  try {
    Preferences.keys().then(async ({ keys }) => {
      if (Array.isArray(keys)) {
        for (const k of keys) {
          if (k.startsWith('sb-') || k.startsWith('panrita_') || k.startsWith('guru_')) {
            const currentLocal = getLocalItem(k)
            if (!currentLocal) {
              const { value } = await Preferences.get({ key: k })
              if (value) setLocalItem(k, value)
            }
          }
        }
      }
    }).catch(() => {})
  } catch {
    // ignore
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: capacitorStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
