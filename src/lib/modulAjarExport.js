// ==============================================================================
// MODUL AJAR EXPORT UTILITY - WORD (.DOC) & PRINT TO PDF
// Menghasilkan dokumen format resmi Rencana Pembelajaran Mendalam (RPM) Deep Learning
// ==============================================================================

import { saveAs } from 'file-saver'

/**
 * Ekspor dokumen Modul Ajar ke format Microsoft Word (.doc)
 * Format HTML Word didukung penuh oleh MS Word, WPS Office, dan Google Docs dengan mempertahankan styling tabel & layout.
 */
export function exportModulAjarToWord(modul) {
  if (!modul) return

  const m = modul
  const iden = m.identifikasi || {}
  const dpl = m.profilLulusan || []
  const dp = m.desainPembelajaran || {}
  const pb = m.pengalamanBelajar || []
  const ases = m.asesmen || {}
  const mat = m.materiAjar || {}
  const lkpd = m.lkpd || []
  const tindak = m.tindakLanjutRefleksi || {}
  const sah = m.pengesahan || {}

  const htmlContent = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>${m.judul || 'Modul Ajar Deep Learning'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 2cm 2cm 2cm 2cm;
      mso-page-orientation: portrait;
    }
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
    }
    h1 {
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 16px;
      margin-bottom: 6px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
    }
    h3 {
      font-size: 11pt;
      font-weight: bold;
      margin-top: 10px;
      margin-bottom: 4px;
    }
    p {
      margin-top: 2px;
      margin-bottom: 4px;
      text-align: justify;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      margin-bottom: 10px;
      font-size: 10pt;
    }
    th, td {
      border: 1px solid #000;
      padding: 6px 8px;
      vertical-align: top;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
      text-align: left;
    }
    .table-clean td {
      border: none;
      padding: 3px 6px;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      background: #e2e8f0;
      border-radius: 4px;
      font-weight: bold;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>

  <!-- JUDUL DOKUMEN -->
  <h1>${m.judul || 'RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA - DEEP LEARNING'}</h1>
  <p style="text-align: center; font-weight: bold; margin-bottom: 20px;">
    ${iden.mataPelajaran || ''} • ${iden.kelasFase || ''} • ${iden.tahunPelajaran || ''}
  </p>

  <!-- A. IDENTIFIKASI -->
  <h2>A. IDENTIFIKASI</h2>
  <table class="table-clean" style="margin-bottom: 12px;">
    <tr><td style="width: 25%; font-weight: bold;">Penyusun</td><td style="width: 2%;">:</td><td>${iden.penyusun || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Satuan Pendidikan</td><td>:</td><td>${iden.sekolah || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Tahun Pelajaran</td><td>:</td><td>${iden.tahunPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Semester</td><td>:</td><td>${iden.semester || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Mata Pelajaran</td><td>:</td><td>${iden.mataPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Kelas / Fase</td><td>:</td><td>${iden.kelasFase || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Topik / Elemen</td><td>:</td><td>${iden.topikElemen || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Alokasi Waktu</td><td>:</td><td>${iden.alokasiWaktu || '-'}</td></tr>
  </table>

  <h3>Pengetahuan Awal</h3>
  <ul>
    ${(iden.pengetahuanAwal || []).map(p => `<li>${p}</li>`).join('')}
  </ul>

  <h3>Minat Belajar</h3>
  <ul>
    ${(iden.minatBelajar || []).map(m => `<li>${m}</li>`).join('')}
  </ul>

  <h3>Latar Belakang</h3>
  <p>${iden.latarBelakang || '-'}</p>

  <h3>Kebutuhan Belajar</h3>
  <ul>
    <li><strong>Visual:</strong> ${iden.kebutuhanBelajar?.visual || '-'}</li>
    <li><strong>Kinestetik:</strong> ${iden.kebutuhanBelajar?.kinestetik || '-'}</li>
    <li><strong>Audio:</strong> ${iden.kebutuhanBelajar?.audio || '-'}</li>
    <li><strong>Pendampingan Khusus:</strong> ${iden.kebutuhanBelajar?.pendampinganKhusus || '-'}</li>
  </ul>

  <!-- B. DIMENSI PROFIL LULUSAN -->
  <h2>B. IDENTIFIKASI DIMENSI PROFIL KELULUSAN (DPL)</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Dimensi Profil Lulusan</th>
        <th>Deskripsi Penerapan dalam Materi</th>
      </tr>
    </thead>
    <tbody>
      ${dpl.map(item => `
        <tr>
          <td><strong>${item.dimensi}</strong></td>
          <td>${item.deskripsi}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- C. DESAIN PEMBELAJARAN -->
  <h2>C. DESAIN PEMBELAJARAN</h2>
  <h3>Capaian Pembelajaran</h3>
  <p>${dp.capaianPembelajaran || '-'}</p>

  <h3>Tujuan Pembelajaran</h3>
  <ol>
    ${(dp.tujuanPembelajaran || []).map(tp => `<li>${tp}</li>`).join('')}
  </ol>

  <h3>Lintas Disiplin Ilmu</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Mata Pelajaran Terkait</th>
        <th>Uraian Integrasi Materi</th>
      </tr>
    </thead>
    <tbody>
      ${(dp.lintasDisiplinIlmu || []).map(l => `
        <tr>
          <td><strong>${l.mapel}</strong></td>
          <td>${l.uraian}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3>Praktik Pedagogi</h3>
  <table class="table-clean">
    <tr><td style="width: 20%; font-weight: bold;">Model</td><td style="width: 2%;">:</td><td>${dp.praktikPedagogi?.model || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Pendekatan</td><td>:</td><td>${dp.praktikPedagogi?.pendekatan || 'Deep Learning (Berkesadaran, Bermakna, Menggembirakan)'}</td></tr>
    <tr><td style="font-weight: bold;">Metode</td><td>:</td><td>${dp.praktikPedagogi?.metode || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Strategi</td><td>:</td><td>${dp.praktikPedagogi?.strategi || '-'}</td></tr>
  </table>

  <h3>Lingkungan Belajar</h3>
  <ul>
    <li><strong>Ruang Fisik:</strong> ${dp.lingkunganBelajar?.ruangFisik || '-'}</li>
    <li><strong>Platform Virtual:</strong> ${dp.lingkunganBelajar?.platformVirtual || '-'}</li>
    <li><strong>Budaya Belajar:</strong> ${dp.lingkunganBelajar?.budayaBelajar || '-'}</li>
    <li><strong>Sumber Belajar:</strong> ${dp.lingkunganBelajar?.sumberBelajar || '-'}</li>
  </ul>

  <h3>Pemanfaatan Digital</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 35%;">Alat / Platform Digital</th>
        <th>Kegunaan dalam Pembelajaran</th>
      </tr>
    </thead>
    <tbody>
      ${(dp.pemanfaatanDigital || []).map(p => `
        <tr>
          <td><strong>${p.alat}</strong></td>
          <td>${p.kegunaan}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- D. PENGALAMAN BELAJAR -->
  <div class="page-break"></div>
  <h2>D. PENGALAMAN BELAJAR (SKENARIO PEMBELAJARAN)</h2>
  ${pb.map(sesi => `
    <div style="margin-bottom: 20px;">
      <h3>${sesi.label || `Sesi ${sesi.sesi}`} : ${sesi.topik || ''} (Durasi: ${sesi.durasi || '3 × 35 Menit'})</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 22%;">Tahapan Kegiatan</th>
            <th style="width: 58%;">Deskripsi Kegiatan Pembelajaran</th>
            <th style="width: 20%;">Waktu & Prinsip</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>KEGIATAN PEMBUKA</strong></td>
            <td>${sesi.pembuka?.deskripsi || '-'}</td>
            <td>${sesi.pembuka?.waktuPrinsip || '10 Menit | Bermakna'}</td>
          </tr>
          <tr>
            <td><strong>KEGIATAN INTI</strong></td>
            <td>
              <p><strong>1. Memahami (Orientasi Masalah):</strong><br>${sesi.inti?.memahami || '-'}</p>
              <p><strong>2. Mengaplikasikan (Penyelidikan & Karya):</strong><br>${sesi.inti?.mengaplikasikan || '-'}</p>
              <p><strong>3. Merefleksikan (Evaluasi & Refleksi):</strong><br>${sesi.inti?.merefleksikan || '-'}</p>
            </td>
            <td>${sesi.inti?.waktuPrinsip || '85 Menit | Bermakna, Menggembirakan, Berkesadaran'}</td>
          </tr>
          <tr>
            <td><strong>KEGIATAN PENUTUP</strong></td>
            <td>${sesi.penutup?.deskripsi || '-'}</td>
            <td>${sesi.penutup?.waktuPrinsip || '10 Menit | Berkesadaran'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join('')}

  <!-- E. PENILAIAN / ASESMEN -->
  <h2>E. PENILAIAN / ASESMEN</h2>
  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Jenis Asesmen</th>
        <th style="width: 45%;">Bentuk & Instrumen</th>
        <th style="width: 25%;">Waktu Pelaksanaan</th>
      </tr>
    </thead>
    <tbody>
      ${(ases.tabelJenis || []).map(t => `
        <tr>
          <td><strong>${t.jenis}</strong></td>
          <td>${t.instrumen}</td>
          <td>${t.waktu}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- LAMPIRAN ASESMEN -->
  <h3>Lampiran Asesmen Awal (Diagnostik)</h3>
  <ul>
    ${(ases.lampiranAsesmenAwal || []).map(a => `
      <li><strong>Pertanyaan:</strong> "${a.soal}"<br><em>Harapan Jawaban:</em> ${a.harapanJawaban}</li>
    `).join('')}
  </ul>

  <h3>Rubrik Penilaian Sikap</h3>
  <table>
    <thead>
      <tr>
        <th>Aspek Sikap</th>
        <th>Skor 4 (Sangat Baik)</th>
        <th>Skor 3 (Baik)</th>
        <th>Skor 2 (Cukup)</th>
        <th>Skor 1 (Perlu Bimbingan)</th>
      </tr>
    </thead>
    <tbody>
      ${(ases.rubrikSikap || []).map(r => `
        <tr>
          <td><strong>${r.aspek}</strong></td>
          <td>${r.skor4}</td>
          <td>${r.skor3}</td>
          <td>${r.skor2}</td>
          <td>${r.skor1}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3>Soal Asesmen Sumatif (Uraian HOTS)</h3>
  <ol>
    ${(ases.soalSumatifHots || []).map(s => `
      <li style="margin-bottom: 8px;">
        <strong>${s.soal}</strong><br>
        <em>Kunci Jawaban & Rubrik:</em> ${s.kunciJawaban}
      </li>
    `).join('')}
  </ol>

  <!-- LAMPIRAN MATERI AJAR -->
  <div class="page-break"></div>
  <h2>LAMPIRAN MATERI AJAR</h2>
  <p>${mat.pendahuluan || ''}</p>
  ${(mat.poinPenting || []).map(p => `
    <h3>${p.subjudul}</h3>
    <p>${p.uraian}</p>
  `).join('')}
  <p><strong>Rangkuman:</strong> ${mat.rangkuman || ''}</p>

  <!-- LAMPIRAN LKPD -->
  <div class="page-break"></div>
  <h2>LAMPIRAN LEMBAR KERJA PESERTA DIDIK (LKPD)</h2>
  ${lkpd.map(item => `
    <div style="border: 1px solid #000; padding: 12px; margin-bottom: 16px;">
      <h3 style="text-align: center; margin-top: 0;">${item.judul}</h3>
      <p style="text-align: center; font-size: 9pt;"><em>Sintaks: ${item.sintaksPbl || '-'}</em></p>
      <hr>
      <p><strong>Nama Siswa:</strong> ______________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Kelas:</strong> ________</p>
      <p><strong>A. Stimulus & Pemahaman:</strong><br>${item.kegiatanMemahami?.bacaanAtauStimulus || '-'}</p>
      <ol>
        ${(item.kegiatanMemahami?.pertanyaan || []).map(q => `<li>${q}</li>`).join('')}
      </ol>
      <p><strong>B. Petunjuk Kerja & Penugasan:</strong><br>${item.kegiatanMengaplikasikan?.petunjuk || '-'}</p>
      <p>${item.kegiatanMengaplikasikan?.tabelAtauTugas || '-'}</p>
      <p><strong>C. Rubrik Mandiri Siswa:</strong></p>
      <ul>
        ${(item.rubrikMandiri || []).map(rm => `<li>[ &nbsp; ] ${rm}</li>`).join('')}
      </ul>
    </div>
  `).join('')}

  <!-- TINDAK LANJUT & REFLEKSI -->
  <h2>TINDAK LANJUT DAN REFLEKSI</h2>
  <p><strong>Program Remedial:</strong> ${tindak.programRemedial || '-'}</p>
  <p><strong>Program Pengayaan:</strong> ${tindak.programPengayaan || '-'}</p>

  <h3>Refleksi Guru</h3>
  <ul>
    ${(tindak.refleksiGuru || []).map(rg => `<li>${rg}</li>`).join('')}
  </ul>

  <h3>Refleksi Siswa</h3>
  <ul>
    ${(tindak.refleksiSiswa || []).map(rs => `<li>${rs}</li>`).join('')}
  </ul>

  <!-- GLOSARIUM & DAFTAR PUSTAKA -->
  <h2>GLOSARIUM</h2>
  <table>
    <thead>
      <tr><th style="width: 30%;">Istilah</th><th>Definisi</th></tr>
    </thead>
    <tbody>
      ${(m.glosarium || []).map(g => `
        <tr><td><strong>${g.istilah}</strong></td><td>${g.definisi}</td></tr>
      `).join('')}
    </tbody>
  </table>

  <h2>DAFTAR PUSTAKA</h2>
  <ul>
    ${(m.daftarPustaka || []).map(dp => `<li>${dp}</li>`).join('')}
  </ul>

  <!-- PENGESAHAN -->
  <div style="margin-top: 40px; page-break-inside: avoid;">
    <table class="table-clean" style="width: 100%;">
      <tr>
        <td style="width: 50%; text-align: center;">
          Mengetahui,<br>
          Kepala Sekolah
          <br><br><br><br>
          <strong><u>${sah.kepalaSekolah?.nama || '( ........................................ )'}</u></strong><br>
          NIP. ${sah.kepalaSekolah?.nip || '...........................................'}
        </td>
        <td style="width: 50%; text-align: center;">
          ${sah.kota || 'Makassar'}, ${sah.tanggal || new Date().toLocaleDateString('id-ID')}<br>
          Guru Kelas / Pengampu
          <br><br><br><br>
          <strong><u>${sah.guru?.nama || iden.penyusun || '( ........................................ )'}</u></strong><br>
          NIP. ${sah.guru?.nip || '...........................................'}
        </td>
      </tr>
    </table>
  </div>

</body>
</html>
`

  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword'
  })
  const cleanFileName = `Modul_Ajar_${(iden.mataPelajaran || 'RPM').replace(/\s+/g, '_')}_${(iden.topikElemen || 'Bab1').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.doc`
  saveAs(blob, cleanFileName)
}

/**
 * Cetak Dokumen Modul Ajar (Print to PDF / Printer Fisik)
 */
export function printModulAjar(modul) {
  if (!modul) return

  const m = modul
  const iden = m.identifikasi || {}
  const dpl = m.profilLulusan || []
  const dp = m.desainPembelajaran || {}
  const pb = m.pengalamanBelajar || []
  const ases = m.asesmen || {}
  const mat = m.materiAjar || {}
  const lkpd = m.lkpd || []
  const tindak = m.tindakLanjutRefleksi || {}
  const sah = m.pengesahan || {}

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Pop-up jendela cetak diblokir oleh browser. Silakan izinkan pop-up untuk mencetak.')
    return
  }

  const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${m.judul || 'Cetak Modul Ajar Deep Learning'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.5cm;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #111;
      padding: 0;
      margin: 0;
    }
    .header-box {
      text-align: center;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 13pt;
      font-weight: bold;
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    h2 {
      font-size: 11.5pt;
      font-weight: bold;
      margin-top: 18px;
      margin-bottom: 6px;
      background: #f1f5f9;
      padding: 4px 8px;
      border-left: 4px solid #3b82f6;
    }
    h3 {
      font-size: 10.5pt;
      font-weight: bold;
      margin-top: 10px;
      margin-bottom: 4px;
    }
    p {
      margin: 3px 0;
      text-align: justify;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 9.5pt;
    }
    th, td {
      border: 1px solid #333;
      padding: 5px 8px;
      vertical-align: top;
    }
    th {
      background-color: #f8fafc;
      font-weight: bold;
      text-align: left;
    }
    .table-info td {
      border: none;
      padding: 2px 4px;
    }
    ul, ol {
      margin: 4px 0;
      padding-left: 20px;
    }
    li {
      margin-bottom: 2px;
    }
    .page-break {
      page-break-before: always;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header-box">
    <h1>${m.judul || 'RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA'}</h1>
    <div style="font-weight: bold; font-size: 11pt; color: #1e293b;">
      ${iden.sekolah || 'SATUAN PENDIDIKAN'}
    </div>
    <div style="font-size: 9.5pt; color: #475569;">
      ${iden.mataPelajaran || ''} • ${iden.kelasFase || ''} • Tahun Pelajaran ${iden.tahunPelajaran || ''} • Semester ${iden.semester || ''}
    </div>
  </div>

  <h2>A. IDENTIFIKASI PEMBELAJARAN</h2>
  <table class="table-info">
    <tr><td style="width: 25%; font-weight: bold;">Penyusun</td><td style="width: 2%;">:</td><td>${iden.penyusun || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Satuan Pendidikan</td><td>:</td><td>${iden.sekolah || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Tahun Pelajaran</td><td>:</td><td>${iden.tahunPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Semester</td><td>:</td><td>${iden.semester || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Mata Pelajaran</td><td>:</td><td>${iden.mataPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Kelas / Fase</td><td>:</td><td>${iden.kelasFase || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Topik / Elemen</td><td>:</td><td>${iden.topikElemen || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Alokasi Waktu</td><td>:</td><td>${iden.alokasiWaktu || '-'}</td></tr>
  </table>

  <h3>Pengetahuan Awal</h3>
  <ul>${(iden.pengetahuanAwal || []).map(p => `<li>${p}</li>`).join('')}</ul>

  <h3>Minat Belajar</h3>
  <ul>${(iden.minatBelajar || []).map(mb => `<li>${mb}</li>`).join('')}</ul>

  <h3>Latar Belakang & Kebutuhan Belajar</h3>
  <p>${iden.latarBelakang || '-'}</p>
  <ul>
    <li><strong>Visual:</strong> ${iden.kebutuhanBelajar?.visual || '-'}</li>
    <li><strong>Kinestetik:</strong> ${iden.kebutuhanBelajar?.kinestetik || '-'}</li>
    <li><strong>Audio:</strong> ${iden.kebutuhanBelajar?.audio || '-'}</li>
    <li><strong>Pendampingan Khusus:</strong> ${iden.kebutuhanBelajar?.pendampinganKhusus || '-'}</li>
  </ul>

  <h2>B. DIMENSI PROFIL LULUSAN (DPL)</h2>
  <table>
    <thead><tr><th style="width: 30%;">Dimensi</th><th>Deskripsi Penerapan dalam Materi</th></tr></thead>
    <tbody>
      ${dpl.map(item => `<tr><td><strong>${item.dimensi}</strong></td><td>${item.deskripsi}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>C. DESAIN PEMBELAJARAN</h2>
  <h3>Capaian Pembelajaran</h3>
  <p>${dp.capaianPembelajaran || '-'}</p>

  <h3>Tujuan Pembelajaran</h3>
  <ol>${(dp.tujuanPembelajaran || []).map(tp => `<li>${tp}</li>`).join('')}</ol>

  <h3>Praktik Pedagogi & Lingkungan Belajar</h3>
  <table class="table-info">
    <tr><td style="width: 20%; font-weight: bold;">Model</td><td style="width: 2%;">:</td><td>${dp.praktikPedagogi?.model || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Pendekatan</td><td>:</td><td>${dp.praktikPedagogi?.pendekatan || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Metode</td><td>:</td><td>${dp.praktikPedagogi?.metode || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Strategi</td><td>:</td><td>${dp.praktikPedagogi?.strategi || '-'}</td></tr>
  </table>

  <div class="page-break"></div>
  <h2>D. PENGALAMAN BELAJAR (SKENARIO PEMBELAJARAN)</h2>
  ${pb.map(sesi => `
    <div style="margin-bottom: 14px;">
      <h3>${sesi.label || `Sesi ${sesi.sesi}`} : ${sesi.topik || ''} (${sesi.durasi || '3 × 35 Menit'})</h3>
      <table>
        <thead>
          <tr><th style="width: 22%;">Tahapan</th><th style="width: 58%;">Kegiatan Pembelajaran</th><th style="width: 20%;">Waktu & Prinsip</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>PEMBUKA</strong></td>
            <td>${sesi.pembuka?.deskripsi || '-'}</td>
            <td>${sesi.pembuka?.waktuPrinsip || '-'}</td>
          </tr>
          <tr>
            <td><strong>INTI</strong></td>
            <td>
              <p><strong>1. Memahami:</strong> ${sesi.inti?.memahami || '-'}</p>
              <p><strong>2. Mengaplikasikan:</strong> ${sesi.inti?.mengaplikasikan || '-'}</p>
              <p><strong>3. Merefleksikan:</strong> ${sesi.inti?.merefleksikan || '-'}</p>
            </td>
            <td>${sesi.inti?.waktuPrinsip || '-'}</td>
          </tr>
          <tr>
            <td><strong>PENUTUP</strong></td>
            <td>${sesi.penutup?.deskripsi || '-'}</td>
            <td>${sesi.penutup?.waktuPrinsip || '-'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join('')}

  <h2>E. PENILAIAN / ASESMEN</h2>
  <table>
    <thead><tr><th>Jenis Asesmen</th><th>Bentuk & Instrumen</th><th>Waktu</th></tr></thead>
    <tbody>
      ${(ases.tabelJenis || []).map(t => `<tr><td><strong>${t.jenis}</strong></td><td>${t.instrumen}</td><td>${t.waktu}</td></tr>`).join('')}
    </tbody>
  </table>

  <h3>Rubrik Penilaian Sikap</h3>
  <table>
    <thead><tr><th>Aspek</th><th>Skor 4</th><th>Skor 3</th><th>Skor 2</th><th>Skor 1</th></tr></thead>
    <tbody>
      ${(ases.rubrikSikap || []).map(r => `<tr><td><strong>${r.aspek}</strong></td><td>${r.skor4}</td><td>${r.skor3}</td><td>${r.skor2}</td><td>${r.skor1}</td></tr>`).join('')}
    </tbody>
  </table>

  <h3>Asesmen Sumatif (Soal HOTS)</h3>
  <ol>
    ${(ases.soalSumatifHots || []).map(s => `<li><strong>${s.soal}</strong><br><em>Kunci:</em> ${s.kunciJawaban}</li>`).join('')}
  </ol>

  <div class="page-break"></div>
  <h2>LAMPIRAN LEMBAR KERJA PESERTA DIDIK (LKPD)</h2>
  ${lkpd.map(item => `
    <div style="border: 1px solid #333; padding: 10px; margin-bottom: 12px;">
      <h3 style="text-align: center; margin-top: 0;">${item.judul}</h3>
      <p><strong>Stimulus:</strong> ${item.kegiatanMemahami?.bacaanAtauStimulus || '-'}</p>
      <ol>${(item.kegiatanMemahami?.pertanyaan || []).map(q => `<li>${q}</li>`).join('')}</ol>
      <p><strong>Tugas Aplikasi:</strong> ${item.kegiatanMengaplikasikan?.petunjuk || '-'}</p>
    </div>
  `).join('')}

  <div style="margin-top: 30px; page-break-inside: avoid;">
    <table class="table-info" style="width: 100%;">
      <tr>
        <td style="width: 50%; text-align: center;">
          Mengetahui,<br>Kepala Sekolah
          <br><br><br><br>
          <strong><u>${sah.kepalaSekolah?.nama || '( ........................................ )'}</u></strong><br>
          NIP. ${sah.kepalaSekolah?.nip || '...........................................'}
        </td>
        <td style="width: 50%; text-align: center;">
          ${sah.kota || 'Makassar'}, ${sah.tanggal || new Date().toLocaleDateString('id-ID')}<br>
          Guru Kelas / Pengampu
          <br><br><br><br>
          <strong><u>${sah.guru?.nama || iden.penyusun || '( ........................................ )'}</u></strong><br>
          NIP. ${sah.guru?.nip || '...........................................'}
        </td>
      </tr>
    </table>
  </div>

  <script>
    window.onload = function() {
      window.print();
    }
  </script>
</body>
</html>
`

  printWindow.document.open()
  printWindow.document.write(printHtml)
  printWindow.document.close()
}
