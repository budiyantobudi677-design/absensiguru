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

export function saveCustomSubjects(subjectsList) {
  try {
    localStorage.setItem('panrita_kbm_subjects', JSON.stringify(subjectsList))
    window.dispatchEvent(new Event('kbm_subjects_updated'))
  } catch (err) {
    console.error('Error saving subjects to localStorage', err)
  }
}
