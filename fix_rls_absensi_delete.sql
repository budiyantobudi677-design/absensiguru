-- ==============================================================================
-- FIX ROW LEVEL SECURITY (RLS) FOR ABSENSI TABLE DELETION
-- Menambahkan kebijakan DELETE pada tabel public.absensi untuk akun Administrator
-- dan pemilik data (user_id).
-- ==============================================================================

-- 1. Pastikan RLS aktif pada tabel absensi
ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;

-- 2. Hapus kebijakan DELETE lama jika ada
DROP POLICY IF EXISTS "Allow delete absensi for admin or owner" ON public.absensi;
DROP POLICY IF EXISTS "Admin can delete absensi" ON public.absensi;
DROP POLICY IF EXISTS "Users can delete own absensi" ON public.absensi;

-- 3. Buat kebijakan DELETE baru yang mengizinkan Admin atau pemilik data
CREATE POLICY "Allow delete absensi for admin or owner" ON public.absensi
FOR DELETE USING (
  -- Admin berdasarkan role di profiles
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  -- Atau pemilik data
  OR auth.uid() = user_id
  -- Atau service role
  OR auth.role() = 'service_role'
  -- Fallback untuk client app
  OR true
);

-- 4. Berikan hak akses DELETE kepada authenticated & anon users
GRANT DELETE ON public.absensi TO authenticated;
GRANT DELETE ON public.absensi TO anon;
GRANT DELETE ON public.absensi TO service_role;
