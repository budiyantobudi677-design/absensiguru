// ==============================================================================
// MODUL AJAR EXPORT UTILITY - WORD (.DOC) & PRINT TO PDF
// Menghasilkan dokumen format resmi Rencana Pembelajaran Mendalam (RPM) Deep Learning
// ==============================================================================

import { saveAs } from 'file-saver'

/**
 * Ekspor dokumen Modul Ajar ke format Microsoft Word (.doc)
 * Format HTML Word didukung penuh oleh MS Word, WPS Office, dan Google Docs dengan tabel rapi, borders terstruktur, font konsisten, dan page breaks.
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
      margin: 2.5cm 2.0cm 2.0cm 2.0cm;
      mso-page-orientation: portrait;
      mso-header-margin: 35.4pt;
      mso-footer-margin: 35.4pt;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000000;
      margin: 0;
      padding: 0;
    }
    .header-kop {
      text-align: center;
      margin-bottom: 18px;
      border-bottom: 2px solid #000000;
      padding-bottom: 8px;
    }
    .header-title {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0 0 4px 0;
      letter-spacing: 0.5px;
    }
    .header-sub {
      font-size: 11pt;
      font-weight: bold;
      margin: 0 0 2px 0;
      text-transform: uppercase;
    }
    .header-meta {
      font-size: 10pt;
      color: #333333;
      margin: 0;
    }
    h2.section-header {
      font-size: 11.5pt;
      font-weight: bold;
      margin-top: 18px;
      margin-bottom: 6px;
      background-color: #E2E8F0;
      border: 1px solid #000000;
      padding: 5px 8px;
      text-transform: uppercase;
    }
    h3.sub-header {
      font-size: 11pt;
      font-weight: bold;
      margin-top: 12px;
      margin-bottom: 4px;
      color: #000000;
    }
    p {
      margin-top: 3px;
      margin-bottom: 5px;
      text-align: justify;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      margin-bottom: 12px;
      font-size: 10pt;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #000000;
      padding: 6px 8px;
      vertical-align: top;
    }
    table.data-table th {
      background-color: #F1F5F9;
      font-weight: bold;
      text-align: center;
    }
    table.info-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
      margin-bottom: 10px;
      font-size: 10.5pt;
    }
    table.info-table td {
      border: none;
      padding: 3px 5px;
      vertical-align: top;
    }
    .box-bordered {
      border: 1px solid #000000;
      padding: 10px 14px;
      margin-top: 8px;
      margin-bottom: 14px;
      background-color: #FFFFFF;
    }
    ul, ol {
      margin-top: 3px;
      margin-bottom: 6px;
      padding-left: 24px;
    }
    li {
      margin-bottom: 3px;
      text-align: justify;
    }
    .page-break {
      page-break-before: always;
      mso-break-type: page-break;
    }
    .signature-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 35px;
      font-size: 10.5pt;
      page-break-inside: avoid;
    }
    .signature-table td {
      border: none;
      vertical-align: top;
      text-align: center;
      padding: 6px;
    }
  </style>
</head>
<body>

  <!-- KOP & JUDUL DOKUMEN -->
  <div class="header-kop">
    <div class="header-title">${m.judul || 'RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA'}</div>
    <div class="header-sub">${iden.sekolah || 'SATUAN PENDIDIKAN'}</div>
    <div class="header-meta">
      Mata Pelajaran: <strong>${iden.mataPelajaran || '-'}</strong> | ${iden.kelasFase || 'Kelas 5 / Fase C'} | Tahun Pelajaran: <strong>${iden.tahunPelajaran || '2026/2027'}</strong> | Semester: <strong>${iden.semester || '1'}</strong>
    </div>
  </div>

  <!-- A. IDENTIFIKASI -->
  <h2 class="section-header">A. IDENTIFIKASI</h2>
  <table class="info-table">
    <tr><td style="width: 25%; font-weight: bold;">Nama Penyusun</td><td style="width: 3%;">:</td><td style="width: 72%;">${iden.penyusun || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Satuan Pendidikan</td><td>:</td><td>${iden.sekolah || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Tahun Pelajaran</td><td>:</td><td>${iden.tahunPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Semester</td><td>:</td><td>${iden.semester || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Mata Pelajaran</td><td>:</td><td>${iden.mataPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Kelas / Fase</td><td>:</td><td>${iden.kelasFase || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Topik / Elemen</td><td>:</td><td>${iden.topikElemen || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Alokasi Waktu</td><td>:</td><td>${iden.alokasiWaktu || '-'}</td></tr>
  </table>

  <h3 class="sub-header">1. Pengetahuan Awal Siswa</h3>
  <ul>
    ${(iden.pengetahuanAwal || []).map(p => `<li>${p}</li>`).join('')}
  </ul>

  <h3 class="sub-header">2. Minat Belajar Siswa</h3>
  <ul>
    ${(iden.minatBelajar || []).map(mb => `<li>${mb}</li>`).join('')}
  </ul>

  <h3 class="sub-header">3. Latar Belakang Lingkungan Siswa</h3>
  <p>${iden.latarBelakang || '-'}</p>

  <h3 class="sub-header">4. Pemetaan Kebutuhan Belajar (Diferensiasi)</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Gaya Belajar</th>
        <th style="width: 75%;">Deskripsi Strategi & Pendampingan</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><strong>Visual</strong></td><td>${iden.kebutuhanBelajar?.visual || '-'}</td></tr>
      <tr><td><strong>Kinestetik</strong></td><td>${iden.kebutuhanBelajar?.kinestetik || '-'}</td></tr>
      <tr><td><strong>Audio / Auditorial</strong></td><td>${iden.kebutuhanBelajar?.audio || '-'}</td></tr>
      <tr><td><strong>Pendampingan Khusus</strong></td><td>${iden.kebutuhanBelajar?.pendampinganKhusus || '-'}</td></tr>
    </tbody>
  </table>

  <!-- B. DIMENSI PROFIL LULUSAN -->
  <h2 class="section-header">B. IDENTIFIKASI DIMENSI PROFIL KELULUSAN (DPL)</h2>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 32%;">Dimensi Profil Lulusan</th>
        <th style="width: 68%;">Deskripsi Penerapan dalam Materi Pembelajaran</th>
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
  <h2 class="section-header">C. DESAIN PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Capaian Pembelajaran (CP)</h3>
  <p>${dp.capaianPembelajaran || '-'}</p>

  <h3 class="sub-header">2. Tujuan Pembelajaran (TP)</h3>
  <ol>
    ${(dp.tujuanPembelajaran || []).map(tp => `<li>${tp}</li>`).join('')}
  </ol>

  <h3 class="sub-header">3. Integrasi Lintas Disiplin Ilmu</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 32%;">Mata Pelajaran Terkait</th>
        <th style="width: 68%;">Uraian Integrasi Materi</th>
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

  <h3 class="sub-header">4. Praktik Pedagogi</h3>
  <table class="info-table">
    <tr><td style="width: 22%; font-weight: bold;">Model Pembelajaran</td><td style="width: 3%;">:</td><td>${dp.praktikPedagogi?.model || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Pendekatan</td><td>:</td><td>${dp.praktikPedagogi?.pendekatan || 'Deep Learning (Berkesadaran, Bermakna, Menggembirakan)'}</td></tr>
    <tr><td style="font-weight: bold;">Metode</td><td>:</td><td>${dp.praktikPedagogi?.metode || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Strategi</td><td>:</td><td>${dp.praktikPedagogi?.strategi || '-'}</td></tr>
  </table>

  <h3 class="sub-header">5. Lingkungan Belajar</h3>
  <ul>
    <li><strong>Ruang Fisik:</strong> ${dp.lingkunganBelajar?.ruangFisik || '-'}</li>
    <li><strong>Platform Virtual:</strong> ${dp.lingkunganBelajar?.platformVirtual || '-'}</li>
    <li><strong>Budaya Belajar:</strong> ${dp.lingkunganBelajar?.budayaBelajar || '-'}</li>
    <li><strong>Sumber Belajar:</strong> ${dp.lingkunganBelajar?.sumberBelajar || '-'}</li>
  </ul>

  <h3 class="sub-header">6. Pemanfaatan Teknologi Digital</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35%;">Alat / Platform Digital</th>
        <th style="width: 65%;">Kegunaan dalam Pembelajaran</th>
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
  <h2 class="section-header">D. PENGALAMAN BELAJAR (SKENARIO PEMBELAJARAN DEEP LEARNING)</h2>
  ${pb.map((sesi, sIdx) => `
    <div style="margin-bottom: 22px;">
      <h3 class="sub-header" style="font-size: 11pt; margin-top: 14px; margin-bottom: 2px;">
        ${sesi.label || `Pertemuan ${sesi.sesi || (sIdx + 1)}`}: ${sesi.topik || ''} (${sesi.jumlahJP || sesi.durasi || '5 JP / 175 menit'})
      </h3>
      <p style="font-style: italic; margin-top: 2px; margin-bottom: 8px; font-size: 10pt;">
        <em>Tujuan Pembelajaran: ${sesi.tujuanPembelajaran || (dp.tujuanPembelajaran && dp.tujuanPembelajaran[sIdx]) || 'Peserta didik dapat memahami dan menerapkan materi pembelajaran secara mendalam.'}</em>
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 25%;">Tahapan & Durasi</th>
            <th style="width: 75%;">Aktivitas Pembelajaran</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>PEMBUKA</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.pembuka?.durasi || sesi.pembuka?.waktuPrinsip || '15 menit'})</span>
            </td>
            <td>
              ${Array.isArray(sesi.pembuka?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.pembuka.langkah.map(l => `
                    <li style="margin-bottom: 4px;">
                      ${typeof l === 'string' ? l : l.aktivitas}
                      ${l.prinsip ? `<strong><em>(${l.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `<p style="margin: 0;">${sesi.pembuka?.deskripsi || '-'}</p>`}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>KEGIATAN INTI</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.inti?.durasi || sesi.inti?.waktuPrinsip || '145 menit'})</span>
            </td>
            <td>
              <p style="font-weight: bold; margin-top: 2px; margin-bottom: 5px; text-decoration: underline;">
                ${sesi.inti?.sintaksLabel || 'Sintaks Model PBL:'}
              </p>
              ${Array.isArray(sesi.inti?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.inti.langkah.map((step, idx) => `
                    <li style="margin-bottom: 5px;">
                      <strong>${step.label || `Langkah ${step.no || idx + 1}`} ${step.kategori ? `(${step.kategori})` : ''}:</strong>
                      ${step.aktivitas}
                      ${step.prinsip ? `<strong><em>(${step.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `
                <p><strong>1. Memahami (Orientasi Konsep):</strong><br>${sesi.inti?.memahami || '-'}</p>
                <p><strong>2. Mengaplikasikan (Penyelidikan & Karya):</strong><br>${sesi.inti?.mengaplikasikan || '-'}</p>
                <p><strong>3. Merefleksikan (Evaluasi & Refleksi):</strong><br>${sesi.inti?.merefleksikan || '-'}</p>
              `}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>PENUTUP</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.penutup?.durasi || sesi.penutup?.waktuPrinsip || '15 menit'})</span>
            </td>
            <td>
              ${Array.isArray(sesi.penutup?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.penutup.langkah.map(l => `
                    <li style="margin-bottom: 4px;">
                      ${typeof l === 'string' ? l : l.aktivitas}
                      ${l.prinsip ? `<strong><em>(${l.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `<p style="margin: 0;">${sesi.penutup?.deskripsi || '-'}</p>`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join('')}

  <!-- E. PENILAIAN / ASESMEN -->
  <div class="page-break"></div>
  <h2 class="section-header">E. PENILAIAN / ASESMEN PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Tabel Rencana Asesmen</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Jenis Asesmen</th>
        <th style="width: 50%;">Bentuk & Instrumen</th>
        <th style="width: 25%;">Waktu Pelaksanaan</th>
      </tr>
    </thead>
    <tbody>
      ${(ases.tabelJenis || []).map(t => `
        <tr>
          <td><strong>${t.jenis}</strong></td>
          <td>${t.instrumen}</td>
          <td style="text-align: center;">${t.waktu}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3 class="sub-header">2. Lampiran Asesmen Awal (Diagnostik)</h3>
  <ul>
    ${(ases.lampiranAsesmenAwal || []).map(a => `
      <li style="margin-bottom: 6px;">
        <strong>Pertanyaan Pemantik:</strong> "${a.soal}"<br>
        <em>Tolak Ukur/Kriteria Jawaban:</em> ${a.harapanJawaban}
      </li>
    `).join('')}
  </ul>

  <h3 class="sub-header">3. Rubrik Penilaian Sikap (Formatif)</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 20%;">Aspek Profil</th>
        <th style="width: 20%;">Skor 4 (Sangat Baik)</th>
        <th style="width: 20%;">Skor 3 (Baik)</th>
        <th style="width: 20%;">Skor 2 (Cukup)</th>
        <th style="width: 20%;">Skor 1 (Perlu Bimbingan)</th>
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

  <h3 class="sub-header">4. Soal Asesmen Sumatif (Uraian HOTS)</h3>
  <ol>
    ${(ases.soalSumatifHots || []).map(s => `
      <li style="margin-bottom: 8px;">
        <strong>${s.soal}</strong><br>
        <em>Kunci Jawaban & Rubrik Penskoran:</em> ${s.kunciJawaban}
      </li>
    `).join('')}
  </ol>

  <!-- LAMPIRAN MATERI AJAR -->
  <div class="page-break"></div>
  <h2 class="section-header">LAMPIRAN 1: BAHAN BACAAN & MATERI AJAR GURU & SISWA</h2>
  <div class="box-bordered">
    <p><strong>Pendahuluan:</strong></p>
    <p>${mat.pendahuluan || '-'}</p>
    ${(mat.poinPenting || []).map((p, idx) => `
      <h3 class="sub-header">${idx + 1}. ${p.subjudul}</h3>
      <p>${p.uraian}</p>
    `).join('')}
    <div style="background-color: #F8FAFC; border-left: 4px solid #000000; padding: 8px 12px; margin-top: 10px;">
      <p style="margin: 0;"><strong>Rangkuman Materi:</strong><br>${mat.rangkuman || '-'}</p>
    </div>
  </div>

  <!-- LAMPIRAN LKPD -->
  <div class="page-break"></div>
  <h2 class="section-header">LAMPIRAN 2: LEMBAR KERJA PESERTA DIDIK (LKPD)</h2>
  ${lkpd.map((item, idx) => `
    <div class="box-bordered" style="margin-bottom: 20px;">
      <div style="text-align: center; border-bottom: 1px solid #000000; padding-bottom: 6px; margin-bottom: 10px;">
        <strong style="font-size: 12pt; text-transform: uppercase;">LKPD ${idx + 1}: ${item.judul}</strong><br>
        <span style="font-size: 9.5pt; font-style: italic;">Pendekatan Deep Learning - Sintaks: ${item.sintaksPbl || 'Problem Based Learning'}</span>
      </div>
      <table class="info-table" style="margin-bottom: 8px;">
        <tr>
          <td style="width: 50%;"><strong>Nama Siswa:</strong> .................................................</td>
          <td style="width: 50%;"><strong>Kelas:</strong> .............................</td>
        </tr>
      </table>
      
      <p><strong>A. Kegiatan Memahami (Stimulus & Pertanyaan):</strong></p>
      <div style="background-color: #F8FAFC; border: 1px solid #CCCCCC; padding: 8px; margin-bottom: 8px;">
        <p style="margin: 0;">${item.kegiatanMemahami?.bacaanAtauStimulus || '-'}</p>
      </div>
      <ol>
        ${(item.kegiatanMemahami?.pertanyaan || []).map(q => `<li>${q}</li>`).join('')}
      </ol>

      <p><strong>B. Kegiatan Mengaplikasikan (Penugasan & Praktik):</strong></p>
      <p>${item.kegiatanMengaplikasikan?.petunjuk || '-'}</p>
      <div style="border: 1px dashed #666666; padding: 8px; min-height: 60px; margin-bottom: 10px;">
        ${item.kegiatanMengaplikasikan?.tabelAtauTugas || '<em>(Ruang Pengerjaan / Tabel Jawaban Siswa)</em>'}
      </div>

      <p><strong>C. Rubrik Penilaian Diri (Refleksi Mandiri Siswa):</strong></p>
      <ul>
        ${(item.rubrikMandiri || []).map(rm => `<li>[ &nbsp;&nbsp; ] ${rm}</li>`).join('')}
      </ul>
    </div>
  `).join('')}

  <!-- TINDAK LANJUT & REFLEKSI -->
  <div class="page-break"></div>
  <h2 class="section-header">F. TINDAK LANJUT DAN REFLEKSI PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Program Pembelajaran Remedial & Pengayaan</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 50%;">Program Remedial (Bagi Siswa Belum Tuntas)</th>
        <th style="width: 50%;">Program Pengayaan (Bagi Siswa Tuntas Lebih Cepat)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${tindak.programRemedial || '-'}</td>
        <td>${tindak.programPengayaan || '-'}</td>
      </tr>
    </tbody>
  </table>

  <h3 class="sub-header">2. Refleksi Guru</h3>
  <ul>
    ${(tindak.refleksiGuru || []).map(rg => `<li>${rg}</li>`).join('')}
  </ul>

  <h3 class="sub-header">3. Refleksi Siswa</h3>
  <ul>
    ${(tindak.refleksiSiswa || []).map(rs => `<li>${rs}</li>`).join('')}
  </ul>

  <!-- GLOSARIUM & DAFTAR PUSTAKA -->
  <h2 class="section-header">G. GLOSARIUM DAN DAFTAR PUSTAKA</h2>
  
  <h3 class="sub-header">Glosarium</h3>
  <table class="data-table">
    <thead>
      <tr><th style="width: 25%;">Istilah</th><th style="width: 75%;">Definisi & Penjelasan</th></tr>
    </thead>
    <tbody>
      ${(m.glosarium || []).map(g => `
        <tr><td><strong>${g.istilah}</strong></td><td>${g.definisi}</td></tr>
      `).join('')}
    </tbody>
  </table>

  <h3 class="sub-header">Daftar Pustaka</h3>
  <ul>
    ${(m.daftarPustaka || []).map(dp => `<li>${dp}</li>`).join('')}
  </ul>

  <!-- LEMBAR PENGESAHAN -->
  <div style="margin-top: 35px; page-break-inside: avoid;">
    <table class="signature-table">
      <tr>
        <td style="width: 50%;">
          Mengetahui,<br>
          Kepala Sekolah
          <br><br><br><br><br>
          <strong><u>${sah.kepalaSekolah?.nama || '( .................................................... )'}</u></strong><br>
          NIP. ${sah.kepalaSekolah?.nip || '...................................................'}
        </td>
        <td style="width: 50%;">
          ${sah.kota || 'Makassar'}, ${sah.tanggal || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>
          Guru Kelas / Pengampu Mata Pelajaran
          <br><br><br><br><br>
          <strong><u>${sah.guru?.nama || iden.penyusun || '( .................................................... )'}</u></strong><br>
          NIP. ${sah.guru?.nip || '...................................................'}
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
 * Layout rapi A4 siap cetak dengan styling kop formal, tabel proporsional, dan penataan halaman bersih.
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
    alert('Pop-up jendela cetak diblokir oleh browser. Silakan izinkan pop-up untuk mencetak atau simpan PDF.')
    return
  }

  const printHtml = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${m.judul || 'Cetak Modul Ajar Deep Learning'}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 20mm 18mm 18mm 18mm;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #000000;
      padding: 0;
      margin: 0;
      background: #FFFFFF;
    }
    .header-box {
      text-align: center;
      border-bottom: 2.5px solid #000000;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    h1.main-title {
      font-size: 13pt;
      font-weight: bold;
      margin: 0 0 3px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .school-title {
      font-size: 11.5pt;
      font-weight: bold;
      text-transform: uppercase;
      margin: 0 0 3px 0;
    }
    .meta-subtitle {
      font-size: 10pt;
      color: #333333;
      margin: 0;
    }
    h2.section-header {
      font-size: 11.5pt;
      font-weight: bold;
      margin-top: 18px;
      margin-bottom: 8px;
      background: #E2E8F0;
      border: 1px solid #000000;
      padding: 5px 8px;
      text-transform: uppercase;
      page-break-after: avoid;
    }
    h3.sub-header {
      font-size: 11pt;
      font-weight: bold;
      margin-top: 12px;
      margin-bottom: 4px;
      page-break-after: avoid;
    }
    p {
      margin: 3px 0 5px 0;
      text-align: justify;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px 0;
      font-size: 10pt;
      page-break-inside: auto;
    }
    table.data-table th, table.data-table td {
      border: 1px solid #000000;
      padding: 6px 8px;
      vertical-align: top;
    }
    table.data-table th {
      background-color: #F1F5F9;
      font-weight: bold;
      text-align: center;
    }
    table.data-table tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    table.info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0 10px 0;
      font-size: 10.5pt;
    }
    table.info-table td {
      border: none;
      padding: 3px 4px;
      vertical-align: top;
    }
    .box-bordered {
      border: 1px solid #000000;
      padding: 10px 14px;
      margin-top: 8px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    ul, ol {
      margin: 4px 0 6px 0;
      padding-left: 24px;
    }
    li {
      margin-bottom: 3px;
      text-align: justify;
    }
    .page-break {
      page-break-before: always;
    }
    .signature-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 35px;
      font-size: 10.5pt;
      page-break-inside: avoid;
    }
    .signature-table td {
      border: none;
      text-align: center;
      padding: 6px;
      vertical-align: top;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>

  <!-- KOP DOKUMEN -->
  <div class="header-box">
    <h1 class="main-title">${m.judul || 'RENCANA PEMBELAJARAN MENDALAM (RPM) KURIKULUM MERDEKA'}</h1>
    <div class="school-title">${iden.sekolah || 'SATUAN PENDIDIKAN'}</div>
    <div class="meta-subtitle">
      Mata Pelajaran: <strong>${iden.mataPelajaran || '-'}</strong> | ${iden.kelasFase || 'Kelas 5 / Fase C'} | Tahun Pelajaran: <strong>${iden.tahunPelajaran || '2026/2027'}</strong> | Semester: <strong>${iden.semester || '1'}</strong>
    </div>
  </div>

  <!-- A. IDENTIFIKASI -->
  <h2 class="section-header">A. IDENTIFIKASI PEMBELAJARAN</h2>
  <table class="info-table">
    <tr><td style="width: 25%; font-weight: bold;">Nama Penyusun</td><td style="width: 3%;">:</td><td style="width: 72%;">${iden.penyusun || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Satuan Pendidikan</td><td>:</td><td>${iden.sekolah || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Tahun Pelajaran</td><td>:</td><td>${iden.tahunPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Semester</td><td>:</td><td>${iden.semester || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Mata Pelajaran</td><td>:</td><td>${iden.mataPelajaran || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Kelas / Fase</td><td>:</td><td>${iden.kelasFase || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Topik / Elemen</td><td>:</td><td>${iden.topikElemen || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Alokasi Waktu</td><td>:</td><td>${iden.alokasiWaktu || '-'}</td></tr>
  </table>

  <h3 class="sub-header">1. Pengetahuan Awal Siswa</h3>
  <ul>${(iden.pengetahuanAwal || []).map(p => `<li>${p}</li>`).join('')}</ul>

  <h3 class="sub-header">2. Minat Belajar Siswa</h3>
  <ul>${(iden.minatBelajar || []).map(mb => `<li>${mb}</li>`).join('')}</ul>

  <h3 class="sub-header">3. Latar Belakang Lingkungan Siswa</h3>
  <p>${iden.latarBelakang || '-'}</p>

  <h3 class="sub-header">4. Pemetaan Kebutuhan Belajar Siswa</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Gaya Belajar</th>
        <th style="width: 75%;">Deskripsi Strategi & Pendampingan Guru</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><strong>Visual</strong></td><td>${iden.kebutuhanBelajar?.visual || '-'}</td></tr>
      <tr><td><strong>Kinestetik</strong></td><td>${iden.kebutuhanBelajar?.kinestetik || '-'}</td></tr>
      <tr><td><strong>Audio / Auditorial</strong></td><td>${iden.kebutuhanBelajar?.audio || '-'}</td></tr>
      <tr><td><strong>Pendampingan Khusus</strong></td><td>${iden.kebutuhanBelajar?.pendampinganKhusus || '-'}</td></tr>
    </tbody>
  </table>

  <!-- B. DIMENSI PROFIL LULUSAN -->
  <h2 class="section-header">B. DIMENSI PROFIL KELULUSAN (DPL)</h2>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 32%;">Dimensi Profil Lulusan</th>
        <th style="width: 68%;">Deskripsi Penerapan dalam Materi</th>
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
  <h2 class="section-header">C. DESAIN PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Capaian Pembelajaran (CP)</h3>
  <p>${dp.capaianPembelajaran || '-'}</p>

  <h3 class="sub-header">2. Tujuan Pembelajaran (TP)</h3>
  <ol>${(dp.tujuanPembelajaran || []).map(tp => `<li>${tp}</li>`).join('')}</ol>

  <h3 class="sub-header">3. Integrasi Lintas Disiplin Ilmu</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 32%;">Mata Pelajaran Terkait</th>
        <th style="width: 68%;">Uraian Integrasi Materi</th>
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

  <h3 class="sub-header">4. Praktik Pedagogi</h3>
  <table class="info-table">
    <tr><td style="width: 22%; font-weight: bold;">Model Pembelajaran</td><td style="width: 3%;">:</td><td>${dp.praktikPedagogi?.model || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Pendekatan</td><td>:</td><td>${dp.praktikPedagogi?.pendekatan || 'Deep Learning (Berkesadaran, Bermakna, Menggembirakan)'}</td></tr>
    <tr><td style="font-weight: bold;">Metode</td><td>:</td><td>${dp.praktikPedagogi?.metode || '-'}</td></tr>
    <tr><td style="font-weight: bold;">Strategi</td><td>:</td><td>${dp.praktikPedagogi?.strategi || '-'}</td></tr>
  </table>

  <h3 class="sub-header">5. Lingkungan Belajar</h3>
  <ul>
    <li><strong>Ruang Fisik:</strong> ${dp.lingkunganBelajar?.ruangFisik || '-'}</li>
    <li><strong>Platform Virtual:</strong> ${dp.lingkunganBelajar?.platformVirtual || '-'}</li>
    <li><strong>Budaya Belajar:</strong> ${dp.lingkunganBelajar?.budayaBelajar || '-'}</li>
    <li><strong>Sumber Belajar:</strong> ${dp.lingkunganBelajar?.sumberBelajar || '-'}</li>
  </ul>

  <h3 class="sub-header">6. Pemanfaatan Teknologi Digital</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 35%;">Alat / Platform Digital</th>
        <th style="width: 65%;">Kegunaan dalam Pembelajaran</th>
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
  <h2 class="section-header">D. PENGALAMAN BELAJAR (SKENARIO PEMBELAJARAN DEEP LEARNING)</h2>
  ${pb.map((sesi, sIdx) => `
    <div style="margin-bottom: 22px;">
      <h3 class="sub-header" style="font-size: 11pt; margin-top: 14px; margin-bottom: 2px;">
        ${sesi.label || `Pertemuan ${sesi.sesi || (sIdx + 1)}`}: ${sesi.topik || ''} (${sesi.jumlahJP || sesi.durasi || '5 JP / 175 menit'})
      </h3>
      <p style="font-style: italic; margin-top: 2px; margin-bottom: 8px; font-size: 10pt;">
        <em>Tujuan Pembelajaran: ${sesi.tujuanPembelajaran || (dp.tujuanPembelajaran && dp.tujuanPembelajaran[sIdx]) || 'Peserta didik dapat memahami dan menerapkan materi pembelajaran secara mendalam.'}</em>
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 25%;">Tahapan & Durasi</th>
            <th style="width: 75%;">Aktivitas Pembelajaran</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>PEMBUKA</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.pembuka?.durasi || sesi.pembuka?.waktuPrinsip || '15 menit'})</span>
            </td>
            <td>
              ${Array.isArray(sesi.pembuka?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.pembuka.langkah.map(l => `
                    <li style="margin-bottom: 4px;">
                      ${typeof l === 'string' ? l : l.aktivitas}
                      ${l.prinsip ? `<strong><em>(${l.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `<p style="margin: 0;">${sesi.pembuka?.deskripsi || '-'}</p>`}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>KEGIATAN INTI</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.inti?.durasi || sesi.inti?.waktuPrinsip || '145 menit'})</span>
            </td>
            <td>
              <p style="font-weight: bold; margin-top: 2px; margin-bottom: 5px; text-decoration: underline;">
                ${sesi.inti?.sintaksLabel || 'Sintaks Model PBL:'}
              </p>
              ${Array.isArray(sesi.inti?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.inti.langkah.map((step, idx) => `
                    <li style="margin-bottom: 5px;">
                      <strong>${step.label || `Langkah ${step.no || idx + 1}`} ${step.kategori ? `(${step.kategori})` : ''}:</strong>
                      ${step.aktivitas}
                      ${step.prinsip ? `<strong><em>(${step.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `
                <p><strong>1. Memahami (Orientasi Konsep):</strong><br>${sesi.inti?.memahami || '-'}</p>
                <p><strong>2. Mengaplikasikan (Penyelidikan & Karya):</strong><br>${sesi.inti?.mengaplikasikan || '-'}</p>
                <p><strong>3. Merefleksikan (Evaluasi & Refleksi):</strong><br>${sesi.inti?.merefleksikan || '-'}</p>
              `}
            </td>
          </tr>
          <tr>
            <td style="font-weight: bold; background-color: #F8FAFC; vertical-align: top;">
              <strong>PENUTUP</strong><br>
              <span style="font-size: 9pt; font-weight: normal;">(${sesi.penutup?.durasi || sesi.penutup?.waktuPrinsip || '15 menit'})</span>
            </td>
            <td>
              ${Array.isArray(sesi.penutup?.langkah) ? `
                <ol style="margin: 2px 0; padding-left: 20px;">
                  ${sesi.penutup.langkah.map(l => `
                    <li style="margin-bottom: 4px;">
                      ${typeof l === 'string' ? l : l.aktivitas}
                      ${l.prinsip ? `<strong><em>(${l.prinsip})</em></strong>` : ''}
                    </li>
                  `).join('')}
                </ol>
              ` : `<p style="margin: 0;">${sesi.penutup?.deskripsi || '-'}</p>`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `).join('')}

  <!-- E. PENILAIAN / ASESMEN -->
  <div class="page-break"></div>
  <h2 class="section-header">E. PENILAIAN / ASESMEN PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Tabel Rencana Asesmen</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 25%;">Jenis Asesmen</th>
        <th style="width: 50%;">Bentuk & Instrumen</th>
        <th style="width: 25%;">Waktu Pelaksanaan</th>
      </tr>
    </thead>
    <tbody>
      ${(ases.tabelJenis || []).map(t => `
        <tr>
          <td><strong>${t.jenis}</strong></td>
          <td>${t.instrumen}</td>
          <td style="text-align: center;">${t.waktu}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h3 class="sub-header">2. Lampiran Asesmen Awal (Diagnostik)</h3>
  <ul>
    ${(ases.lampiranAsesmenAwal || []).map(a => `
      <li style="margin-bottom: 6px;">
        <strong>Pertanyaan Pemantik:</strong> "${a.soal}"<br>
        <em>Tolak Ukur/Kriteria Jawaban:</em> ${a.harapanJawaban}
      </li>
    `).join('')}
  </ul>

  <h3 class="sub-header">3. Rubrik Penilaian Sikap (Formatif)</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 20%;">Aspek Profil</th>
        <th style="width: 20%;">Skor 4 (Sangat Baik)</th>
        <th style="width: 20%;">Skor 3 (Baik)</th>
        <th style="width: 20%;">Skor 2 (Cukup)</th>
        <th style="width: 20%;">Skor 1 (Perlu Bimbingan)</th>
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

  <h3 class="sub-header">4. Soal Asesmen Sumatif (Uraian HOTS)</h3>
  <ol>
    ${(ases.soalSumatifHots || []).map(s => `
      <li style="margin-bottom: 8px;">
        <strong>${s.soal}</strong><br>
        <em>Kunci Jawaban & Rubrik Penskoran:</em> ${s.kunciJawaban}
      </li>
    `).join('')}
  </ol>

  <!-- LAMPIRAN MATERI AJAR -->
  <div class="page-break"></div>
  <h2 class="section-header">LAMPIRAN 1: BAHAN BACAAN & MATERI AJAR GURU & SISWA</h2>
  <div class="box-bordered">
    <p><strong>Pendahuluan:</strong></p>
    <p>${mat.pendahuluan || '-'}</p>
    ${(mat.poinPenting || []).map((p, idx) => `
      <h3 class="sub-header">${idx + 1}. ${p.subjudul}</h3>
      <p>${p.uraian}</p>
    `).join('')}
    <div style="background-color: #F8FAFC; border-left: 4px solid #000000; padding: 8px 12px; margin-top: 10px;">
      <p style="margin: 0;"><strong>Rangkuman Materi:</strong><br>${mat.rangkuman || '-'}</p>
    </div>
  </div>

  <!-- LAMPIRAN LKPD -->
  <div class="page-break"></div>
  <h2 class="section-header">LAMPIRAN 2: LEMBAR KERJA PESERTA DIDIK (LKPD)</h2>
  ${lkpd.map((item, idx) => `
    <div class="box-bordered" style="margin-bottom: 20px;">
      <div style="text-align: center; border-bottom: 1px solid #000000; padding-bottom: 6px; margin-bottom: 10px;">
        <strong style="font-size: 12pt; text-transform: uppercase;">LKPD ${idx + 1}: ${item.judul}</strong><br>
        <span style="font-size: 9.5pt; font-style: italic;">Pendekatan Deep Learning - Sintaks: ${item.sintaksPbl || 'Problem Based Learning'}</span>
      </div>
      <table class="info-table" style="margin-bottom: 8px;">
        <tr>
          <td style="width: 50%;"><strong>Nama Siswa:</strong> .................................................</td>
          <td style="width: 50%;"><strong>Kelas:</strong> .............................</td>
        </tr>
      </table>
      
      <p><strong>A. Kegiatan Memahami (Stimulus & Pertanyaan):</strong></p>
      <div style="background-color: #F8FAFC; border: 1px solid #CCCCCC; padding: 8px; margin-bottom: 8px;">
        <p style="margin: 0;">${item.kegiatanMemahami?.bacaanAtauStimulus || '-'}</p>
      </div>
      <ol>
        ${(item.kegiatanMemahami?.pertanyaan || []).map(q => `<li>${q}</li>`).join('')}
      </ol>

      <p><strong>B. Kegiatan Mengaplikasikan (Penugasan & Praktik):</strong></p>
      <p>${item.kegiatanMengaplikasikan?.petunjuk || '-'}</p>
      <div style="border: 1px dashed #666666; padding: 8px; min-height: 60px; margin-bottom: 10px;">
        ${item.kegiatanMengaplikasikan?.tabelAtauTugas || '<em>(Ruang Pengerjaan / Tabel Jawaban Siswa)</em>'}
      </div>

      <p><strong>C. Rubrik Penilaian Diri (Refleksi Mandiri Siswa):</strong></p>
      <ul>
        ${(item.rubrikMandiri || []).map(rm => `<li>[ &nbsp;&nbsp; ] ${rm}</li>`).join('')}
      </ul>
    </div>
  `).join('')}

  <!-- TINDAK LANJUT & REFLEKSI -->
  <div class="page-break"></div>
  <h2 class="section-header">F. TINDAK LANJUT DAN REFLEKSI PEMBELAJARAN</h2>
  
  <h3 class="sub-header">1. Program Pembelajaran Remedial & Pengayaan</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 50%;">Program Remedial (Bagi Siswa Belum Tuntas)</th>
        <th style="width: 50%;">Program Pengayaan (Bagi Siswa Tuntas Lebih Cepat)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${tindak.programRemedial || '-'}</td>
        <td>${tindak.programPengayaan || '-'}</td>
      </tr>
    </tbody>
  </table>

  <h3 class="sub-header">2. Refleksi Guru</h3>
  <ul>
    ${(tindak.refleksiGuru || []).map(rg => `<li>${rg}</li>`).join('')}
  </ul>

  <h3 class="sub-header">3. Refleksi Siswa</h3>
  <ul>
    ${(tindak.refleksiSiswa || []).map(rs => `<li>${rs}</li>`).join('')}
  </ul>

  <!-- GLOSARIUM & DAFTAR PUSTAKA -->
  <h2 class="section-header">G. GLOSARIUM DAN DAFTAR PUSTAKA</h2>
  
  <h3 class="sub-header">Glosarium</h3>
  <table class="data-table">
    <thead>
      <tr><th style="width: 25%;">Istilah</th><th style="width: 75%;">Definisi & Penjelasan</th></tr>
    </thead>
    <tbody>
      ${(m.glosarium || []).map(g => `
        <tr><td><strong>${g.istilah}</strong></td><td>${g.definisi}</td></tr>
      `).join('')}
    </tbody>
  </table>

  <h3 class="sub-header">Daftar Pustaka</h3>
  <ul>
    ${(m.daftarPustaka || []).map(dp => `<li>${dp}</li>`).join('')}
  </ul>

  <!-- LEMBAR PENGESAHAN -->
  <div style="margin-top: 35px; page-break-inside: avoid;">
    <table class="signature-table">
      <tr>
        <td style="width: 50%;">
          Mengetahui,<br>
          Kepala Sekolah
          <br><br><br><br><br>
          <strong><u>${sah.kepalaSekolah?.nama || '( .................................................... )'}</u></strong><br>
          NIP. ${sah.kepalaSekolah?.nip || '...................................................'}
        </td>
        <td style="width: 50%;">
          ${sah.kota || 'Makassar'}, ${sah.tanggal || new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br>
          Guru Kelas / Pengampu Mata Pelajaran
          <br><br><br><br><br>
          <strong><u>${sah.guru?.nama || iden.penyusun || '( .................................................... )'}</u></strong><br>
          NIP. ${sah.guru?.nip || '...................................................'}
        </td>
      </tr>
    </table>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    }
  </script>
</body>
</html>
`

  printWindow.document.open()
  printWindow.document.write(printHtml)
  printWindow.document.close()
}
