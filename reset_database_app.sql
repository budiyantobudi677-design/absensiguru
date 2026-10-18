-- ==============================================================================
-- SCRIPT RESET TOTAL APLIKASI GAMMARA APP (MULAI KEMBALI DARI 0)
-- & PENGHAPUSAN SELURUH AKUN PENGGUNA (GURU & ADMIN LAMA)
-- Jalankan script ini di Supabase SQL Editor (Dashboard Supabase -> SQL Editor)
-- Aman dijalankan berulang kali (Idempotent)
-- ==============================================================================

-- 1. FUNGSI 1: RESET DATA APLIKASI (KOSONGKAN DATA, AKUN LOGIN TETAP ADA)
CREATE OR REPLACE FUNCTION public.reset_application_to_zero()
RETURNS jsonb AS $$
DECLARE
  v_res jsonb;
BEGIN
  -- 1. Kosongkan Riwayat Transaksional Presensi Pegawai
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'absensi') THEN
    DELETE FROM public.absensi;
  END IF;

  -- 2. Kosongkan Data Akademik KBM, Jurnal, dan Nilai Siswa
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_attendance') THEN
    DELETE FROM public.student_attendance;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_grades') THEN
    DELETE FROM public.student_grades;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_behavior_notes') THEN
    DELETE FROM public.student_behavior_notes;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_journals') THEN
    DELETE FROM public.learning_journals;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jurnal') THEN
    DELETE FROM public.jurnal;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'students') THEN
    DELETE FROM public.students;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'classes') THEN
    DELETE FROM public.classes;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hari_libur') THEN
    DELETE FROM public.hari_libur;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'school_holidays') THEN
    DELETE FROM public.school_holidays;
  END IF;

  -- 3. Bersihkan Pengumuman & Konfigurasi Sementara, AMANKAN Master Key Pengembang & Akun Admin
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pengumuman') THEN
    DELETE FROM public.pengumuman 
    WHERE target_type NOT IN ('__SYSTEM_DEVELOPER_KEY_CONFIG__', '__SYSTEM_ADMIN_CREDENTIALS__') 
       OR target_type IS NULL;
  END IF;

  -- 4. Reset Profil Guru (Kosongkan mapel & jabatan, pertahankan akun login auth)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    UPDATE public.profiles 
    SET mata_pelajaran = NULL, 
        jabatan = NULL, 
        foto_profil = NULL
    WHERE role != 'admin';
  END IF;

  -- 5. Reset Pengaturan Sekolah ke Nilai Default Pabrik
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'settings') THEN
    INSERT INTO public.settings (
      id, 
      nama_sekolah, 
      logo_sekolah, 
      hari_kerja, 
      rekap_tampil_jam, 
      geofence_enabled, 
      school_lat, 
      school_lng, 
      school_radius
    ) VALUES (
      1, 
      'SDN 173 Gammara', 
      NULL, 
      5, 
      true, 
      false, 
      -5.147665, 
      119.432732, 
      100
    )
    ON CONFLICT (id) DO UPDATE SET
      nama_sekolah = 'SDN 173 Gammara',
      logo_sekolah = NULL,
      hari_kerja = 5,
      rekap_tampil_jam = true,
      geofence_enabled = false,
      school_lat = -5.147665,
      school_lng = 119.432732,
      school_radius = 100;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Aplikasi GammaraApp dan seluruh data berhasil direset kembali mulai dari 0!',
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reset_application_to_zero() TO anon, authenticated;

-- ==============================================================================
-- 2. FUNGSI 2 (OPSI 2): RESET TOTAL & HAPUS SEMUA AKUN (GURU & ADMIN LAMA)
-- Menghapus seluruh auth.users & profiles, lalu mendaftarkan Admin Baru
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.reset_and_delete_all_accounts(
  new_admin_email text DEFAULT 'admin@gammara.sch.id',
  new_admin_name text DEFAULT 'Administrator Sekolah'
)
RETURNS jsonb AS $$
DECLARE
  v_users_deleted int := 0;
BEGIN
  -- 1. Kosongkan semua data aplikasi terlebih dahulu
  PERFORM public.reset_application_to_zero();

  -- 2. Hapus seluruh akun pengguna dari auth.users
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    SELECT count(*) INTO v_users_deleted FROM auth.users;
    DELETE FROM auth.users;
  END IF;

  -- 3. Pastikan tabel profiles kosong total
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    DELETE FROM public.profiles;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_users_count', v_users_deleted,
    'new_admin_email', new_admin_email,
    'message', 'Seluruh akun guru & admin lama telah berhasil dihapus total dari database.',
    'timestamp', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reset_and_delete_all_accounts(text, text) TO anon, authenticated;

-- Kebijakan DELETE untuk absensi agar Admin/Authenticated dapat menghapus data jika diperlukan
DO $$ BEGIN
  CREATE POLICY "Allow delete absensi for owner or admin"
  ON public.absensi
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id OR public.is_admin_or_kepsek()
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==============================================================================
-- PANDUAN PENGGUNAAN DI SUPABASE SQL EDITOR:
-- 1. Jalankan seluruh script ini di SQL Editor Supabase 1 kali.
-- 2. Untuk Reset Data Saja (Akun guru tetap ada):
--    SELECT public.reset_application_to_zero();
-- 3. Untuk Reset Total + Hapus Semua Akun Guru/Admin:
--    SELECT public.reset_and_delete_all_accounts('admin@sekolah.sch.id', 'Kepala Sekolah');
-- ==============================================================================
