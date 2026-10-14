import { saveAs } from 'file-saver'
import { LOGO_PEMKOT_BASE64, LOGO_DISDIK_BASE64 } from './persuratanLogos'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, HeadingLevel, ImageRun } from 'docx'

// Konversi base64 string ke Uint8Array untuk docx ImageRun
function base64ToUint8Array(base64String) {
  try {
    const raw = base64String.replace(/^data:image\/[a-z]+;base64,/, '')
    const binary = atob(raw)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch (e) {
    console.error('Error converting base64 to uint8array:', e)
    return null
  }
}

export const DEFAULT_KOP_DATA = {
  instansiAtas: 'PEMERINTAH KOTA MAKASSAR',
  dinas: 'DINAS PENDIDIKAN',
  sekolah: 'UPTD SPF SD INPRES TANGKALA II',
  kelurahanKecamatan: 'KELURAHAN LAIKANG KECAMATAN BIRINGKANAYA',
  alamat: 'Jl. Pangkep Raya Perumnas Sudiang Makassar Kode Pos : 90242',
  nss: '101196012399',
  npsn: '40313269',
  kepsekNama: 'KURNIATI, S.Pd., M.Pd.',
  kepsekNip: '19811208 200801 2 007',
  kepsekJabatan: 'Kepala UPTD SPF SD Inpres Tangkala II',
  kota: 'Makassar',
}

/**
 * Template Header Kop Surat HTML untuk Preview, Print, dan Word HTML
 */
export function renderKopSuratHtml(kop = DEFAULT_KOP_DATA) {
  return `
  <div class="kop-container" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 16px; font-family: 'Times New Roman', Times, serif;">
    <div style="width: 75px; text-align: center; flex-shrink: 0;">
      <img src="${LOGO_PEMKOT_BASE64}" alt="Logo Pemkot" style="width: 65px; height: auto; max-height: 80px; object-fit: contain;" />
    </div>
    <div style="flex-grow: 1; text-align: center; padding: 0 10px;">
      <div style="font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.2;">${kop.instansiAtas || 'PEMERINTAH KOTA MAKASSAR'}</div>
      <div style="font-size: 13pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.2;">${kop.dinas || 'DINAS PENDIDIKAN'}</div>
      <div style="font-size: 14pt; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1.25; margin: 2px 0;">${kop.sekolah || 'UPTD SPF SD INPRES TANGKALA II'}</div>
      <div style="font-size: 10pt; font-weight: 600; text-transform: uppercase; line-height: 1.2;">${kop.kelurahanKecamatan || 'KELURAHAN LAIKANG KECAMATAN BIRINGKANAYA'}</div>
      <div style="font-size: 9.5pt; font-style: italic; line-height: 1.2; margin-top: 1px;">${kop.alamat || 'Jl. Pangkep Raya Perumnas Sudiang Makassar Kode Pos : 90242'}</div>
      <div style="font-size: 9.5pt; font-weight: bold; line-height: 1.2; margin-top: 2px;">NSS : ${kop.nss || '101196012399'} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; NPSN : ${kop.npsn || '40313269'}</div>
    </div>
    <div style="width: 75px; text-align: center; flex-shrink: 0;">
      <img src="${LOGO_DISDIK_BASE64}" alt="Logo Disdik" style="width: 70px; height: auto; max-height: 80px; object-fit: contain;" />
    </div>
  </div>
  `
}

// -------------------------------------------------------------
// 1. SURAT TUGAS - HTML GENERATION
// -------------------------------------------------------------
export function getSuratTugasHtml(data, kop = DEFAULT_KOP_DATA) {
  const d = {
    nomor: data?.nomor || '421.2/     /UPTD.SPF.SD.I.T.II/ST/     /2026',
    suratDari: data?.suratDari || 'Dinas Pendidikan Kota Makassar',
    suratNomor: data?.suratNomor || '.........................',
    suratTanggal: data?.suratTanggal || '..................',
    suratPerihal: data?.suratPerihal || 'permintaan peserta',
    pegawaiNama: data?.pegawaiNama || '....................',
    pegawaiJabatan: data?.pegawaiJabatan || 'Guru Kelas',
    pegawaiNip: data?.pegawaiNip || '',
    kegiatan: data?.kegiatan || 'Bertugas sebagai peserta kegiatan Peningkatan dan Evaluasi Hasil Rapor Pendidikan Jenjang SD, yang akan dilaksanakan pada :',
    hariTanggal: data?.hariTanggal || '....................',
    tempat: data?.tempat || '....................',
    dikeluarkanDi: data?.dikeluarkanDi || kop.kota || 'Makassar',
    tanggalSurat: data?.tanggalSurat || '....................',
  }

  return `
  <div class="surat-paper" style="font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; line-height: 1.45; color: #000; text-align: justify; max-width: 750px; margin: 0 auto; background: #fff; padding: 10px;">
    ${renderKopSuratHtml(kop)}
    
    <div style="text-align: center; margin-bottom: 16px;">
      <div style="font-size: 13.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 1px;">SURAT TUGAS</div>
      <div style="font-size: 11pt; margin-top: 2px;">Nomor : ${d.nomor}</div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11.5pt;">
      <tr>
        <td style="width: 12%; vertical-align: top; font-weight: bold;">Dasar</td>
        <td style="width: 3%; vertical-align: top; font-weight: bold;">:</td>
        <td style="width: 85%; vertical-align: top; text-align: justify;">
          Berdasarkan Surat dari <strong>${d.suratDari}</strong>, Nomor : <strong>${d.suratNomor}</strong> Tanggal <strong>${d.suratTanggal}</strong> perihal ${d.suratPerihal}, maka Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'};
        </td>
      </tr>
    </table>

    <div style="text-align: center; font-weight: bold; letter-spacing: 2px; margin: 12px 0 10px 0; font-size: 12pt;">
      MENUGASKAN
    </div>

    <div style="margin-bottom: 6px; font-weight: bold;">Kepada:</div>
    <table style="width: 100%; border-collapse: collapse; margin-left: 20px; margin-bottom: 14px; font-size: 11.5pt;">
      <tr>
        <td style="width: 130px; vertical-align: top;">Nama</td>
        <td style="width: 15px; vertical-align: top;">:</td>
        <td style="vertical-align: top; font-weight: bold;">${d.pegawaiNama}</td>
      </tr>
      ${d.pegawaiNip ? `
      <tr>
        <td style="vertical-align: top;">NIP</td>
        <td style="vertical-align: top;">:</td>
        <td style="vertical-align: top;">${d.pegawaiNip}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="vertical-align: top;">Jabatan</td>
        <td style="vertical-align: top;">:</td>
        <td style="vertical-align: top;">${d.pegawaiJabatan}</td>
      </tr>
    </table>

    <div style="margin-bottom: 6px; font-weight: bold;">Untuk:</div>
    <div style="margin-left: 20px; margin-bottom: 10px;">
      ${d.kegiatan}
    </div>

    <table style="width: 90%; border-collapse: collapse; margin-left: 40px; margin-bottom: 18px; font-size: 11.5pt;">
      <tr>
        <td style="width: 140px; vertical-align: top; padding: 2px 0;">Hari / Tanggal</td>
        <td style="width: 15px; vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 2px 0;">${d.hariTanggal}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Tempat</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 2px 0;">${d.tempat}</td>
      </tr>
    </table>

    <div style="margin-bottom: 24px; text-indent: 0px;">
      Demikian Surat ini diberikan kepada yang bersangkutan untuk dipergunakan sebagaimana mestinya dan dengan penuh rasa tanggung jawab.
    </div>

    <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
      <div style="width: 300px; text-align: left;">
        <div>Dikeluarkan: di ${d.dikeluarkanDi}</div>
        <div style="margin-bottom: 4px;">Pada Tanggal: ${d.tanggalSurat}</div>
        <div style="font-weight: bold;">${kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II'}</div>
        <div style="height: 60px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${kop.kepsekNama || 'KURNIATI, S.Pd., M.Pd.'}</div>
        <div>NIP. ${kop.kepsekNip || '19811208 200801 2 007'}</div>
      </div>
    </div>
  </div>
  `
}

// -------------------------------------------------------------
// 2. SURAT REKOMENDASI MENERIMA - HTML GENERATION
// -------------------------------------------------------------
export function getSuratRekomendasiHtml(data, kop = DEFAULT_KOP_DATA) {
  const d = {
    nomor: data?.nomor || '421.2/      /UPTD.SPF.SD.I.T.II/SR/      /2026',
    nama: data?.nama || '................................................',
    ttl: data?.ttl || '................................................',
    nisn: data?.nisn || '................................................',
    jk: data?.jk || 'Laki-laki',
    agama: data?.agama || 'Islam',
    asalSekolah: data?.asalSekolah || '................................................',
    kelas: data?.kelas || 'Kelas I (Satu)',
    namaOrtu: data?.namaOrtu || '................................................',
    alamat: data?.alamat || '................................................',
    tahunAjaran: data?.tahunAjaran || '2026/2027',
    semester: data?.semester || 'Ganjil',
    tanggalSurat: data?.tanggalSurat || '....................',
    kota: data?.kota || kop.kota || 'Makassar',
  }

  return `
  <div class="surat-paper" style="font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; line-height: 1.45; color: #000; text-align: justify; max-width: 750px; margin: 0 auto; background: #fff; padding: 10px;">
    ${renderKopSuratHtml(kop)}
    
    <div style="text-align: center; margin-bottom: 18px;">
      <div style="font-size: 13.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 0.5px;">SURAT REKOMENDASI MENERIMA</div>
      <div style="font-size: 11pt; margin-top: 2px;">Nomor : ${d.nomor}</div>
    </div>

    <div style="margin-bottom: 10px; text-indent: 0px;">
      Yang bertanda tangan dibawah ini Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar menerangkan bahwa :
    </div>

    <table style="width: 95%; border-collapse: collapse; margin-left: 20px; margin-bottom: 14px; font-size: 11.5pt;">
      <tr>
        <td style="width: 200px; vertical-align: top; padding: 2px 0;">N a m a</td>
        <td style="width: 15px; vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 2px 0;">${d.nama}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Tempat/Tanggal Lahir</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.ttl}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">NISN</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.nisn}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Jenis Kelamin</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.jk}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Agama</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.agama}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Asal Sekolah</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.asalSekolah}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Kelas</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 2px 0;">${d.kelas}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Nama Orang Tua/ Wali</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.namaOrtu}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 2px 0;">Alamat</td>
        <td style="vertical-align: top; padding: 2px 0;">:</td>
        <td style="vertical-align: top; padding: 2px 0;">${d.alamat}</td>
      </tr>
    </table>

    <div style="margin-bottom: 12px; text-indent: 0px;">
      Adalah benar siap menerima siswa tersebut diatas sebagai peserta didik di ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar pada Tahun Pelajaran <strong>${d.tahunAjaran}</strong> Semester <strong>${d.semester}</strong>.
    </div>

    <div style="margin-bottom: 24px; text-indent: 0px;">
      Demikian surat keterangan ini kami buat untuk digunakan sebagaimana mestinya.
    </div>

    <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
      <div style="width: 300px; text-align: left;">
        <div>${d.kota}, ${d.tanggalSurat}</div>
        <div style="font-weight: bold; margin-bottom: 4px;">${kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II'}</div>
        <div style="height: 60px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${kop.kepsekNama || 'KURNIATI, S.Pd., M.Pd.'}</div>
        <div>NIP. ${kop.kepsekNip || '19811208 200801 2 007'}</div>
      </div>
    </div>
  </div>
  `
}

// -------------------------------------------------------------
// 3. SURAT PINDAH SEKOLAH - HTML GENERATION
// -------------------------------------------------------------
export function getSuratPindahHtml(data, kop = DEFAULT_KOP_DATA) {
  const d = {
    nomor: data?.nomor || '421.2/      /UPTD.SPF.SD.I.T.II/SP/     /2026',
    nama: data?.nama || '................................................',
    nisNisn: data?.nisNisn || '................................................',
    kelas: data?.kelas || 'Kelas IV (Empat)',
    namaOrtu: data?.namaOrtu || '................................................',
    pekerjaanOrtu: data?.pekerjaanOrtu || 'Wiraswasta',
    sekolahTujuan: data?.sekolahTujuan || '................................................',
    kecamatanTujuan: data?.kecamatanTujuan || '....................',
    kabupatenTujuan: data?.kabupatenTujuan || '....................',
    provinsiTujuan: data?.provinsiTujuan || 'Sulawesi Selatan',
    alasan: data?.alasan || 'mengikuti orang tua',
    tanggalSurat: data?.tanggalSurat || '....................',
    kota: data?.kota || kop.kota || 'Makassar',
    // Data form balasan
    nssTujuan: data?.nssTujuan || '              ',
  }

  return `
  <div class="surat-paper" style="font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; color: #000; text-align: justify; max-width: 750px; margin: 0 auto; background: #fff; padding: 10px;">
    ${renderKopSuratHtml(kop)}
    
    <div style="text-align: center; margin-bottom: 14px;">
      <div style="font-size: 13.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 0.5px;">SURAT PINDAH</div>
      <div style="font-size: 10.5pt; margin-top: 2px;">Nomor : ${d.nomor}</div>
    </div>

    <div style="margin-bottom: 8px;">
      Yang bertanda tangan di bawah ini Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar Provinsi Sulawesi Selatan, dengan ini menerangkan bahwa :
    </div>

    <table style="width: 95%; border-collapse: collapse; margin-left: 20px; margin-bottom: 10px; font-size: 11pt;">
      <tr>
        <td style="width: 170px; vertical-align: top; padding: 1.5px 0;">Nama</td>
        <td style="width: 15px; vertical-align: top; padding: 1.5px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 1.5px 0;">${d.nama}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 1.5px 0;">NIS/NISN</td>
        <td style="vertical-align: top; padding: 1.5px 0;">:</td>
        <td style="vertical-align: top; padding: 1.5px 0;">${d.nisNisn}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 1.5px 0;">Kelas/Tingkat</td>
        <td style="vertical-align: top; padding: 1.5px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 1.5px 0;">${d.kelas}</td>
      </tr>
    </table>

    <div style="margin-bottom: 6px;">
      Sesuai permohonan pindah sekolah oleh orang tua /wali :
    </div>

    <table style="width: 95%; border-collapse: collapse; margin-left: 20px; margin-bottom: 10px; font-size: 11pt;">
      <tr>
        <td style="width: 170px; vertical-align: top; padding: 1.5px 0;">Nama</td>
        <td style="width: 15px; vertical-align: top; padding: 1.5px 0;">:</td>
        <td style="vertical-align: top; font-weight: bold; padding: 1.5px 0;">${d.namaOrtu}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 1.5px 0;">Pekerjaan</td>
        <td style="vertical-align: top; padding: 1.5px 0;">:</td>
        <td style="vertical-align: top; padding: 1.5px 0;">${d.pekerjaanOrtu}</td>
      </tr>
    </table>

    <div style="margin-bottom: 12px; text-indent: 0px;">
      Telah mengajukan pindah ke salah satu Sekolah Dasar <strong>${d.sekolahTujuan}</strong> Kecamatan <strong>${d.kecamatanTujuan}</strong>, Kabupaten/Kota <strong>${d.kabupatenTujuan}</strong>, Provinsi <strong>${d.provinsiTujuan}</strong> dengan alasan <em>${d.alasan}</em>. Bersama ini kami sertakan buku Laporan Pendidikan (Raport) yang bersangkutan.
    </div>

    <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
      <div style="width: 300px; text-align: left;">
        <div>${d.kota}, ${d.tanggalSurat}</div>
        <div style="font-weight: bold; margin-bottom: 4px;">Kepala ${kop.sekolah || 'UPTD SPF SDI TANGKALA II'}</div>
        <div style="height: 50px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${kop.kepsekNama || 'KURNIATI, S.Pd., M.Pd.'}</div>
        <div>NIP. ${kop.kepsekNip || '19811208 200801 2 007'}</div>
      </div>
    </div>

    <!-- Bagian Surat Balasan Sekolah Baru -->
    <div style="border-top: 1px dashed #444; padding-top: 10px; margin-top: 8px;">
      <div style="font-size: 9.5pt; font-style: italic; margin-bottom: 8px; text-align: center;">
        Setelah anak tersebut di terima di sekolah ini, isian dibawah ini harap diisi dan lembaran kedua dikirim kepada kami.
      </div>

      <div style="display: flex; align-items: center; justify-content: flex-start; margin-bottom: 8px; font-size: 10pt;">
        <span style="font-weight: bold; margin-right: 12px;">NOMOR STATISTIK SEKOLAH</span>
        <div style="display: inline-flex; border: 1px solid #000;">
          ${Array(12).fill(0).map(() => `<span style="display: inline-block; width: 18px; height: 18px; border-right: 1px solid #000; text-align: center; font-size: 9pt;">&nbsp;</span>`).join('')}
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.35;">
        <tr>
          <td style="width: 140px;">Nama Siswa</td>
          <td style="width: 10px;">:</td>
          <td>${d.nama}</td>
          <td style="width: 120px;">Diterima Tanggal</td>
          <td style="width: 10px;">:</td>
          <td>..................................</td>
        </tr>
        <tr>
          <td>Nama Sekolah</td>
          <td>:</td>
          <td>${d.sekolahTujuan}</td>
          <td>Ditingkat</td>
          <td>:</td>
          <td>..................................</td>
        </tr>
        <tr>
          <td>Status Sekolah</td>
          <td>:</td>
          <td>Negeri / Swasta</td>
          <td colspan="3" rowspan="4" style="vertical-align: top; padding-top: 8px;">
            <div style="text-align: center;">
              <div>Kepala Sekolah,</div>
              <div style="height: 40px;"></div>
              <div>( .................................................. )</div>
              <div>NIP. .........................................</div>
            </div>
          </td>
        </tr>
        <tr>
          <td>Alamat Sekolah</td>
          <td>:</td>
          <td>..............................................</td>
        </tr>
        <tr>
          <td>Kecamatan</td>
          <td>:</td>
          <td>${d.kecamatanTujuan}</td>
        </tr>
        <tr>
          <td>Kab./ Kota & Propinsi</td>
          <td>:</td>
          <td>${d.kabupatenTujuan}, ${d.provinsiTujuan}</td>
        </tr>
      </table>
    </div>
  </div>
  `
}

// -------------------------------------------------------------
// 4. FORMAT SPPD (SURAT PERINTAH PERJALANAN DINAS) - HTML GENERATION
// -------------------------------------------------------------
export function getSppdHtml(data, kop = DEFAULT_KOP_DATA) {
  const d = {
    nomor: data?.nomor || '421.2/      / UPTD.SPF.SD.I.T.II/SPPD/        /2026',
    pejabatPemberi: data?.pejabatPemberi || `Kepala sekolah ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'}`,
    pegawaiNama: data?.pegawaiNama || '........................................',
    pegawaiNip: data?.pegawaiNip || '........................................',
    pangkatGol: data?.pangkatGol || 'Penata Muda Tk. I / III/b',
    jabatan: data?.jabatan || 'Guru Kelas',
    instansi: data?.instansi || kop.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    maksudPerjalanan: data?.maksudPerjalanan || 'Mengikuti kegiatan Pelatihan Kurikulum dan Peningkatan Rapor Pendidikan Jenjang SD',
    alatAngkut: data?.alatAngkut || 'Kendaraan Pribadi Roda Dua',
    tempatBerangkat: data?.tempatBerangkat || kop.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    tempatTujuan: data?.tempatTujuan || 'Hotel Melia Makassar',
    lamaPerjalanan: data?.lamaPerjalanan || '1 (Satu)',
    tanggalBerangkat: data?.tanggalBerangkat || '....................',
    tanggalKembali: data?.tanggalKembali || '....................',
    pengikut: data?.pengikut || '-',
    pembebananInstansi: data?.pembebananInstansi || kop.sekolah || 'UPTD SPF SD Inpres Tangkala II',
    pembebananMak: data?.pembebananMak || 'Anggaran Sekolah (BOS)',
    keteranganLain: data?.keteranganLain || 'Surat tugas ini diberikan dan dipergunakan sebagaimana mestinya',
    dikeluarkanDi: data?.dikeluarkanDi || kop.kota || 'Makassar',
    tanggalSurat: data?.tanggalSurat || '....................',
  }

  return `
  <div class="surat-paper" style="font-family: 'Times New Roman', Times, serif; font-size: 10.5pt; line-height: 1.35; color: #000; text-align: justify; max-width: 750px; margin: 0 auto; background: #fff; padding: 10px;">
    ${renderKopSuratHtml(kop)}
    
    <div style="text-align: center; margin-bottom: 12px;">
      <div style="font-size: 12.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 0.5px;">SURAT PERINTAH PERJALANAN DINAS (SPPD)</div>
      <div style="font-size: 10.5pt; margin-top: 2px;">Nomor : ${d.nomor}</div>
    </div>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10pt; border: 1px solid #000;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="border: 1px solid #000; width: 35px; padding: 4px; text-align: center;">No.</th>
          <th style="border: 1px solid #000; width: 320px; padding: 4px; text-align: left;">Rincian Isian SPPD</th>
          <th style="border: 1px solid #000; padding: 4px; text-align: left;">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">1.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Pejabat berwenang yang memberi perintah</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px; font-weight: bold;">${d.pejabatPemberi}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">2.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Nama / NIP Pegawai yang diperintahkan</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            <strong>${d.pegawaiNama}</strong><br/>
            NIP. ${d.pegawaiNip || '-'}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">3.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. Pangkat dan golongan ruang<br/>
            b. Jabatan<br/>
            c. Instansi
          </td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. ${d.pangkatGol}<br/>
            b. ${d.jabatan}<br/>
            c. ${d.instansi}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">4.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Maksud perjalanan dinas</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">${d.maksudPerjalanan}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">5.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Alat angkutan yang dipergunakan</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">${d.alatAngkut}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">6.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. Tempat berangkat<br/>
            b. Tempat tujuan
          </td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. ${d.tempatBerangkat}<br/>
            b. <strong>${d.tempatTujuan}</strong>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">7.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. Lamanya perjalanan dinas<br/>
            b. Tanggal berangkat<br/>
            c. Tanggal harus kembali
          </td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            a. ${d.lamaPerjalanan} hari<br/>
            b. ${d.tanggalBerangkat}<br/>
            c. ${d.tanggalKembali}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">8.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Pengikut : Nama / Tanggal Lahir / Keterangan</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">${d.pengikut}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">9.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            Pembebanan Anggaran :<br/>
            a. Instansi<br/>
            b. Fungsi/Subfungsi/Program/Kegiatan MAK
          </td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">
            <br/>
            a. ${d.pembebananInstansi}<br/>
            b. ${d.pembebananMak}
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; text-align: center; vertical-align: top; padding: 4px;">10.</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">Keterangan lain-lain</td>
          <td style="border: 1px solid #000; vertical-align: top; padding: 4px;">${d.keteranganLain}</td>
        </tr>
      </tbody>
    </table>

    <div style="display: flex; justify-content: flex-end; margin-top: 14px; margin-bottom: 24px;">
      <div style="width: 280px; text-align: left; font-size: 10.5pt;">
        <div>Dikeluarkan di : ${d.dikeluarkanDi}</div>
        <div style="margin-bottom: 4px;">Pada tanggal : ${d.tanggalSurat}</div>
        <div style="font-weight: bold;">${kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II'}</div>
        <div style="height: 50px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${kop.kepsekNama || 'KURNIATI, S.Pd., M.Pd'}</div>
        <div>NIP. ${kop.kepsekNip || '19811208 200801 2 007'}</div>
      </div>
    </div>

    <!-- Lembar Halaman Belakang / Pengesahan Singgah & Berangkat SPPD -->
    <div style="page-break-before: always; border-top: 1px dashed #777; padding-top: 14px; margin-top: 20px;">
      <div style="font-size: 11pt; font-weight: bold; text-align: center; margin-bottom: 10px; text-decoration: underline;">
        LEMBAR PENGESAHAN PERJALANAN DINAS
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 9.5pt; border: 1px solid #000;">
        <tr>
          <td style="border: 1px solid #000; width: 50%; padding: 6px; vertical-align: top;">
            &nbsp;
          </td>
          <td style="border: 1px solid #000; width: 50%; padding: 6px; vertical-align: top;">
            Berangkat dari : ${d.tempatBerangkat}<br/>
            Ke : ${d.tempatTujuan}<br/>
            Pada Tanggal : ${d.tanggalBerangkat}<br/>
            <div style="margin-top: 8px; text-align: center;">
              Pihak yang bersangkutan,<br/>
              <div style="height: 40px;"></div>
              <strong>${d.pegawaiNama}</strong><br/>
              NIP. ${d.pegawaiNip || '-'}
            </div>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px; vertical-align: top;">
            Tiba di : ${d.tempatTujuan}<br/>
            Pada Tanggal : ${d.tanggalBerangkat}<br/>
            <div style="margin-top: 8px; text-align: center;">
              Pihak penyelenggara / Pejabat Setempat,<br/>
              <div style="height: 40px;"></div>
              ( .................................................. )<br/>
              NIP. .........................................
            </div>
          </td>
          <td style="border: 1px solid #000; padding: 6px; vertical-align: top;">
            Berangkat dari : ${d.tempatTujuan}<br/>
            Ke : ${d.tempatBerangkat}<br/>
            Pada Tanggal : ${d.tanggalKembali}<br/>
            <div style="margin-top: 8px; text-align: center;">
              Pihak penyelenggara / Pejabat Setempat,<br/>
              <div style="height: 40px;"></div>
              ( .................................................. )<br/>
              NIP. .........................................
            </div>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid #000; padding: 6px; vertical-align: top;">
            Tiba di : ${d.tempatBerangkat}<br/>
            Pada Tanggal : ${d.tanggalKembali}<br/>
            <div style="margin-top: 8px; text-align: center;">
              Pihak yang bersangkutan,<br/>
              <div style="height: 40px;"></div>
              <strong>${d.pegawaiNama}</strong><br/>
              NIP. ${d.pegawaiNip || '-'}
            </div>
          </td>
          <td style="border: 1px solid #000; padding: 6px; vertical-align: top;">
            Telah diperiksa dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.<br/><br/>
            <div style="text-align: center;">
              Pejabat Pembuat Komitmen,<br/>
              <div style="height: 40px;"></div>
              ( .................................................. )<br/>
              NIP. .........................................
            </div>
          </td>
        </tr>
      </table>

      <div style="font-size: 8pt; font-style: italic; margin-top: 8px; line-height: 1.25; color: #333;">
        Perhatian: Pejabat yang berwenang menerbitkan SPPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba serta bendaharawan bertanggung jawab berdasarkan peraturan-peraturan keuangan negara apabila negara menderita rugi akibat kesalahan, kelalaian dan kealpaan. (angka 8 lampiran surat Menteri Keuangan tanggal 30 April 1974 Nomor : B.296/MK/1/4/1974).
      </div>
    </div>
  </div>
  `
}

