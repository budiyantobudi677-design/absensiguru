import { createClient } from '@supabase/supabase-js'
import { Preferences } from '@capacitor/preferences'

// TODO: Replace with user's actual Supabase URL and Anon Key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT_ID.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

// Custom storage adapter using Capacitor Preferences (Android SharedPreferences)
// with fallback and mirror to localStorage, ensuring session stays saved when app is closed and reopened
const capacitorStorage = {
  getItem: async (key) => {
    try {
      const { value } = await Preferences.get({ key })
      if (value !== null && value !== undefined) {
        return value
      }
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    } catch {
      return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    }
  },
  setItem: async (key, value) => {
    try {
      await Preferences.set({ key, value: String(value) })
    } catch {
      // ignore
    }
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, String(value))
      }
    } catch {
      // ignore
    }
  },
  removeItem: async (key) => {
    try {
      await Preferences.remove({ key })
    } catch {
      // ignore
    }
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch {
      // ignore
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: capacitorStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
