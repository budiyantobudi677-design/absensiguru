import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { LogOut, Users, FileText, Settings, ShieldCheck, ArrowLeft, Download, Search, ArrowUpDown, UserCircle, Activity, Clock, XCircle, Bell, Trash2, X } from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function DashboardAdmin() {
  const [admin, setAdmin] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') 
  const [namaSekolah, setNamaSekolah] = useState('HR Dashboard')
  const [logoSekolah, setLogoSekolah] = useState('')
  const [hariKerja, setHariKerja] = useState(5)
  const [rekapTampilJam, setRekapTampilJam] = useState(true)
  const [exportFontSize, setExportFontSize] = useState(7)
  const [hariLiburData, setHariLiburData] = useState([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const [pegawaiData, setPegawaiData] = useState([])
  const [absensiData, setAbsensiData] = useState([])
  const [pengumumanData, setPengumumanData] = useState([])
  const [targetType, setTargetType] = useState('all')
  const [selectedPegawai, setSelectedPegawai] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [laporanTipe, setLaporanTipe] = useState('bulanan') // 'harian', 'bulanan', 'semester'
  const [laporanTanggal, setLaporanTanggal] = useState(new Date().toLocaleDateString('en-CA')) // YYYY-MM-DD
  const [laporanBulan, setLaporanBulan] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [laporanSemester, setLaporanSemester] = useState('ganjil')
  const [laporanTahun, setLaporanTahun] = useState(new Date().getFullYear())
  
  const [pegawaiSearch, setPegawaiSearch] = useState('')
  const [pegawaiSort, setPegawaiSort] = useState('name-asc')

  const [overviewStats, setOverviewStats] = useState({ hadir: 0, tidakHadir: 0 })
  
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportPreviewData, setExportPreviewData] = useState({ columns: [], rows: [] })
  
  const navigate = useNavigate()

  useEffect(() => {
    fetchAdmin()
    fetchSettings()
    fetchOverviewStats()
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTab === 'laporan') {
       loadAbsensi()
    }
  }, [laporanTipe, laporanTanggal, laporanBulan, laporanSemester, laporanTahun])

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
    if (data) {
      if (data.nama_sekolah) setNamaSekolah(data.nama_sekolah)
      if (data.logo_sekolah) setLogoSekolah(data.logo_sekolah)
      if (data.hari_kerja) setHariKerja(data.hari_kerja)
      if (data.rekap_tampil_jam !== undefined) setRekapTampilJam(data.rekap_tampil_jam)
    }
  }

  const loadHariLibur = async () => {
    const { data } = await supabase.from('hari_libur').select('*').order('tanggal', { ascending: false }).limit(20)
    if (data) setHariLiburData(data)
  }

  const fetchAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return navigate('/')
    setAdmin(user)
  }

  const fetchOverviewStats = async () => {
    const todayStr = new Date().toLocaleDateString('en-CA')
    const { data } = await supabase.from('absensi').select('*').eq('tanggal', todayStr)
    if (data) {
       let hadir = 0
       let tidakHadir = 0
       data.forEach(a => {
          if (a.status === 'hadir') {
             hadir++
          } else {
             tidakHadir++
          }
       })
       setOverviewStats({ hadir, tidakHadir })
    }
  }

  const loadPegawai = async () => {
    setLoadingData(true)
    const { data } = await supabase.from('profiles').select('*')
    if (data) setPegawaiData(data)
    setLoadingData(false)
  }

  const loadAbsensi = async () => {
    setLoadingData(true)
    let query = supabase.from('absensi').select('*, profiles(full_name, email, foto_profil, jabatan, nip)')
    
    if (laporanTipe === 'harian') {
       query = query.eq('tanggal', laporanTanggal)
    } else if (laporanTipe === 'bulanan') {
       const [year, month] = laporanBulan.split('-')
       const firstDay = new Date(year, month - 1, 1).toLocaleDateString('en-CA')
       const lastDay = new Date(year, month, 0).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay).lte('tanggal', lastDay)
    } else if (laporanTipe === 'semester') {
       const year = parseInt(laporanTahun)
       const startMonth = laporanSemester === 'ganjil' ? 6 : 0 // Ganjil = Jul-Dec, Genap = Jan-Jun
       const endMonth = laporanSemester === 'ganjil' ? 11 : 5
       const firstDay = new Date(year, startMonth, 1).toLocaleDateString('en-CA')
       const lastDay = new Date(year, endMonth + 1, 0).toLocaleDateString('en-CA')
       query = query.gte('tanggal', firstDay).lte('tanggal', lastDay)
    }
    
    const { data } = await query.order('waktu_masuk', { ascending: false }).limit(2000)
    if (data) setAbsensiData(data)
    setLoadingData(false)
  }

  const loadPengumuman = async () => {
    setLoadingData(true)
    const { data, error } = await supabase.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(50)
    if (!error && data) setPengumumanData(data)
    setLoadingData(false)
  }

  const hapusPengumuman = async (id) => {
    if (!window.confirm("Hapus pengumuman ini?")) return
    const { error } = await supabase.from('pengumuman').delete().eq('id', id)
    if (!error) {
       setPengumumanData(pengumumanData.filter(p => p.id !== id))
    }
  }

  const tambahPengumuman = async (e) => {
    e.preventDefault()
    const pesan = e.target.pesan.value
    if (!pesan.trim()) return
    if (targetType === 'selected' && selectedPegawai.length === 0) {
       return alert("Pilih minimal satu pegawai untuk menerima notifikasi ini.")
    }
    
    const target_users = targetType === 'selected' ? selectedPegawai.join(',') : ''
    const { data, error } = await supabase.from('pengumuman').insert({ pesan, target_type: targetType, target_users }).select()
    
    if (!error && data) {
       setPengumumanData([data[0], ...pengumumanData])
       e.target.reset()
       setTargetType('all')
       setSelectedPegawai([])
       alert("Pengumuman berhasil dikirim!")
    } else {
       if (error?.code === '42P01' || error?.message?.includes('target_type')) {
          alert("Error: Struktur tabel 'pengumuman' belum diperbarui di Supabase. Silakan perbarui tabel (tambah kolom target_type dan target_users)!")
       } else {
          alert("Gagal mengirim pengumuman: " + error?.message)
       }
    }
  }

  const handleMenuClick = (menu) => {
    setActiveTab(menu)
    if (menu === 'pegawai') loadPegawai()
    if (menu === 'laporan') {
       loadPegawai()
       loadAbsensi()
    }
    if (menu === 'overview') fetchOverviewStats()
    if (menu === 'pengumuman') {
       loadPengumuman()
       loadPegawai()
    }
    if (menu === 'pengaturan') {
       fetchSettings()
       loadHariLibur()
    }
  }

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > 600) { height = Math.round((height *= 600 / width)); width = 600; }
          } else {
            if (height > 600) { width = Math.round((width *= 600 / height)); height = 600; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            resolve(new File([blob], "logo_" + Date.now() + ".webp", { type: 'image/webp' }));
          }, 'image/webp', 0.8);
        };
      };
    });
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const compressedFile = await compressImage(file)
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.webp`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, compressedFile)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
      const { error: updateError } = await supabase.from('settings').upsert({ id: 1, logo_sekolah: publicUrl }, { onConflict: 'id' })
      if (updateError) throw updateError
      setLogoSekolah(publicUrl)
      alert("Logo berhasil diperbarui!")
    } catch (err) {
      alert("Gagal upload logo: " + err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleOpenExportModal = () => {
     if (absensiData.length === 0) return alert("Tidak ada data untuk diekspor.");
     let columns = [];
     let rows = [];
     let monthName = '';
     let redColumns = [];

     if (laporanTipe === 'bulanan') {
       columns = ['No', 'Nama'];
       const [yearStr, monthStr] = laporanBulan.split('-');
       const yearNum = parseInt(yearStr);
       const monthNum = parseInt(monthStr) - 1;
       const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
       monthName = `${monthNames[monthNum]} ${yearNum}`;
       
       const daysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();
       
       for(let i=1; i<=daysInMonth; i++) {
          columns.push(i.toString());
          const dateObj = new Date(yearNum, monthNum, i);
          const dayOfWeek = dateObj.getDay();
          let isRed = false;
          if (hariKerja === 5 && (dayOfWeek === 0 || dayOfWeek === 6)) isRed = true;
          if (hariKerja === 6 && dayOfWeek === 0) isRed = true;
          
          const dateStr = dateObj.toLocaleDateString('en-CA');
          if (hariLiburData.some(h => h.tanggal === dateStr)) isRed = true;
          
          if (isRed) redColumns.push(i.toString());
       }

       const userMap = {}
       pegawaiData.forEach(p => {
          userMap[p.id] = { nama: p.full_name || p.email, nip: p.nip || '-', absensi: {} }
       })
       absensiData.forEach(a => {
          if(!userMap[a.user_id]) return;
          const tgl = new Date(a.tanggal).getDate();
          userMap[a.user_id].absensi[tgl] = {
             status: a.status,
             in: a.waktu_masuk ? new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
             out: a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'
          };
       })

       rows = Object.values(userMap).map((user, index) => {
          const row = { No: index + 1, Nama: `${user.nama}\nNIP: ${user.nip}` };
          for(let i=1; i<=daysInMonth; i++) {
             row[i] = user.absensi[i] || null;
          }
          return row;
       });
     } else {
       columns = ['No', 'Nama', 'Tanggal', 'Jam Masuk', 'Jam Pulang', 'Status'];
       rows = getFilteredAndSortedData().map((a, index) => ({
         No: index + 1,
         Nama: `${a.profiles?.full_name || a.profiles?.email?.split('@')[0] || 'Unknown'}\nNIP: ${a.profiles?.nip || '-'}`,
         Tanggal: new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
         'Jam Masuk': new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
         'Jam Pulang': a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
         Status: a.status?.toUpperCase() || 'HADIR'
       }));
     }

     setExportPreviewData({ 
        columns, 
        rows,
        monthName: laporanTipe === 'bulanan' ? monthName : '',
        redColumns: laporanTipe === 'bulanan' ? redColumns : []
     });
     setShowExportModal(true);
  }

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Presensi');

    worksheet.mergeCells(1, 1, 1, exportPreviewData.columns.length);
    worksheet.getCell(1, 1).value = 'DAFTAR HADIR';
    worksheet.getCell(1, 1).font = { bold: true, size: 12 };
    worksheet.getCell(1, 1).alignment = { horizontal: 'center' };

    worksheet.mergeCells(2, 1, 2, exportPreviewData.columns.length);
    worksheet.getCell(2, 1).value = 'GURU DAN TENAGA KEPENDIDIKAN';
    worksheet.getCell(2, 1).font = { bold: true, size: 12 };
    worksheet.getCell(2, 1).alignment = { horizontal: 'center' };

    worksheet.mergeCells(3, 1, 3, exportPreviewData.columns.length);
    worksheet.getCell(3, 1).value = namaSekolah.toUpperCase();
    worksheet.getCell(3, 1).font = { bold: true, size: 12 };
    worksheet.getCell(3, 1).alignment = { horizontal: 'center' };
    
    if (laporanTipe === 'bulanan') {
       worksheet.mergeCells(4, 1, 4, exportPreviewData.columns.length);
       worksheet.getCell(4, 1).value = `Bulan : ${exportPreviewData.monthName}`;
       worksheet.getCell(4, 1).font = { bold: true, size: 11 };
       worksheet.getCell(4, 1).alignment = { horizontal: 'left' };
    }

    const headerRow = worksheet.addRow(exportPreviewData.columns);
    headerRow.eachCell((cell, colNumber) => {
      const colName = exportPreviewData.columns[colNumber - 1];
      let bgColor = exportPreviewData.redColumns?.includes(colName) ? 'FFDC2626' : 'FF4F46E5';
      
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: exportFontSize };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    worksheet.getColumn(1).width = 5;
    // Auto shrink Nama column a bit based on exportFontSize
    worksheet.getColumn(2).width = Math.max(15, 30 * (exportFontSize / 10));
    
    if (laporanTipe === 'bulanan') {
      for(let i=3; i<=exportPreviewData.columns.length; i++) worksheet.getColumn(i).width = rekapTampilJam ? 12 : 5;
    } else {
      for(let i=3; i<=6; i++) worksheet.getColumn(i).width = 18;
    }

    exportPreviewData.rows.forEach(row => {
      const rowData = [];
      exportPreviewData.columns.forEach(col => {
         if (laporanTipe === 'bulanan' && col !== 'No' && col !== 'Nama') {
            const cellData = row[col];
            if (!cellData) rowData.push('-');
            else if (cellData.status === 'hadir') rowData.push(rekapTampilJam ? `✓\nIn: ${cellData.in}\nOut: ${cellData.out}` : '✓');
            else rowData.push(cellData.status.toUpperCase());
         } else {
            rowData.push(row[col]);
         }
      });
      
      const addedRow = worksheet.addRow(rowData);
      addedRow.eachCell((cell, colNumber) => {
         const colName = exportPreviewData.columns[colNumber - 1];
         let isRedColumn = exportPreviewData.redColumns?.includes(colName);
         
         cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
         cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
         
         if (isRedColumn) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
         }
         
         let cellFont = { size: exportFontSize };
         
         if (laporanTipe === 'bulanan' && colNumber > 2) {
            const cellData = row[colName];
            if (cellData && cellData !== '-') {
               if (cellData.status === 'hadir') {
                  cellFont.color = { argb: 'FF2563EB' };
               } else if (cellData.status === 'izin') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
                  cellFont.bold = true;
                  cellFont.color = { argb: 'FFFFFFFF' };
               } else if (cellData.status === 'sakit') {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
                  cellFont.bold = true;
                  cellFont.color = { argb: 'FFFFFFFF' };
               }
            }
         }
         cell.font = cellFont;
      });
    });

    worksheet.pageSetup.orientation = laporanTipe === 'bulanan' ? 'landscape' : 'portrait';
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToWidth = 1;
    worksheet.pageSetup.fitToHeight = 0;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Laporan_Kehadiran_${laporanTipe}.xlsx`);
  }

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: laporanTipe === 'bulanan' ? 'landscape' : 'portrait', format: 'legal' });
    const docWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("DAFTAR HADIR", docWidth / 2, 15, { align: 'center' });
    doc.text("GURU DAN TENAGA KEPENDIDIKAN", docWidth / 2, 22, { align: 'center' });
    doc.text(namaSekolah.toUpperCase(), docWidth / 2, 29, { align: 'center' });

    if (laporanTipe === 'bulanan') {
      doc.setFontSize(12);
      doc.text(`Bulan : ${exportPreviewData.monthName}`, 14, 40);
    }
    
    const startY = laporanTipe === 'bulanan' ? 45 : 35;
    
    const drawTable = (columns, rows, startYPos) => {
       const head = [columns];
       const body = rows.map(r => columns.map(c => {
          let content = r[c] || '-';
          if (laporanTipe === 'bulanan' && c !== 'No' && c !== 'Nama' && content !== '-') {
             if (content.status === 'hadir') content = rekapTampilJam ? `✓\nIn: ${content.in}\nOut: ${content.out}` : '✓';
             else if (content.status === 'izin') content = 'IZIN';
             else if (content.status === 'sakit') content = 'SAKIT';
          }
          return content;
       }));

       autoTable(doc, {
         startY: startYPos,
         head: head,
         body: body,
         theme: 'grid',
         styles: { 
            fontSize: exportFontSize,
            cellPadding: (laporanTipe === 'bulanan' && rekapTampilJam) ? 0.5 : 1,
            halign: 'center',
            valign: 'middle',
            minCellHeight: 8
         },
         headStyles: {
            fillColor: [79, 70, 229]
         },
         didParseCell: function (data) {
            if (laporanTipe === 'bulanan' && data.section === 'head') {
               const colName = columns[data.column.index];
               if (exportPreviewData.redColumns.includes(colName)) data.cell.styles.fillColor = [220, 38, 38];
            }
            if (laporanTipe === 'bulanan' && data.section === 'body') {
               const colName = columns[data.column.index];
               const cellData = rows[data.row.index][colName];
               
               if (exportPreviewData.redColumns.includes(colName)) {
                  data.cell.styles.fillColor = [254, 226, 226];
               }
               
               if (colName !== 'No' && colName !== 'Nama' && cellData && cellData !== '-') {
                  if (cellData.status === 'hadir') {
                     data.cell.styles.textColor = [37, 99, 235];
                  } else if (cellData.status === 'izin') {
                     data.cell.styles.fillColor = [251, 191, 36];
                     data.cell.styles.textColor = [255, 255, 255];
                     data.cell.styles.fontStyle = 'bold';
                  } else if (cellData.status === 'sakit') {
                     data.cell.styles.fillColor = [239, 68, 68];
                     data.cell.styles.textColor = [255, 255, 255];
                     data.cell.styles.fontStyle = 'bold';
                  }
               }
            }
         }
       });
    };

    drawTable(exportPreviewData.columns, exportPreviewData.rows, startY);

    doc.save(`Laporan_Kehadiran_${laporanTipe}.pdf`);
  }

  const exportToWord = () => {
    let tableHTML = document.getElementById('export-preview-container').outerHTML;
    tableHTML = tableHTML.replace(/\n/g, '<br>');
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' 
      xmlns:w='urn:schemas-microsoft-com:office:word' 
      xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Laporan Absensi</title>
        <style>
          @page WordSection1 { size: 841.95pt 595.35pt; mso-page-orientation: landscape; margin: 36.0pt; }
          div.WordSection1 { page: WordSection1; }
          table { width: 100%; border-collapse: collapse; font-size: ${exportFontSize}pt; }
          td, th { border: 1px solid #000; padding: 2px; text-align: center; vertical-align: middle; }
        </style>
      </head>
      <body>
        <div class="WordSection1">`;
    const footer = "</div></body></html>";
    const sourceHTML = header + tableHTML + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    saveAs(blob, `Laporan_Kehadiran_${laporanTipe}.doc`);
  }

  const getFilteredAndSortedData = () => {
    let result = absensiData.filter(a => {
      const name = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      return name.includes(searchTerm.toLowerCase())
    })
    result.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.waktu_masuk) - new Date(a.waktu_masuk)
      if (sortOrder === 'oldest') return new Date(a.waktu_masuk) - new Date(b.waktu_masuk)
      const nameA = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase()
      const nameB = (b.profiles?.full_name || b.profiles?.email || '').toLowerCase()
      if (sortOrder === 'name-asc') return nameA.localeCompare(nameB)
      if (sortOrder === 'name-desc') return nameB.localeCompare(nameA)
      return 0
    })
    return result
  }

  const getFilteredPegawai = () => {
    let result = pegawaiData.filter(p => {
      const name = (p.full_name || p.email || '').toLowerCase()
      return name.includes(pegawaiSearch.toLowerCase())
    })
    result.sort((a, b) => {
      const nameA = (a.full_name || a.email || '').toLowerCase()
      const nameB = (b.full_name || b.email || '').toLowerCase()
      if (pegawaiSort === 'name-asc') return nameA.localeCompare(nameB)
      if (pegawaiSort === 'name-desc') return nameB.localeCompare(nameA)
      if (pegawaiSort === 'newest') return new Date(b.created_at) - new Date(a.created_at)
      return 0
    })
    return result
  }

  const filteredAbsensi = getFilteredAndSortedData()
  const filteredPegawai = getFilteredPegawai()

  return (
    <div className="container" style={{ paddingBottom: '90px', background: '#F8FAFC', minHeight: '100vh' }}>
      <div className="card-gradient" style={{ padding: '2.5rem 1.5rem 2rem 1.5rem', borderRadius: '0 0 32px 32px', marginBottom: '2rem', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', position: 'sticky', top: 0, zIndex: 50, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}></div>
        <div className="flex justify-between items-center position-relative mb-6">
          <div className="flex items-center gap-4">
            <div style={{ width: '56px', height: '56px', borderRadius: '20px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ShieldCheck size={32} color="white" />}
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.1rem' }}>Administrator,</p>
              <h2 style={{ fontSize: '1.4rem', marginTop: 0, color: 'white', letterSpacing: '0.5px' }}>{namaSekolah}</h2>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between position-relative" style={{ background: 'rgba(255,255,255,0.15)', padding: '1rem 1.25rem', borderRadius: '16px', backdropFilter: 'blur(10px)' }}>
          <div className="flex items-center gap-3" style={{ color: 'white' }}>
            <Clock size={20} />
            <span style={{ fontSize: '1rem', fontWeight: '500', letterSpacing: '1px' }}>
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.9)' }}>
            {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem' }}>
        {activeTab === 'overview' && (
          <div className="fade-in">
            
            {/* Real-time Dashboard Metrics */}
            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', color: '#1E293B' }}>Kehadiran Hari Ini</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
               <div className="card text-center" style={{ padding: '1.25rem 0.5rem', borderRadius: '20px', border: 'none', background: 'white', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.1)' }}>
                  <Activity size={24} color="#10B981" style={{ margin: '0 auto 0.5rem auto' }} />
                  <h2 style={{ fontSize: '1.5rem', color: '#10B981', margin: '0 0 0.25rem 0' }}>{overviewStats.hadir}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0, fontWeight: '600' }}>HADIR</p>
               </div>
               <div className="card text-center" style={{ padding: '1.25rem 0.5rem', borderRadius: '20px', border: 'none', background: 'white', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.1)' }}>
                  <XCircle size={24} color="#EF4444" style={{ margin: '0 auto 0.5rem auto' }} />
                  <h2 style={{ fontSize: '1.5rem', color: '#EF4444', margin: '0 0 0.25rem 0' }}>{overviewStats.tidakHadir}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0, fontWeight: '600' }}>IZIN/SAKIT</p>
               </div>
            </div>

            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', color: '#1E293B' }}>Menu Navigasi</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              <div onClick={() => handleMenuClick('pegawai')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #4F46E5 0%, #818CF8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Users size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Data Pegawai</h3>
              </div>
              <div onClick={() => handleMenuClick('laporan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <FileText size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Laporan</h3>
              </div>
              <div onClick={() => handleMenuClick('pengumuman')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Bell size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Pengumuman</h3>
              </div>
              <div onClick={() => handleMenuClick('pengaturan')} className="card" style={{ cursor: 'pointer', border: 'none', padding: '1.5rem 1rem', borderRadius: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <Settings size={32} color="white" />
                </div>
                <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: '600' }}>Pengaturan Sekolah</h3>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pegawai' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Daftar Pegawai</h3>
             </div>
             
             <div className="flex flex-col gap-3 mb-4">
                <div style={{ position: 'relative' }}>
                   <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <input type="text" className="input" placeholder="Cari nama guru..." value={pegawaiSearch} onChange={(e) => setPegawaiSearch(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', fontSize: '0.9rem' }} />
                </div>
                <div style={{ position: 'relative' }}>
                   <ArrowUpDown size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                   <select className="input" value={pegawaiSort} onChange={(e) => setPegawaiSort(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', appearance: 'none', fontSize: '0.9rem' }}>
                      <option value="name-asc">Nama (A - Z)</option>
                      <option value="name-desc">Nama (Z - A)</option>
                      <option value="newest">Terbaru Ditambahkan</option>
                   </select>
                </div>
             </div>

             {loadingData ? <p className="text-center text-muted">Memuat data...</p> : (
               <div className="flex flex-col gap-2">
                 {filteredPegawai.length === 0 && <p className="text-center text-muted">Tidak ada pegawai.</p>}
                 {filteredPegawai.map(p => (
                   <div key={p.id} className="card flex items-center justify-between" style={{ padding: '0.75rem 1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                     <div className="flex gap-4 items-center">
                       {p.foto_profil ? <img src={p.foto_profil} style={{ width:'36px', height:'36px', borderRadius:'50%', objectFit:'cover'}} /> : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserCircle size={20} color="var(--text-muted)" /></div>}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{p.full_name || p.email}</h4>
                         <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.jabatan || 'Pegawai'} {p.nip && `• ${p.nip}`}</p>
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'laporan' && (
          <div className="fade-in">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                    <ArrowLeft size={20} />
                  </button>
                  <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Laporan</h3>
                </div>
                <button onClick={handleOpenExportModal} className="btn" style={{ background: '#10B981', color: 'white', padding: '0.4rem 0.8rem', width: 'auto', fontSize: '0.8rem', borderRadius: '10px' }}>
                  <Download size={14} /> Ekspor
                </button>
            </div>

            <div className="flex flex-col gap-3 mb-4">
               {/* Laporan Period Filter */}
               <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                 <select className="input" value={laporanTipe} onChange={(e) => setLaporanTipe(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem' }}>
                    <option value="harian">Harian</option>
                    <option value="bulanan">Bulanan</option>
                    <option value="semester">Semester</option>
                 </select>
                 
                 {laporanTipe === 'harian' && (
                    <input type="date" className="input" value={laporanTanggal} onChange={(e) => setLaporanTanggal(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', flex: 1 }} />
                 )}
                 
                 {laporanTipe === 'bulanan' && (
                    <input type="month" className="input" value={laporanBulan} onChange={(e) => setLaporanBulan(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', flex: 1 }} />
                 )}
                 
                 {laporanTipe === 'semester' && (
                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                      <select className="input" value={laporanSemester} onChange={(e) => setLaporanSemester(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.85rem', flex: 1 }}>
                         <option value="ganjil">Ganjil (Jul - Des)</option>
                         <option value="genap">Genap (Jan - Jun)</option>
                      </select>
                      <input type="number" className="input" value={laporanTahun} onChange={(e) => setLaporanTahun(e.target.value)} placeholder="Tahun" style={{ padding: '0.5rem', fontSize: '0.85rem', width: '80px' }} />
                    </div>
                 )}
               </div>
               
               <div style={{ position: 'relative' }}>
                  <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" className="input" placeholder="Cari nama pegawai..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.5rem', borderRadius: '12px', fontSize: '0.9rem' }} />
               </div>
            </div>

            {loadingData ? <p className="text-center text-muted mt-8">Memuat data...</p> : (
              <div className="flex flex-col gap-2">
                {filteredAbsensi.length === 0 && <p className="text-center text-muted">Data tidak ditemukan pada periode ini.</p>}
                {filteredAbsensi.map(a => (
                  <div key={a.id} className="card flex items-center justify-between" style={{ padding: '0.8rem 1rem', border: 'none', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                    <div className="flex gap-3 items-center">
                       {a.profiles?.foto_profil ? <img src={a.profiles.foto_profil} alt="Foto" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} color="var(--text-muted)" /></div>}
                       <div>
                         <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{a.profiles?.full_name || a.profiles?.email?.split('@')[0]}</h4>
                         <p style={{ margin: 0, fontSize: '0.75rem', color: a.status !== 'hadir' && a.status ? '#DC2626' : 'var(--text-muted)' }}>
                           {new Date(a.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                           {a.status && a.status !== 'hadir' && ` • ${a.status.toUpperCase()}: ${a.keterangan || '-'}`}
                         </p>
                       </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>IN</div>
                         <div style={{ fontWeight: '700', color: '#059669', fontSize: '0.9rem' }}>{new Date(a.waktu_masuk).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="text-center">
                         <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>OUT</div>
                         <div style={{ fontWeight: '700', color: a.waktu_pulang ? '#D97706' : '#CBD5E1', fontSize: '0.9rem' }}>{a.waktu_pulang ? new Date(a.waktu_pulang).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'pengumuman' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Notifikasi & Pengumuman</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Buat Pengumuman Baru</h4>
               <form onSubmit={tambahPengumuman}>
                 <div className="input-group">
                   <textarea name="pesan" className="input" rows="3" placeholder="Tulis pesan atau notifikasi..." required style={{ resize: 'vertical' }}></textarea>
                 </div>
                 
                 <div className="input-group" style={{ marginTop: '1rem' }}>
                   <label className="input-label" style={{ fontSize: '0.85rem' }}>Kirim Ke</label>
                   <select className="input" value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: '0.75rem', borderRadius: '12px' }}>
                      <option value="all">Semua Pegawai</option>
                      <option value="selected">Pegawai Tertentu</option>
                   </select>
                 </div>
                 
                 {targetType === 'selected' && (
                    <div className="input-group" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', background: '#F8FAFC', padding: '1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                       {pegawaiData.length === 0 ? <p className="text-muted text-sm m-0">Memuat data pegawai...</p> : pegawaiData.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}>
                             <input type="checkbox" checked={selectedPegawai.includes(p.id)} onChange={(e) => {
                                if (e.target.checked) setSelectedPegawai([...selectedPegawai, p.id]);
                                else setSelectedPegawai(selectedPegawai.filter(id => id !== p.id));
                             }} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                             <span style={{ fontSize: '0.95rem', color: '#334E68' }}>{p.full_name || p.email}</span>
                          </label>
                       ))}
                    </div>
                 )}

                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '1.25rem', width: '100%', background: '#EC4899', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                   <Bell size={18} /> Kirim Notifikasi
                 </button>
               </form>
             </div>

             <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Riwayat Pengumuman</h4>
             {loadingData ? <p className="text-muted">Memuat data...</p> : (
               <div className="flex flex-col gap-3">
                 {pengumumanData.length === 0 && <p className="text-muted">Belum ada pengumuman.</p>}
                 {pengumumanData.map(p => (
                   <div key={p.id} className="card" style={{ padding: '1rem', border: '1px solid #F1F5F9', borderRadius: '16px', background: 'white' }}>
                     <div className="flex justify-between items-start mb-2">
                       <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                         {new Date(p.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </span>
                       <button onClick={() => hapusPengumuman(p.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>
                         <Trash2 size={16} />
                       </button>
                     </div>
                     <p style={{ margin: 0, fontSize: '0.95rem', color: '#334E68', lineHeight: '1.5' }}>{p.pesan}</p>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}

        {activeTab === 'pengaturan' && (
          <div className="fade-in">
             <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setActiveTab('overview')} style={{ background: 'white', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '12px' }}>
                  <ArrowLeft size={20} />
                </button>
                <h3 style={{ fontSize: '1.125rem', margin: 0 }}>Pengaturan</h3>
             </div>
             
             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Profil Sekolah</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const { error } = await supabase.from('settings').upsert({ id: 1, nama_sekolah: formData.get('nama_sekolah'), logo_sekolah: logoSekolah }, { onConflict: 'id' });
                 if (error) alert('Error: ' + error.message);
                 else { setNamaSekolah(formData.get('nama_sekolah')); alert('Tersimpan!'); }
               }}>
                 <div className="input-group">
                   <label className="input-label">Nama Sekolah / Instansi</label>
                   <input type="text" name="nama_sekolah" className="input" defaultValue={namaSekolah} required />
                 </div>
                 <div className="input-group">
                   <label className="input-label">Logo Sekolah</label>
                   <div className="flex gap-4 items-center">
                     <div style={{ width: '60px', height: '60px', borderRadius: '12px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                       {logoSekolah ? <img src={logoSekolah} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ShieldCheck size={24} color="var(--text-muted)" />}
                     </div>
                     <label className="btn" style={{ background: '#F1F5F9', color: '#1E293B', cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.875rem', borderRadius: '12px' }}>
                       {uploadingLogo ? '...' : 'Upload Logo'}
                       <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} disabled={uploadingLogo} />
                     </label>
                   </div>
                 </div>
                 <button type="submit" className="btn btn-primary" style={{ padding: '1rem', marginTop: '1rem', background: '#F59E0B' }}>Simpan Pengaturan</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Sistem Hari Kerja</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 setLoadingData(true);
                 const val = parseInt(e.target.hari_kerja.value);
                 const { error } = await supabase.from('settings').upsert({ id: 1, hari_kerja: val }, { onConflict: 'id' });
                 if (!error) {
                    setHariKerja(val);
                    alert("Sistem Hari Kerja berhasil diperbarui!");
                 } else {
                    alert("Error update: " + error.message);
                 }
                 setLoadingData(false);
               }}>
                 <div className="input-group">
                   <select name="hari_kerja" className="input" defaultValue={hariKerja}>
                      <option value="5">5 Hari Kerja (Senin - Jumat)</option>
                      <option value="6">6 Hari Kerja (Senin - Sabtu)</option>
                   </select>
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#4F46E5', color: 'white', width: '100%' }}>Simpan Hari Kerja</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Format Rekapitulasi Bulanan</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 setLoadingData(true);
                 const val = e.target.rekap_tampil_jam.value === 'true';
                 const { error } = await supabase.from('settings').upsert({ id: 1, rekap_tampil_jam: val }, { onConflict: 'id' });
                 if (!error) {
                    setRekapTampilJam(val);
                    alert("Format Rekapitulasi berhasil diperbarui!");
                 } else {
                    alert("Error update: " + error.message);
                 }
                 setLoadingData(false);
               }}>
                 <div className="input-group">
                   <select name="rekap_tampil_jam" className="input" defaultValue={rekapTampilJam.toString()}>
                      <option value="false">Mode Ringkas: Hanya Tanda (✓ / S / I)</option>
                      <option value="true">Mode Detail: Tanda + Jam Masuk & Pulang</option>
                   </select>
                   <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Pilih Mode Ringkas agar tabel rekap bulanan berukuran lebih kecil dan mudah dimuat dalam 1 halaman cetak (PDF).</p>
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#4F46E5', color: 'white', width: '100%' }}>Simpan Format Rekap</button>
               </form>
             </div>

             <div className="card" style={{ border: 'none', background: 'white', marginBottom: '2rem' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Daftar Hari Libur (Manual)</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const startDateStr = e.target.tanggal_mulai.value;
                 const endDateStr = e.target.tanggal_selesai.value || startDateStr;
                 const keterangan = e.target.keterangan.value;
                 if(!startDateStr || !keterangan) return;
                 
                 const startDate = new Date(startDateStr);
                 const endDate = new Date(endDateStr);
                 
                 if (endDate < startDate) return alert("Tanggal selesai tidak boleh lebih kecil dari tanggal mulai.");
                 
                 setLoadingData(true);
                 const payload = [];
                 let currDate = new Date(startDate);
                 while(currDate <= endDate) {
                    payload.push({
                       tanggal: currDate.toLocaleDateString('en-CA'),
                       keterangan: keterangan
                    })
                    currDate.setDate(currDate.getDate() + 1);
                 }
                 
                 const { data, error } = await supabase.from('hari_libur').insert(payload).select();
                 if(!error && data) {
                    const mergedData = [...data, ...hariLiburData].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));
                    setHariLiburData(mergedData.slice(0, 50));
                    e.target.reset();
                    alert("Hari libur berhasil ditambahkan!");
                 } else {
                    alert("Gagal menambahkan hari libur.");
                 }
                 setLoadingData(false);
               }}>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div>
                       <label className="text-muted" style={{ fontSize: '0.75rem' }}>Mulai Tanggal</label>
                       <input type="date" name="tanggal_mulai" className="input" required />
                    </div>
                    <div>
                       <label className="text-muted" style={{ fontSize: '0.75rem' }}>Sampai Tanggal (Opsional)</label>
                       <input type="date" name="tanggal_selesai" className="input" />
                    </div>
                 </div>
                 <input type="text" name="keterangan" className="input" placeholder="Keterangan libur (misal: Cuti Bersama)" required />
                 <button type="submit" className="btn" style={{ padding: '0.8rem', marginTop: '0.5rem', background: '#10B981', color: 'white', width: '100%' }}>Tambah Hari Libur</button>
               </form>
               
               <div style={{ marginTop: '1.5rem' }}>
                  {hariLiburData.length === 0 ? <p className="text-muted" style={{ fontSize: '0.85rem' }}>Belum ada hari libur tersimpan.</p> : hariLiburData.map(h => (
                     <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderBottom: '1px solid #F1F5F9' }}>
                        <div>
                           <div style={{ fontWeight: '600', color: '#1E293B', fontSize: '0.9rem' }}>{new Date(h.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                           <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{h.keterangan}</div>
                        </div>
                        <button onClick={async () => {
                           if(!window.confirm('Hapus hari libur ini?')) return;
                           const { error } = await supabase.from('hari_libur').delete().eq('id', h.id);
                           if(!error) setHariLiburData(hariLiburData.filter(item => item.id !== h.id));
                        }} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><Trash2 size={16} /></button>
                     </div>
                  ))}
               </div>
             </div>

             <div className="card" style={{ border: 'none', background: 'white' }}>
               <h4 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Keamanan Akun</h4>
               <form onSubmit={async (e) => {
                 e.preventDefault();
                 const formData = new FormData(e.target);
                 const newPassword = formData.get('new_password');
                 
                 const { error } = await supabase.auth.updateUser({ password: newPassword });
                 if (!error) {
                   alert("Password berhasil diperbarui!");
                   e.target.reset();
                 } else {
                   alert("Gagal mengubah password: " + error.message);
                 }
               }}>
                 <div className="input-group">
                   <label className="input-label">Ubah Password Baru</label>
                   <input type="password" name="new_password" className="input" placeholder="Minimal 6 karakter" required minLength="6" />
                 </div>
                 <button type="submit" className="btn" style={{ padding: '1rem', marginTop: '0.5rem', background: '#334E68', color: 'white' }}>
                   Ubah Password
                 </button>
               </form>
             </div>
          </div>
        )}
      </div>

      <nav className="bottom-nav" style={{ paddingBottom: '1.5rem' }}>
        <button className={`nav-item active`} onClick={() => setActiveTab('overview')}>
          <Settings size={24} strokeWidth={2.5} /> Panel Utama
        </button>
        <button className={`nav-item`} onClick={async () => { await supabase.auth.signOut(); navigate('/'); }}>
          <LogOut size={24} strokeWidth={1.5} /> Log Out
        </button>
      </nav>
      {showExportModal && (
        <div className="popup-overlay" style={{ zIndex: 1000, padding: '1rem' }}>
          <div className="popup-content" style={{ maxWidth: '900px', width: '100%', padding: '1.5rem', borderRadius: '24px', background: 'white' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Pratinjau Laporan ({laporanTipe.toUpperCase()})</h2>
              <button onClick={() => setShowExportModal(false)} style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', background: '#F8FAFC', padding: '0.8rem', borderRadius: '12px' }}>
               <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Ukuran Huruf ({exportFontSize}px):</label>
               <input type="range" min="4" max="14" step="1" value={exportFontSize} onChange={(e) => setExportFontSize(parseInt(e.target.value))} style={{ flex: 1 }} />
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '50vh', border: '1px solid #E2E8F0', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <div id="export-preview-container" style={{ padding: '1.5rem', background: 'white', minWidth: laporanTipe === 'bulanan' ? '1200px' : '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontWeight: 'bold', fontSize: '1rem', color: 'black' }}>
                  <div style={{ fontSize: '1.2rem' }}>DAFTAR HADIR</div>
                  <div style={{ fontSize: '1.2rem' }}>GURU DAN TENAGA KEPENDIDIKAN</div>
                  <div style={{ fontSize: '1.2rem' }}>{namaSekolah.toUpperCase()}</div>
                </div>
                {laporanTipe === 'bulanan' && (
                  <div style={{ textAlign: 'left', marginBottom: '0.5rem', fontWeight: 'bold', color: 'black' }}>
                    Bulan : {exportPreviewData.monthName}
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead style={{ color: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      {exportPreviewData.columns.map((col, idx) => (
                        <th key={idx} style={{ padding: '0.5rem', border: '1px solid #E2E8F0', textAlign: 'center', whiteSpace: 'nowrap', background: exportPreviewData.redColumns?.includes(col) ? '#EF4444' : '#4F46E5' }}>{col}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {exportPreviewData.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {exportPreviewData.columns.map((col, cIdx) => {
                        let cellContent = row[col] || '-';
                        let bg = 'white';
                        let color = '#1E293B';
                        let bold = false;
                        
                        let isRedCol = exportPreviewData.redColumns?.includes(col);
                        if (isRedCol) bg = '#FEE2E2';
                        
                        if (laporanTipe === 'bulanan' && cIdx > 1 && cellContent !== '-') {
                           if (cellContent.status === 'hadir') {
                              color = '#2563EB'; // Blue
                              cellContent = rekapTampilJam ? `✓\nIn: ${cellContent.in}\nOut: ${cellContent.out}` : '✓';
                           } else if (cellContent.status === 'izin') {
                              bg = '#FBBF24'; // Yellow
                              color = 'white';
                              bold = true;
                              cellContent = 'IZIN';
                           } else if (cellContent.status === 'sakit') {
                              bg = '#EF4444'; // Red
                              color = 'white';
                              bold = true;
                              cellContent = 'SAKIT';
                           }
                        }

                        return (
                          <td key={cIdx} style={{ padding: laporanTipe === 'bulanan' ? (rekapTampilJam ? '0.4rem' : '0.2rem 0.1rem') : '0.4rem', border: '1px solid #E2E8F0', textAlign: 'center', whiteSpace: 'pre-wrap', background: bg, color: color, fontWeight: bold ? 'bold' : 'normal', verticalAlign: 'middle', fontSize: `${exportFontSize}px` }}>
                            {cellContent}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
               <button onClick={exportToExcel} className="btn" style={{ background: '#10B981', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download Excel
               </button>
               <button onClick={exportToPDF} className="btn" style={{ background: '#EF4444', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download PDF
               </button>
               <button onClick={exportToWord} className="btn" style={{ background: '#2563EB', color: 'white', padding: '0.8rem', fontSize: '0.9rem' }}>
                  Download Word
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
