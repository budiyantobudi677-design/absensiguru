-- ==============================================================================
-- SCRIPT RESMI SUPABASE: SISTEM SHIFT KERJA (SHIFT GANJIL & SHIFT GENAP), 
-- ROTASI PEKAN MINGGUAN (PEKAN GANJIL / GENAP), DAN JADWAL GURU MAPEL
-- ==============================================================================
-- Jalankan script ini di:
-- Supabase Dashboard -> SQL Editor -> New Query -> Tempel (Paste) -> Run
-- ==============================================================================

-- 1. TABEL MASTER SHIFT SEKOLAH (SCHOOL_SHIFTS)
CREATE TABLE IF NOT EXISTS public.school_shifts (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  code TEXT,
  deskripsi TEXT,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Buka RLS untuk school_shifts
ALTER TABLE public.school_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to school_shifts" ON public.school_shifts;
CREATE POLICY "Allow all access to school_shifts"
ON public.school_shifts
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.school_shifts TO anon;
GRANT ALL ON public.school_shifts TO authenticated;
GRANT ALL ON public.school_shifts TO service_role;

-- 2. TABEL PENUGASAN SHIFT & ROTASI GURU (TEACHER_SHIFT_ASSIGNMENTS)
CREATE TABLE IF NOT EXISTS public.teacher_shift_assignments (
  teacher_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'fixed', -- 'fixed' | 'rolling_weekly' | 'custom_days'
  fixed_shift_id TEXT DEFAULT 'shift-ganjil',
  rolling_config JSONB DEFAULT '{}'::jsonb,
  custom_days_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Buka RLS untuk teacher_shift_assignments
ALTER TABLE public.teacher_shift_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to teacher_shift_assignments" ON public.teacher_shift_assignments;
CREATE POLICY "Allow all access to teacher_shift_assignments"
ON public.teacher_shift_assignments
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.teacher_shift_assignments TO anon;
GRANT ALL ON public.teacher_shift_assignments TO authenticated;
GRANT ALL ON public.teacher_shift_assignments TO service_role;

-- 3. TAMBAHKAN KOLOM PENDUKUNG DI TABEL PROFILES & ABSENSI JIKA BELUM ADA
DO $$
BEGIN
  -- Kolom di profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_id TEXT DEFAULT 'shift-ganjil';
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_mode TEXT DEFAULT 'fixed';
  END IF;

  -- Kolom di absensi
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'absensi') THEN
    ALTER TABLE public.absensi ADD COLUMN IF NOT EXISTS shift_nama TEXT;
    ALTER TABLE public.absensi ADD COLUMN IF NOT EXISTS shift_id TEXT;
  END IF;
END $$;

-- 4. INSERT DATA DEFAULT SHIFT GANJIL & SHIFT GENAP (JIKA BELUM ADA)
INSERT INTO public.school_shifts (id, nama, code, deskripsi, rules)
VALUES 
(
  'shift-ganjil',
  'Shift Ganjil',
  'GANJIL',
  'Shift Ganjil (Masuk Pagi)',
  '{
    "Senin":  {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "14:00"},
    "Selasa": {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "14:00"},
    "Rabu":   {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "14:00"},
    "Kamis":  {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "14:00"},
    "Jumat":  {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "11:30"},
    "Sabtu":  {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "12:30"},
    "Minggu": {"jamMasuk": "07:00", "toleransi": 15, "jamPulang": "14:00", "libur": true}
  }'::jsonb
),
(
  'shift-genap',
  'Shift Genap',
  'GENAP',
  'Shift Genap (Masuk Siang)',
  '{
    "Senin":  {"jamMasuk": "10:00", "toleransi": 15, "jamPulang": "17:00"},
    "Selasa": {"jamMasuk": "10:00", "toleransi": 15, "jamPulang": "17:00"},
    "Rabu":   {"jamMasuk": "10:00", "toleransi": 15, "jamPulang": "17:00"},
    "Kamis":  {"jamMasuk": "10:00", "toleransi": 15, "jamPulang": "17:00"},
    "Jumat":  {"jamMasuk": "13:00", "toleransi": 15, "jamPulang": "17:00"},
    "Sabtu":  {"jamMasuk": "09:30", "toleransi": 15, "jamPulang": "15:00"},
    "Minggu": {"jamMasuk": "10:00", "toleransi": 15, "jamPulang": "17:00", "libur": true}
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE 
SET nama = EXCLUDED.nama,
    code = EXCLUDED.code,
    deskripsi = EXCLUDED.deskripsi,
    rules = EXCLUDED.rules;
