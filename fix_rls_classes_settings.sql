-- ==============================================================================
-- SCRIPT RESMI SUPABASE: FIX RLS KELAS, SISWA, PENGATURAN & PRESENSI LENGKAP
-- Memastikan 18 Kelas, Data Siswa, Pengaturan Geofencing, dan Presensi
-- 100% SINKRON DAN DAPAT DIAKSES OLEH SEMUA ROLE (Admin, Kepsek, Guru, Tendik, Mobile, Web & APK)
-- Jalankan di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. TABEL KELAS (CLASSES) - Membuka 18 Kelas untuk Role anon & authenticated
CREATE INDEX IF NOT EXISTS idx_classes_name ON public.classes(name);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to classes" ON public.classes;
DROP POLICY IF EXISTS "All authenticated users can view classes" ON public.classes;
DROP POLICY IF EXISTS "Admin and guru can insert/update classes" ON public.classes;
DROP POLICY IF EXISTS "Public can view classes" ON public.classes;

CREATE POLICY "Allow all access to classes"
ON public.classes
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.classes TO anon;
GRANT ALL ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;

-- 2. TABEL DATA SISWA (STUDENTS) - Membuka Akses Siswa untuk Semua Akun
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON public.students(name);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to students" ON public.students;
DROP POLICY IF EXISTS "All authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Admin and guru can insert/update/delete students" ON public.students;

CREATE POLICY "Allow all access to students"
ON public.students
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.students TO anon;
GRANT ALL ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;

-- 3. TABEL PENGATURAN SEKOLAH & GEOFENCING (SETTINGS & SCHOOL_SETTINGS)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings') THEN
    ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all access to settings" ON public.settings;
    CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
    GRANT ALL ON public.settings TO anon;
    GRANT ALL ON public.settings TO authenticated;
    GRANT ALL ON public.settings TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'school_settings') THEN
    ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all access to school_settings" ON public.school_settings;
    CREATE POLICY "Allow all access to school_settings" ON public.school_settings FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);
    GRANT ALL ON public.school_settings TO anon;
    GRANT ALL ON public.school_settings TO authenticated;
    GRANT ALL ON public.school_settings TO service_role;
  END IF;
END $$;

-- 4. TABEL PRESENSI PEGAWAI (ABSENSI)
CREATE INDEX IF NOT EXISTS idx_absensi_user_id ON public.absensi(user_id);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON public.absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_status ON public.absensi(status);

ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to absensi" ON public.absensi;
CREATE POLICY "Allow all access to absensi" ON public.absensi FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.absensi TO anon;
GRANT ALL ON public.absensi TO authenticated;
GRANT ALL ON public.absensi TO service_role;

-- Selesai! Semua tabel sekarang 100% sinkron dan terhubung untuk seluruh akun dan perangkat.
