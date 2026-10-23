import React, { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { 
  X, Printer, Download, Search, School, Users, 
  QrCode, RefreshCw, Check, Sparkles, Filter, FileText, CheckCircle2
} from 'lucide-react'
import html2pdf from 'html2pdf.js'
import { supabase as defaultSupabase } from '../../lib/supabase'

export default function CetakKartuQrSiswaModal({
  isOpen,
  onClose,
  classes = [],
  selectedClassId = '',
  students = [],
  schoolInfo = {},
  supabase
}) {
  const activeDb = supabase || defaultSupabase

  const [activeClass, setActiveClass] = useState(selectedClassId || classes[0]?.id || 'all')
  const [studentList, setStudentList] = useState([])
  const [loading, setLoading] = useState(false)
  const [qrMap, setQrMap] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [cardsPerPage, setCardsPerPage] = useState(6) // 6 kartu (Rekomendasi - Besar & Rapi) atau 8 kartu

  // Nama Sekolah dari Setting
  const [schoolName, setSchoolName] = useState(() => {
    return schoolInfo?.nama_sekolah || 
           schoolInfo?.schoolName || 
           schoolInfo?.school_name || 
           schoolInfo?.nama || 
           localStorage.getItem('gammara_school_name') || 
           localStorage.getItem('panrita_school_name') || 
           'SEKOLAH DASAR'
  })

  // Logo Sekolah dari Setting
  const [schoolLogo, setSchoolLogo] = useState(() => {
    return schoolInfo?.logo_sekolah || 
           schoolInfo?.schoolLogo || 
           schoolInfo?.logo || 
           localStorage.getItem('gammara_school_logo') || 
           localStorage.getItem('panrita_school_logo') || 
           ''
  })

  // Base64 Logo untuk menjamin html2canvas bebas dari CORS
  const [logoDataUrl, setLogoDataUrl] = useState('')

  const printAreaRef = useRef(null)

  // Helper konversi URL gambar ke Base64 Data URL (bebas CORS pada PDF export)
  const convertUrlToDataUrl = (url) => {
    return new Promise((resolve) => {
      if (!url) return resolve('')
      if (url.startsWith('data:')) return resolve(url)
      
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || img.width || 140
          canvas.height = img.naturalHeight || img.height || 140
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/png'))
        } catch (e) {
          console.warn('Canvas toDataURL failed, attempting fetch:', e)
          fetch(url, { mode: 'cors' })
            .then(res => res.blob())
            .then(blob => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result)
              reader.readAsDataURL(blob)
            })
            .catch(() => resolve(url))
        }
      }
      img.onerror = () => {
        fetch(url, { mode: 'cors' })
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(blob)
          })
          .catch(() => resolve(url))
      }
      img.src = url
    })
  }

  // Muat setting nama sekolah dan logo sekolah langsung dari database Supabase
  useEffect(() => {
    if (!isOpen) return

    if (activeDb) {
      activeDb.from('settings').select('nama_sekolah, logo_sekolah').limit(1).single().then(({ data }) => {
        if (data) {
          if (data.nama_sekolah) {
            setSchoolName(data.nama_sekolah)
            try {
              localStorage.setItem('gammara_school_name', data.nama_sekolah)
              localStorage.setItem('panrita_school_name', data.nama_sekolah)
            } catch (e) {}
          }
          if (data.logo_sekolah) {
            setSchoolLogo(data.logo_sekolah)
            try {
              localStorage.setItem('gammara_school_logo', data.logo_sekolah)
              localStorage.setItem('panrita_school_logo', data.logo_sekolah)
            } catch (e) {}
            convertUrlToDataUrl(data.logo_sekolah).then(dUrl => {
              if (dUrl) setLogoDataUrl(dUrl)
            })
          }
        }
      }).catch(() => {})
    }

    if (schoolLogo && !logoDataUrl) {
      convertUrlToDataUrl(schoolLogo).then(dUrl => {
        if (dUrl) setLogoDataUrl(dUrl)
      })
    }
  }, [isOpen, activeDb, schoolLogo])

  // Sinkronkan activeClass saat modal dibuka atau selectedClassId berubah
  useEffect(() => {
    if (selectedClassId) {
      setActiveClass(selectedClassId)
    } else if (classes && classes.length > 0 && (!activeClass || activeClass === 'all')) {
      setActiveClass(classes[0].id)
    }
  }, [selectedClassId, classes, isOpen])

  // Muat data siswa dan generate QR Code
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true

    const loadStudentsAndGenerateQr = async () => {
      setLoading(true)
      try {
        let list = []

        // 1. Coba ambil dari Supabase tabel 'students'
        if (activeDb) {
          try {
            let query = activeDb.from('students').select('*').order('name', { ascending: true })
            if (activeClass && activeClass !== 'all') {
              query = query.eq('class_id', activeClass)
            }
            const { data, error } = await query
            if (!error && data && data.length > 0) {
              list = data
            }
          } catch (dbErr) {
            console.warn('Query students from db failed, using props fallback:', dbErr)
          }
        }

        // 2. Fallback: jika query database kosong atau gagal, gunakan data 'students' dari props
        if ((!list || list.length === 0) && students && students.length > 0) {
          if (activeClass && activeClass !== 'all') {
            list = students.filter(s => String(s.class_id) === String(activeClass))
          } else {
            list = students
          }
        }

        if (!isMounted) return
        setStudentList(list)

        // 3. Generate QR Code untuk setiap siswa
        const qrs = {}
        for (const st of list) {
          try {
            const payload = JSON.stringify({
              type: 'panrita_student',
              id: st.id,
              nisn: st.nisn || '',
              name: st.name,
              class_id: st.class_id
            })

            const dataUrl = await QRCode.toDataURL(payload, {
              width: 360,
              margin: 1,
              color: {
                dark: '#0F172A',
                light: '#FFFFFF'
              },
              errorCorrectionLevel: 'M'
            })
            qrs[st.id] = dataUrl
          } catch (e) {
            console.warn('Gagal buat QR untuk:', st.name, e)
          }
        }

        if (isMounted) {
          setQrMap(qrs)
        }
      } catch (err) {
        console.error('Error in loadStudentsAndGenerateQr:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadStudentsAndGenerateQr()

    return () => {
      isMounted = false
    }
  }, [isOpen, activeClass, students, activeDb])

  // Helper pemformatan nama kelas: e.g. "VB" -> "Kelas VB", "5B" -> "Kelas 5B"
  const formatClassName = (rawName) => {
    if (!rawName || rawName === 'Siswa') return 'Kelas Siswa'
    const trimmed = String(rawName).trim()
    if (/^kelas\s+/i.test(trimmed)) return trimmed
    return `Kelas ${trimmed}`
  }

  const filteredStudents = studentList.filter(s => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (s.name || '').toLowerCase().includes(q) || (s.nisn || '').includes(q)
  })

  // Partisi siswa per lembar halaman A4 (6 kartu atau 8 kartu) agar tidak pernah terpotong di batas halaman PDF
  const pageSheets = []
  for (let i = 0; i < filteredStudents.length; i += cardsPerPage) {
    pageSheets.push(filteredStudents.slice(i, i + cardsPerPage))
  }

  // Cetak dokumen menggunakan print preview browser (tata letak rapi A4)
  const handlePrint = () => {
    window.print()
  }

  // Unduh PDF dokumen kartu
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return
    setGeneratingPdf(true)
    try {
      const element = printAreaRef.current
      const currentClassObj = classes.find(c => String(c.id) === String(activeClass))
      const classNameLabel = currentClassObj ? formatClassName(currentClassObj.name) : 'Semua_Kelas'
      
      const opt = {
        margin: [6, 6, 6, 6],
        filename: `Kartu_QR_Siswa_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${classNameLabel.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2.5, 
          useCORS: true, 
          allowTaint: true,
          scrollY: 0,
          scrollX: 0,
          letterRendering: false,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], after: '.html2pdf__page-break' }
      }
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      alert('Gagal mengekspor PDF: ' + err.message)
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Unduh satu kartu gambar PNG (Kartu utuh atau QR)
  const handleDownloadSingleCard = async (student) => {
    try {
      const cardEl = document.getElementById(`student-card-${student.id}`)
      if (cardEl && window.html2canvas) {
        const canvas = await window.html2canvas(cardEl, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          letterRendering: false,
          logging: false,
          ignoreElements: (el) => el.classList && el.classList.contains('no-pdf')
        })
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `Kartu_QR_${student.name.replace(/\s+/g, '_')}_${student.nisn || 'Siswa'}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }
    } catch (e) {
      console.warn('Gagal unduh visual kartu, unduh QR langsung:', e)
    }

    const dataUrl = qrMap[student.id]
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `QR_${student.name.replace(/\s+/g, '_')}_${student.nisn || 'Siswa'}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!isOpen) return null

  const effectiveLogo = logoDataUrl || schoolLogo
  const currentClassLabel = activeClass !== 'all' 
    ? formatClassName(classes.find(c => String(c.id) === String(activeClass))?.name) 
    : 'Semua Kelas'

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '1020px',
        maxHeight: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        {/* Header Modal */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
          color: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}>
              <QrCode size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                Cetak Kartu Presensi QR Siswa
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#93C5FD' }}>
                {schoolName} • {currentClassLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '12px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFFFFF',
              transition: 'background 0.2s'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar Kontrol, Filter & Ekspor */}
        <div style={{
          padding: '0.85rem 1.75rem',
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.85rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Filter Rombel */}
            <select
              value={activeClass}
              onChange={(e) => setActiveClass(e.target.value)}
              style={{
                padding: '0.55rem 0.95rem',
                borderRadius: '12px',
                border: '1.5px solid #CBD5E1',
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#0F172A',
                background: '#FFFFFF',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">Semua Rombel / Kelas</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{formatClassName(c.name)}</option>
              ))}
            </select>

            {/* Pencarian Nama Siswa */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa atau NISN..."
                style={{
                  padding: '0.55rem 0.95rem 0.55rem 2.1rem',
                  borderRadius: '12px',
                  border: '1.5px solid #CBD5E1',
                  fontSize: '0.84rem',
                  color: '#0F172A',
                  background: '#FFFFFF',
                  outline: 'none',
                  width: '185px'
                }}
              />
            </div>

            {/* Pengaturan Kartu per Lembar (6 kartu atau 8 kartu) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '3px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => setCardsPerPage(6)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: cardsPerPage === 6 ? '#0284C7' : 'transparent',
                  color: cardsPerPage === 6 ? '#FFFFFF' : '#64748B'
                }}
                title="Format 6 Kartu per A4: Kartu lebih besar, teks dan foto sangat jelas (Rekomendasi)"
              >
                6 Kartu / A4
              </button>
              <button
                type="button"
                onClick={() => setCardsPerPage(8)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: cardsPerPage === 8 ? '#0284C7' : 'transparent',
                  color: cardsPerPage === 8 ? '#FFFFFF' : '#64748B'
                }}
                title="Format 8 Kartu per A4: Lebih hemat kertas"
              >
                8 Kartu / A4
              </button>
            </div>

            <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
              {filteredStudents.length} Siswa ({pageSheets.length} Lembar A4)
            </span>
          </div>

          {/* Tombol Cetak & Unduh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || filteredStudents.length === 0}
              style={{
                padding: '0.62rem 1.25rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                cursor: loading || filteredStudents.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Printer size={16} />
              <span>Cetak / Print</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={loading || generatingPdf || filteredStudents.length === 0}
              style={{
                padding: '0.62rem 1.25rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.84rem',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                cursor: loading || generatingPdf || filteredStudents.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}
            >
              <Download size={16} />
              <span>{generatingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
            </button>
          </div>
        </div>

        {/* Content Body: Area Lembar Kartu Siswa */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#F1F5F9' }}>
          {loading ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw className="animate-spin" size={34} style={{ margin: '0 auto 0.85rem auto', color: '#0284C7' }} />
              <p style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Membuat kode QR dan tata letak kartu siswa...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#94A3B8' }}>
              <Users size={40} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#475569' }}>Tidak ada data siswa ditemukan</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem' }}>
                Pilih rombel kelas lain di atas, atau pastikan data siswa sudah terdaftar di menu Master Siswa.
              </p>
            </div>
          ) : (
            <div ref={printAreaRef} id="student-qr-printable-area">
              {pageSheets.map((sheetStudents, pageIdx) => (
                <div
                  key={pageIdx}
                  className="a4-print-sheet"
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '18px',
                    padding: '1.25rem',
                    marginBottom: '1.75rem',
                    border: '1.5px solid #E2E8F0',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                    pageBreakAfter: pageIdx < pageSheets.length - 1 ? 'always' : 'auto',
                    breakAfter: pageIdx < pageSheets.length - 1 ? 'page' : 'auto',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid'
                  }}
                >
                  {/* Header Lembar A4 (Memastikan rapi dan memudahkan pengelompokan saat dicetak) */}
                  <div className="sheet-page-header" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '0.65rem',
                    marginBottom: '1rem',
                    borderBottom: '1.5px dashed #CBD5E1',
                    fontSize: '0.78rem',
                    color: '#64748B',
                    fontWeight: 700
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#0F172A', fontWeight: 800, textTransform: 'uppercase' }}>{schoolName}</span>
                      <span>•</span>
                      <span style={{ color: '#0284C7' }}>{currentClassLabel}</span>
                    </div>
                    <span>Lembar Halaman {pageIdx + 1} dari {pageSheets.length}</span>
                  </div>

                  {/* Grid 2 Kolom untuk Kartu */}
                  <div
                    className="print-card-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '0.95rem'
                    }}
                  >
                    {sheetStudents.map((st) => {
                      const currentClassObj = classes.find(c => String(c.id) === String(st.class_id)) || classes.find(c => String(c.id) === String(activeClass))
                      const rawClassName = currentClassObj?.name || 'Siswa'
                      const formattedClass = formatClassName(rawClassName)
                      const qrUrl = qrMap[st.id]

                      return (
                        <div
                          key={st.id}
                          id={`student-card-${st.id}`}
                          className="student-card-item"
                          style={{
                            background: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1.5px solid #CBD5E1',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            pageBreakInside: 'avoid',
                            breakInside: 'avoid',
                            position: 'relative',
                            boxSizing: 'border-box'
                          }}
                        >
                          {/* Header Kartu: Logo Sekolah, Nama Sekolah & Judul Kartu */}
                          <div style={{
                            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 65%, #1D4ED8 100%)',
                            color: '#FFFFFF',
                            padding: '0.75rem 0.95rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            borderTopLeftRadius: '14px',
                            borderTopRightRadius: '14px',
                            boxSizing: 'border-box'
                          }}>
                            {/* Logo Sekolah Resmi */}
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              background: '#FFFFFF',
                              border: '2px solid rgba(255, 255, 255, 0.9)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              overflow: 'hidden',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              padding: '2px'
                            }}>
                              {effectiveLogo ? (
                                <img
                                  src={effectiveLogo}
                                  alt="Logo"
                                  crossOrigin="anonymous"
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <School size={20} color="#1E3A8A" />
                              )}
                            </div>

                            {/* Teks Nama Sekolah (Bersih, rapi & tidak terpotong di canvas/PDF) */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.84rem',
                                fontWeight: 800,
                                color: '#FFFFFF',
                                lineHeight: '1.38',
                                textTransform: 'uppercase',
                                letterSpacing: '0.25px',
                                wordBreak: 'break-word',
                                paddingTop: '2px',
                                paddingBottom: '1px'
                              }}>
                                {schoolName}
                              </div>
                              <div style={{
                                fontSize: '0.62rem',
                                color: '#93C5FD',
                                fontWeight: 700,
                                letterSpacing: '0.8px',
                                textTransform: 'uppercase',
                                lineHeight: '1.3',
                                marginTop: '2px'
                              }}>
                                Kartu Presensi Digital Siswa
                              </div>
                            </div>
                          </div>

                          {/* Body Kartu: QR Code & Data Lengkap Siswa */}
                          <div style={{
                            padding: '0.85rem 0.95rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.95rem',
                            background: '#FFFFFF',
                            flex: 1
                          }}>
                            {/* Frame QR Code */}
                            <div style={{
                              width: '100px',
                              height: '100px',
                              background: '#FFFFFF',
                              borderRadius: '12px',
                              border: '1.5px solid #E2E8F0',
                              padding: '5px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                            }}>
                              {qrUrl ? (
                                <img
                                  src={qrUrl}
                                  alt={`QR ${st.name}`}
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                              ) : (
                                <RefreshCw className="animate-spin" size={20} color="#94A3B8" />
                              )}
                            </div>

                            {/* Info Siswa: Badge Kelas, Nama, NISN & Jenis Kelamin */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Badge Kelas (e.g. "Kelas VB") */}
                              <div style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                color: '#1D4ED8',
                                background: '#EFF6FF',
                                border: '1.5px solid #BFDBFE',
                                padding: '2.5px 10px',
                                borderRadius: '20px',
                                display: 'inline-block',
                                marginBottom: '5px',
                                lineHeight: '1.2'
                              }}>
                                {formattedClass}
                              </div>

                              {/* Nama Siswa (Bersih, rapi & tidak terpotong di canvas/PDF) */}
                              <div style={{
                                fontSize: '0.94rem',
                                fontWeight: 800,
                                color: '#0F172A',
                                lineHeight: '1.38',
                                wordBreak: 'break-word',
                                textTransform: 'uppercase',
                                letterSpacing: '0.2px',
                                paddingTop: '2px',
                                paddingBottom: '2px',
                                marginBottom: '4px'
                              }}>
                                {st.name}
                              </div>

                              {/* NISN & Jenis Kelamin dalam baris rapi */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: '1.35' }}>
                                  NISN: <span style={{ color: '#0F172A', fontWeight: 700 }}>{st.nisn || '-'}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', lineHeight: '1.35' }}>
                                  JK: <span style={{ color: '#334155', fontWeight: 600 }}>{st.gender === 'P' || st.gender === 'Perempuan' ? 'Perempuan' : 'Laki-laki'}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer Kartu & Tombol Aksi PNG */}
                          <div style={{
                            padding: '0.45rem 0.95rem',
                            background: '#F8FAFC',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.66rem',
                            color: '#64748B'
                          }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#059669', fontWeight: 700 }}>
                              <CheckCircle2 size={12} color="#10B981" />
                              <span>Pindai untuk absensi</span>
                            </span>

                            {/* Watermark untuk PDF / Cetak */}
                            <span className="print-watermark" style={{ display: generatingPdf ? 'block' : 'none', color: '#94A3B8', fontWeight: 600, fontSize: '0.64rem' }}>
                              GammaraApp • Kartu Resmi
                            </span>

                            {/* Tombol aksi PNG untuk interaktif modal */}
                            <button
                              type="button"
                              className="no-pdf no-print"
                              onClick={() => handleDownloadSingleCard(st)}
                              title="Unduh Kartu Siswa Ini (PNG)"
                              style={{
                                display: generatingPdf ? 'none' : 'flex',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '6px',
                                padding: '2px 8px',
                                color: '#1D4ED8',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Download size={11} /> PNG
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Explicit Page Break Marker untuk html2pdf */}
                  {pageIdx < pageSheets.length - 1 && (
                    <div className="html2pdf__page-break" style={{ pageBreakAfter: 'always', breakAfter: 'page', height: 0, margin: 0, padding: 0 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Dialog */}
        <div style={{
          padding: '0.95rem 1.75rem',
          borderTop: '1px solid #E2E8F0',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
            💡 Tip: Cetak pada kertas tebal / foto paper A4, lalu potong sesuai garis batas kartu untuk dilaminating.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.4rem',
              borderRadius: '12px',
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Print Stylesheet khusus agar kartu rapi di A4 dan tidak terpotong */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body * {
            visibility: hidden;
          }
          #student-qr-printable-area, #student-qr-printable-area * {
            visibility: visible;
          }
          #student-qr-printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .a4-print-sheet {
            width: 100% !important;
            min-height: 275mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: block !important;
            margin-bottom: 0 !important;
            box-shadow: none !important;
            border: none !important;
            padding: 4mm !important;
          }
          .sheet-page-header {
            display: flex !important;
            margin-bottom: 6mm !important;
          }
          .print-card-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 7mm !important;
          }
          .student-card-item {
            box-shadow: none !important;
            border: 1.5px dashed #94A3B8 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, .no-pdf {
            display: none !important;
          }
          .print-watermark {
            display: block !important;
          }
        }
      `}</style>
    </div>
  )
}
