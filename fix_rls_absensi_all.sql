-- ==============================================================================
-- SCRIPT RESMI SUPABASE: FIX ROW-LEVEL SECURITY (RLS) LENGKAP
-- Menghilangkan Error RLS dan Membuka Akses Penuh:
-- 1. TABEL ABSENSI (Presensi Pegawai)
-- 2. TABEL CLASSES (18 Kelas Rombel)
-- 3. TABEL STUDENTS (Data Siswa)
-- 4. TABEL SETTINGS & SCHOOL_SETTINGS (Pengaturan Sekolah & Geofencing)
-- Memastikan SEMUA AKUN (Admin, Kepsek, Guru, Tendik, Mobile, Web & APK) 100% Saling Terhubung!
-- Jalankan di: Supabase Project Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. TABEL ABSENSI (PRESENSI PEGAWAI)
CREATE INDEX IF NOT EXISTS idx_absensi_user_id ON public.absensi(user_id);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON public.absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_status ON public.absensi(status);

ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to absensi" ON public.absensi;
DROP POLICY IF EXISTS "Allow insert absensi for owner or admin" ON public.absensi;
DROP POLICY IF EXISTS "Allow update absensi for owner or admin" ON public.absensi;
DROP POLICY IF EXISTS "Allow select absensi for owner or admin" ON public.absensi;
DROP POLICY IF EXISTS "Admin and Kepsek can insert any absensi" ON public.absensi;
DROP POLICY IF EXISTS "Admin and Kepsek can update any absensi" ON public.absensi;
DROP POLICY IF EXISTS "Users can insert their own absensi" ON public.absensi;
DROP POLICY IF EXISTS "Users can update their own absensi" ON public.absensi;
DROP POLICY IF EXISTS "Users can manage own absensi" ON public.absensi;
DROP POLICY IF EXISTS "Admin can manage all absensi" ON public.absensi;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.absensi;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.absensi;
DROP POLICY IF EXISTS "Public can view absensi" ON public.absensi;
DROP POLICY IF EXISTS "Anyone can insert absensi" ON public.absensi;

CREATE POLICY "Allow all access to absensi"
ON public.absensi
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

GRANT ALL ON public.absensi TO anon;
GRANT ALL ON public.absensi TO authenticated;
GRANT ALL ON public.absensi TO service_role;

-- 2. TABEL CLASSES (KELAS / ROMBEL)
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

-- 3. TABEL STUDENTS (DATA SISWA)
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

-- 4. TABEL SETTINGS & SCHOOL_SETTINGS (GEOFENCING & SEKOLAH)
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

-- Selesai! Seluruh data presensi, 18 rombel kelas, data siswa, dan radius geofencing sekarang dapat diakses secara sinkron oleh seluruh akun.
