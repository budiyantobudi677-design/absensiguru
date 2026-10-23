import React, { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { 
  X, Printer, Download, Search, School, Users, 
  QrCode, RefreshCw, Check, Sparkles, Filter
} from 'lucide-react'
import html2pdf from 'html2pdf.js'

export default function CetakKartuQrSiswaModal({
  isOpen,
  onClose,
  classes = [],
  selectedClassId = '',
  students = [],
  schoolInfo = {},
  supabase
}) {
  const [activeClass, setActiveClass] = useState(selectedClassId || classes[0]?.id || '')
  const [studentList, setStudentList] = useState([])
  const [loading, setLoading] = useState(false)
  const [qrMap, setQrMap] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const printAreaRef = useRef(null)

  const schoolName = schoolInfo?.school_name || schoolInfo?.nama || 'UPTD SPF SD NEGERI'

  // Update active class when prop changes
  useEffect(() => {
    if (selectedClassId) {
      setActiveClass(selectedClassId)
    } else if (classes.length > 0 && !activeClass) {
      setActiveClass(classes[0].id)
    }
  }, [selectedClassId, classes])

  // Fetch students for the chosen class
  useEffect(() => {
    if (!isOpen) return

    const loadStudents = async () => {
      setLoading(true)
      try {
        let query = supabase.from('students').select('*, kelas(name)').order('name', { ascending: true })
        if (activeClass && activeClass !== 'all') {
          query = query.eq('class_id', activeClass)
        }

        const { data, error } = await query
        if (error) throw error

        const list = data || []
        setStudentList(list)

        // Generate QR codes for all students
        const qrs = {}
        for (const st of list) {
          try {
            // Encode payload ringkas & terstruktur
            const payload = JSON.stringify({
              type: 'panrita_student',
              id: st.id,
              nisn: st.nisn || '',
              name: st.name
            })

            const dataUrl = await QRCode.toDataURL(payload, {
              width: 320,
              margin: 1,
              color: {
                dark: '#0F172A',
                light: '#FFFFFF'
              },
              errorCorrectionLevel: 'M'
            })
            qrs[st.id] = dataUrl
          } catch (e) {
            console.warn('Gagal buat QR untuk siswa:', st.name, e)
          }
        }
        setQrMap(qrs)
      } catch (err) {
        console.error('Error load students for QR:', err)
      } finally {
        setLoading(false)
      }
    }

    loadStudents()
  }, [isOpen, activeClass, supabase])

  const filteredStudents = studentList.filter(s => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (s.name || '').toLowerCase().includes(q) || (s.nisn || '').includes(q)
  })

  // Cetak dokumen menggunakan print preview browser
  const handlePrint = () => {
    window.print()
  }

  // Unduh PDF dokumen kartu
  const handleDownloadPdf = async () => {
    if (!printAreaRef.current) return
    setGeneratingPdf(true)
    try {
      const element = printAreaRef.current
      const currentClassName = classes.find(c => String(c.id) === String(activeClass))?.name || 'Semua_Kelas'
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Kartu_QR_Siswa_${currentClassName.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      console.error('Failed to generate PDF:', err)
      alert('Gagal mengekspor PDF: ' + err.message)
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Unduh satu kartu gambar
  const handleDownloadSingleQr = (student) => {
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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(8px)',
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
        maxWidth: '920px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        {/* Header Modal */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          color: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
            }}>
              <QrCode size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF' }}>
                Cetak Kartu QR Siswa
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>
                Format Kartu Presensi Digital Siap Cetak & Laminating (A4)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '10px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFFFFF'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar Filter & Aksi */}
        <div style={{
          padding: '0.85rem 1.5rem',
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            {/* Filter Rombel */}
            <select
              value={activeClass}
              onChange={(e) => setActiveClass(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#1E293B',
                background: '#FFFFFF',
                outline: 'none'
              }}
            >
              <option value="all">Semua Rombel / Kelas</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {/* Pencarian Nama Siswa */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari siswa..."
                style={{
                  padding: '0.55rem 0.85rem 0.55rem 2rem',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  color: '#1E293B',
                  background: '#FFFFFF',
                  outline: 'none',
                  width: '160px'
                }}
              />
            </div>

            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
              {filteredStudents.length} Kartu Siswa
            </span>
          </div>

          {/* Tombol Ekspor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || filteredStudents.length === 0}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Printer size={15} />
              <span>Cetak / Print Kartu</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={loading || generatingPdf || filteredStudents.length === 0}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}
            >
              <Download size={15} />
              <span>{generatingPdf ? 'Membuat PDF...' : 'Unduh PDF'}</span>
            </button>
          </div>
        </div>

        {/* Content Body: Area Kartu Siswa */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', background: '#F1F5F9' }}>
          {loading ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#64748B' }}>
              <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 0.75rem auto', color: '#3B82F6' }} />
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>Membuat kode QR dan tata letak kartu siswa...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#94A3B8' }}>
              <Users size={36} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#64748B' }}>Tidak ada data siswa</p>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>Pilih rombel lain atau tambahkan data siswa di Master Siswa.</p>
            </div>
          ) : (
            <div
              ref={printAreaRef}
              id="student-qr-printable-area"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1rem',
                background: 'transparent'
              }}
            >
              {filteredStudents.map((st) => {
                const classNameStr = st.kelas?.name || classes.find(c => String(c.id) === String(st.class_id))?.name || 'Siswa'
                const qrUrl = qrMap[st.id]

                return (
                  <div
                    key={st.id}
                    className="student-card-item"
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '16px',
                      border: '1.5px solid #CBD5E1',
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                      position: 'relative'
                    }}
                  >
                    {/* Header Kartu */}
                    <div style={{
                      background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
                      color: '#FFFFFF',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderTopLeftRadius: '14px',
                      borderTopRightRadius: '14px'
                    }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: '#3B82F6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 900,
                        fontSize: '0.75rem'
                      }}>
                        🏫
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {schoolName}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#94A3B8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          Kartu Presensi Digital
                        </div>
                      </div>
                    </div>

                    {/* Body Kartu: QR Code & Data Siswa */}
                    <div style={{
                      padding: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.85rem',
                      background: '#FFFFFF'
                    }}>
                      {/* Gambar QR Code */}
                      <div style={{
                        width: '105px',
                        height: '105px',
                        background: '#F8FAFC',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
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

                      {/* Info Siswa */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: '#0284C7',
                          background: '#E0F2FE',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'inline-block',
                          marginBottom: '4px'
                        }}>
                          {classNameStr}
                        </div>
                        <h4 style={{
                          margin: '0 0 2px 0',
                          fontSize: '0.88rem',
                          fontWeight: 800,
                          color: '#0F172A',
                          lineHeight: '1.25',
                          wordBreak: 'break-word'
                        }}>
                          {st.name}
                        </h4>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0' }}>
                          NISN: <strong style={{ color: '#1E293B' }}>{st.nisn || '-'}</strong>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                          JK: {st.gender === 'P' || st.gender === 'Perempuan' ? 'Perempuan' : 'Laki-laki'}
                        </div>
                      </div>
                    </div>

                    {/* Footer Kartu & Tombol Aksi */}
                    <div style={{
                      padding: '0.4rem 0.85rem',
                      background: '#F8FAFC',
                      borderTop: '1px solid #F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.65rem',
                      color: '#64748B'
                    }}>
                      <span>Pindai untuk absensi</span>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleQr(st)}
                        title="Unduh QR Saja (PNG)"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284C7',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                      >
                        <Download size={11} /> PNG
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer Dialog */}
        <div style={{
          padding: '0.85rem 1.5rem',
          borderTop: '1px solid #E2E8F0',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Tip: Cetak di kertas tebal / foto paper A4, lalu potong sesuai garis kartu untuk dilaminating.
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '10px',
              background: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Print Stylesheet khusus agar kartu rapi di A4 */}
      <style>{`
        @media print {
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
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12mm !important;
            padding: 10mm !important;
            background: white !important;
          }
          .student-card-item {
            box-shadow: none !important;
            border: 1px dashed #94A3B8 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  )
}
