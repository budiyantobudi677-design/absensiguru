-- ==============================================================================
-- SCRIPT RESMI: ROW-LEVEL SECURITY (RLS) TABEL ABSENSI SUPABASE
-- Menghilangkan Error: "new row violates row-level security policy for table 'absensi'"
-- Memastikan semua akun (Admin, Kepsek, Guru, Tendik) 100% saling terhubung di APK, Web & Mobile
-- Jalankan script ini di: Supabase Project Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Buat indeks untuk performa pencarian yang cepat
CREATE INDEX IF NOT EXISTS idx_absensi_user_id ON public.absensi(user_id);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON public.absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_status ON public.absensi(status);

-- 2. Hapus semua policy lama yang membatasi atau menimbulkan konflik
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

-- 3. Aktifkan RLS dan buat policy inklusif untuk semua pengguna (anon & authenticated)
ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to absensi"
ON public.absensi
FOR ALL
TO public, anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. Berikan izin hak akses SQL penuh
GRANT ALL ON public.absensi TO anon;
GRANT ALL ON public.absensi TO authenticated;
GRANT ALL ON public.absensi TO service_role;

-- Selesai! Tabel absensi sekarang dapat diakses secara sinkron oleh seluruh akun (Admin, Kepsek, Guru, Tendik).