// -------------------------------------------------------------
// EXPORT WORD HTML (.DOC)
// -------------------------------------------------------------
export function exportToWordDoc(htmlBody, title = 'Dokumen_Resmi') {
  const fullHtml = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset='utf-8'>
    <title>${title}</title>
    <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
      @page {
        size: 21.0cm 29.7cm; /* A4 */
        margin: 2.0cm 2.0cm 2.0cm 2.0cm;
        mso-page-orientation: portrait;
      }
      body {
        font-family: 'Times New Roman', Times, serif;
        font-size: 11pt;
        line-height: 1.35;
        color: #000000;
      }
      table {
        border-collapse: collapse;
      }
    </style>
  </head>
  <body>
    ${htmlBody}
  </body>
  </html>
  `

  const blob = new Blob(['\ufeff', fullHtml], {
    type: 'application/msword;charset=utf-8'
  })
  saveAs(blob, `${title}.doc`)
}

// -------------------------------------------------------------
// PRINT KE PDF / BROWSER PRINT DIALOG
// -------------------------------------------------------------
export function printDocument(htmlBody, title = 'Dokumen_Resmi') {
  const printWindow = window.open('', '_blank', 'width=850,height=1000')
  if (!printWindow) {
    alert('Pop-up jendela cetak diblokir browser. Izinkan pop-up untuk mencetak atau simpan sebagai PDF.')
    return
  }

  const printHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 1.5cm 1.5cm 1.5cm 1.5cm;
      }
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        font-family: 'Times New Roman', Times, serif;
        color: #000000;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @media print {
        body {
          margin: 0;
          padding: 0;
        }
        .no-print {
          display: none !important;
        }
      }
    </style>
  </head>
  <body>
    ${htmlBody}
    <script>
      window.onload = function() {
        setTimeout(function() {
          window.focus();
          window.print();
          // window.close();
        }, 400);
      };
    </script>
  </body>
  </html>
  `

  printWindow.document.open()
  printWindow.document.write(printHtml)
  printWindow.document.close()
}

