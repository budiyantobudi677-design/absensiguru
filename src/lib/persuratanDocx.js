import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, HeadingLevel } from 'docx'
import { saveAs } from 'file-saver'
import { DEFAULT_KOP_DATA, getActiveKopData } from './persuratanGenerator'

/**
 * Membuat Header Kop Surat Resmi dalam format DOCX murni
 */
function createDocxKop(kop = DEFAULT_KOP_DATA) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 40 },
      children: [
        new TextRun({ text: kop.instansiAtas || 'PEMERINTAH KOTA MAKASSAR', bold: true, size: 24, font: 'Times New Roman' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 40 },
      children: [
        new TextRun({ text: kop.dinas || 'DINAS PENDIDIKAN', bold: true, size: 24, font: 'Times New Roman' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after: 40 },
      children: [
        new TextRun({ text: kop.sekolah || 'UPTD SPF SD INPRES TANGKALA II', bold: true, size: 26, font: 'Times New Roman' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 220, after: 40 },
      children: [
        new TextRun({ text: kop.kelurahanKecamatan || 'KELURAHAN LAIKANG KECAMATAN BIRINGKANAYA', bold: true, size: 20, font: 'Times New Roman' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 220, after: 40 },
      children: [
        new TextRun({ text: kop.alamat || 'Jl. Pangkep Raya Perumnas Sudiang Makassar Kode Pos : 90242', italics: true, size: 19, font: 'Times New Roman' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 220, after: 140 },
      border: {
        bottom: {
          style: BorderStyle.DOUBLE,
          size: 18,
          color: '000000',
        },
      },
      children: [
        new TextRun({ text: `NSS : ${kop.nss || '101196012399'}          NPSN : ${kop.npsn || '40313269'}`, bold: true, size: 19, font: 'Times New Roman' }),
      ],
    }),
  ]
}

// 1. Ekspor Surat Tugas ke .docx
export async function exportSuratTugasDocx(data, kop = DEFAULT_KOP_DATA, filename = 'Surat_Tugas', returnBlob = false) {
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

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }, // 2cm
          },
        },
        children: [
          ...createDocxKop(kop),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 40 },
            children: [
              new TextRun({ text: 'SURAT TUGAS', bold: true, underline: {}, size: 26, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({ text: `Nomor : ${d.nomor}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 180 },
            children: [
              new TextRun({ text: 'Dasar : ', bold: true, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: `Berdasarkan Surat dari ${d.suratDari}, Nomor : ${d.suratNomor} Tanggal ${d.suratTanggal} perihal ${d.suratPerihal}, maka Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'};`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 180 },
            children: [
              new TextRun({ text: 'MENUGASKAN', bold: true, size: 24, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Kepada :', bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: 'Nama\t\t: ', size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.pegawaiNama, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          ...(d.pegawaiNip ? [
            new Paragraph({
              indent: { left: 720 },
              spacing: { after: 60 },
              children: [
                new TextRun({ text: `NIP\t\t: ${d.pegawaiNip}`, size: 22, font: 'Times New Roman' }),
              ],
            })
          ] : []),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 180 },
            children: [
              new TextRun({ text: `Jabatan\t: ${d.pegawaiJabatan}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Untuk :', bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            alignment: AlignmentType.BOTH,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: d.kegiatan, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 1080 },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `Hari / Tanggal\t: `, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.hariTanggal, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 1080 },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `Tempat\t\t: `, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.tempat, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 300 },
            children: [
              new TextRun({ text: 'Demikian Surat ini diberikan kepada yang bersangkutan untuk dipergunakan sebagaimana mestinya dan dengan penuh rasa tanggung jawab.', size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Dikeluarkan di: ${d.dikeluarkanDi}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Pada Tanggal: ${d.tanggalSurat}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 900 },
            children: [
              new TextRun({ text: kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II', bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: kop.kepsekNama || getActiveKopData().kepsekNama || '( ........................................ )', bold: true, underline: {}, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `NIP. ${kop.kepsekNip || getActiveKopData().kepsekNip || '...........................................'}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  if (returnBlob) return blob
  saveAs(blob, `${filename}.docx`)
}

// 2. Ekspor Surat Rekomendasi ke .docx
export async function exportSuratRekomendasiDocx(data, kop = DEFAULT_KOP_DATA, filename = 'Surat_Rekomendasi_Menerima', returnBlob = false) {
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

  const fields = [
    { label: 'N a m a', val: d.nama, bold: true },
    { label: 'Tempat/Tanggal Lahir', val: d.ttl },
    { label: 'NISN', val: d.nisn },
    { label: 'Jenis Kelamin', val: d.jk },
    { label: 'Agama', val: d.agama },
    { label: 'Asal Sekolah', val: d.asalSekolah },
    { label: 'Kelas', val: d.kelas, bold: true },
    { label: 'Nama Orang Tua/ Wali', val: d.namaOrtu },
    { label: 'Alamat', val: d.alamat },
  ]

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children: [
          ...createDocxKop(kop),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 40 },
            children: [
              new TextRun({ text: 'SURAT REKOMENDASI MENERIMA', bold: true, underline: {}, size: 26, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({ text: `Nomor : ${d.nomor}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 140 },
            children: [
              new TextRun({ text: `Yang bertanda tangan dibawah ini Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar menerangkan bahwa :`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          ...fields.map(f => new Paragraph({
            indent: { left: 720 },
            spacing: { after: 50 },
            children: [
              new TextRun({ text: `${f.label.padEnd(24, ' ')}: `, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: f.val, bold: !!f.bold, size: 22, font: 'Times New Roman' }),
            ],
          })),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { before: 140, after: 140 },
            children: [
              new TextRun({ text: `Adalah benar siap menerima siswa tersebut diatas sebagai peserta didik di ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar pada Tahun Pelajaran `, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.tahunAjaran, bold: true, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: ' Semester ', size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.semester, bold: true, size: 22, font: 'Times New Roman' }),
              new TextRun({ text: '.', size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 300 },
            children: [
              new TextRun({ text: 'Demikian surat keterangan ini kami buat untuk digunakan sebagaimana mestinya.', size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `${d.kota}, ${d.tanggalSurat}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 900 },
            children: [
              new TextRun({ text: kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II', bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: kop.kepsekNama || getActiveKopData().kepsekNama || '( ........................................ )', bold: true, underline: {}, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `NIP. ${kop.kepsekNip || getActiveKopData().kepsekNip || '...........................................'}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  if (returnBlob) return blob
  saveAs(blob, `${filename}.docx`)
}

// 3. Ekspor Surat Pindah ke .docx
export async function exportSuratPindahDocx(data, kop = DEFAULT_KOP_DATA, filename = 'Surat_Pindah_Sekolah', returnBlob = false) {
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
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children: [
          ...createDocxKop(kop),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 40 },
            children: [
              new TextRun({ text: 'SURAT PINDAH', bold: true, underline: {}, size: 26, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `Nomor : ${d.nomor}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 120 },
            children: [
              new TextRun({ text: `Yang bertanda tangan di bawah ini Kepala ${kop.sekolah || 'UPTD SPF SD Inpres Tangkala II'} Kecamatan Biringkanaya Kota Makassar Provinsi Sulawesi Selatan, dengan ini menerangkan bahwa :`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Nama\t\t\t: ', size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.nama, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `NIS/NISN\t\t: ${d.nisNisn}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Kelas/Tingkat\t: ', size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.kelas, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'Sesuai permohonan pindah sekolah oleh orang tua /wali :', size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: 'Nama\t\t\t: ', size: 22, font: 'Times New Roman' }),
              new TextRun({ text: d.namaOrtu, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            spacing: { after: 140 },
            children: [
              new TextRun({ text: `Pekerjaan\t\t: ${d.pekerjaanOrtu}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.BOTH,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `Telah mengajukan pindah ke salah satu Sekolah Dasar ${d.sekolahTujuan} Kecamatan ${d.kecamatanTujuan}, Kabupaten ${d.kabupatenTujuan}, Provinsi ${d.provinsiTujuan} dengan alasan ${d.alasan}. Bersama ini kami sertakan buku Laporan Pendidikan (Raport) yang bersangkutan.`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `${d.kota}, ${d.tanggalSurat}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 700 },
            children: [
              new TextRun({ text: `Kepala ${kop.sekolah || 'UPTD SPF SDI TANGKALA II'}`, bold: true, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: kop.kepsekNama || getActiveKopData().kepsekNama || '( ........................................ )', bold: true, underline: {}, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 200 },
            children: [
              new TextRun({ text: `NIP. ${kop.kepsekNip || getActiveKopData().kepsekNip || '...........................................'}`, size: 22, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
            border: {
              top: { style: BorderStyle.DASHED, size: 8, color: '888888' },
            },
            children: [
              new TextRun({ text: 'Setelah anak tersebut di terima di sekolah ini, isian dibawah ini harap diisi dan lembaran kedua dikirim kepada kami.', italics: true, size: 19, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: 'NOMOR STATISTIK SEKOLAH :  [   ][   ][   ][   ][   ][   ][   ][   ][   ][   ][   ][   ]', bold: true, size: 20, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Nama Siswa\t: ${d.nama}\t\t\tDiterima Tanggal: ........................`, size: 20, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Nama Sekolah\t: ${d.sekolahTujuan}\t\t\tDitingkat\t: ........................`, size: 20, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Status Sekolah\t: Negeri / Swasta\t\t\tKepala Sekolah,\nAlamat Sekolah: .......................................\t\nKecamatan\t: ${d.kecamatanTujuan}\t\t\t( .................................... )\nKab / Propinsi\t: ${d.kabupatenTujuan}, ${d.provinsiTujuan}\t\tNIP. ...............................`, size: 20, font: 'Times New Roman' }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  if (returnBlob) return blob
  saveAs(blob, `${filename}.docx`)
}

// 4. Ekspor SPPD ke .docx
export async function exportSppdDocx(data, kop = DEFAULT_KOP_DATA, filename = 'SPPD_Perjalanan_Dinas', returnBlob = false) {
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

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ width: { size: 500, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '1.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ width: { size: 4000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: 'Pejabat berwenang yang memberi perintah', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ width: { size: 4500, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: d.pejabatPemberi, bold: true, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '2.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Nama / NIP Pegawai yang diperintahkan', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [
          new Paragraph({ children: [new TextRun({ text: d.pegawaiNama, bold: true, size: 20, font: 'Times New Roman' })] }),
          new Paragraph({ children: [new TextRun({ text: `NIP. ${d.pegawaiNip || '-'}`, size: 20, font: 'Times New Roman' })] }),
        ] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '3.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [
          new Paragraph({ children: [new TextRun({ text: 'a. Pangkat dan golongan ruang\nb. Jabatan\nc. Instansi', size: 20, font: 'Times New Roman' })] }),
        ] }),
        new TableCell({ children: [
          new Paragraph({ children: [new TextRun({ text: `a. ${d.pangkatGol}\nb. ${d.jabatan}\nc. ${d.instansi}`, size: 20, font: 'Times New Roman' })] }),
        ] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '4.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Maksud perjalanan dinas', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.maksudPerjalanan, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '5.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Alat angkutan yang dipergunakan', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.alatAngkut, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '6.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'a. Tempat berangkat\nb. Tempat tujuan', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `a. ${d.tempatBerangkat}\nb. ${d.tempatTujuan}`, bold: true, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '7.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'a. Lamanya perjalanan dinas\nb. Tanggal berangkat\nc. Tanggal harus kembali', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `a. ${d.lamaPerjalanan} hari\nb. ${d.tanggalBerangkat}\nc. ${d.tanggalKembali}`, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '8.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Pengikut', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.pengikut, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '9.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Pembebanan Anggaran :\na. Instansi\nb. MAK', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `\na. ${d.pembebananInstansi}\nb. ${d.pembebananMak}`, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '10.', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Keterangan lain-lain', size: 20, font: 'Times New Roman' })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: d.keteranganLain, size: 20, font: 'Times New Roman' })] })] }),
      ],
    }),
  ]

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
        },
        children: [
          ...createDocxKop(kop),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 30 },
            children: [
              new TextRun({ text: 'SURAT PERINTAH PERJALANAN DINAS (SPPD)', bold: true, underline: {}, size: 24, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [
              new TextRun({ text: `Nomor : ${d.nomor}`, size: 21, font: 'Times New Roman' }),
            ],
          }),
          new Table({
            rows: tableRows,
            width: { size: 9000, type: WidthType.DXA },
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { before: 200, after: 40 },
            children: [
              new TextRun({ text: `Dikeluarkan di : ${d.dikeluarkanDi}`, size: 21, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `Pada tanggal : ${d.tanggalSurat}`, size: 21, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 700 },
            children: [
              new TextRun({ text: kop.kepsekJabatan || 'Kepala UPTD SPF SD Inpres Tangkala II', bold: true, size: 21, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: kop.kepsekNama || getActiveKopData().kepsekNama || '( ........................................ )', bold: true, underline: {}, size: 21, font: 'Times New Roman' }),
            ],
          }),
          new Paragraph({
            indent: { left: 5400 },
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `NIP. ${kop.kepsekNip || getActiveKopData().kepsekNip || '...........................................'}`, size: 21, font: 'Times New Roman' }),
            ],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  if (returnBlob) return blob
  saveAs(blob, `${filename}.docx`)
}