// -------------------------------------------------------------
// EXPORT PDF MENGGUNAKAN HTML2PDF (JIKA TERSEDIA)
// -------------------------------------------------------------
export async function exportToPdfDirect(elementIdOrHtml, title = 'Dokumen_Resmi') {
  try {
    const html2pdf = (await import('html2pdf.js')).default
    let element = null

    if (typeof elementIdOrHtml === 'string' && elementIdOrHtml.startsWith('<')) {
      const container = document.createElement('div')
      container.innerHTML = elementIdOrHtml
      container.style.position = 'absolute'
      container.style.left = '-9999px'
      container.style.top = '0'
      container.style.width = '750px'
      container.style.background = '#ffffff'
      document.body.appendChild(container)
      element = container
    } else {
      element = typeof elementIdOrHtml === 'string' ? document.getElementById(elementIdOrHtml) : elementIdOrHtml
    }

    if (!element) {
      throw new Error('Elemen dokumen tidak ditemukan')
    }

    const opt = {
      margin: [10, 15, 10, 15],
      filename: `${title}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }

    await html2pdf().set(opt).from(element).save()

    if (typeof elementIdOrHtml === 'string' && elementIdOrHtml.startsWith('<') && element.parentNode) {
      document.body.removeChild(element)
    }
  } catch (err) {
    console.error('HTML2PDF Error, fallback ke print window:', err)
    // Fallback otomatis ke printDocument
    printDocument(elementIdOrHtml, title)
  }
}
