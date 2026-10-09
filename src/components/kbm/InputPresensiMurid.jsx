'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Calendar, CheckCircle2, UserCheck, AlertCircle, Save, Check, Users, Sparkles, Search, CheckCheck } from 'lucide-react'

export default function InputPresensiMurid({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [students, setStudents] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isHoliday, setIsHoliday] = useState(false)
  const [holidayReason, setHolidayReason] = useState('')
  const [message, setMessage] = useState(null)
  const [searchFilter, setSearchFilter] = useState('')

  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id)
    }
  }, [classes, activeClassId])

  useEffect(() => {
    if (activeClassId) {
      fetchStudentsAndAttendance()
    }
  }, [activeClassId, selectedDate])

  const fetchStudentsAndAttendance = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const { data: studentList, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })

      if (sErr) throw sErr
      setStudents(studentList || [])

      // Cek Hari Libur
      const { data: holData } = await supabase
        .from('hari_libur')
        .select('*')
        .eq('tanggal', selectedDate)
        .maybeSingle()
      if (holData) {
        setIsHoliday(true)
        setHolidayReason(holData.keterangan || 'Libur Nasional / Sekolah')
      } else {
        setIsHoliday(false)
        setHolidayReason('')
      }

      // Ambil presensi yang sudah tercatat
      const { data: attList, error: aErr } = await supabase
        .from('student_attendance')
        .select('*')
        .eq('class_id', activeClassId)
        .eq('tanggal', selectedDate)

      if (aErr) throw aErr

      const map = {}
      if (attList) {
        attList.forEach(a => {
          map[a.student_id] = a.status
        })
      }
      setAttendanceMap(map)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal memuat data presensi: ' + err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = (studentId, status) => {
    setAttendanceMap(prev => ({
      ...prev,
      [studentId]: status
    }))
  }

  const handleMarkAllHadir = () => {
    const updated = { ...attendanceMap }
    students.forEach(st => {
      updated[st.id] = 'hadir'
    })
    setAttendanceMap(updated)
  }

  const handleSaveAttendance = async () => {
    if (!students || students.length === 0) return
    setSaving(true)
    setMessage(null)

    try {
      const recordsToUpsert = students.map(st => ({
        student_id: st.id,
        class_id: activeClassId,
        tanggal: selectedDate,
        status: attendanceMap[st.id] || 'hadir',
        teacher_id: user?.id,
        keterangan: null
      }))

      const { error } = await supabase
        .from('student_attendance')
        .upsert(recordsToUpsert, { onConflict: 'student_id,tanggal' })

      if (error) throw error

      setMessage({ type: 'success', text: `Presensi ${students.length} siswa berhasil disimpan ke sistem!` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan presensi: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const filteredStudents = students.filter(st =>
    st.name?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (st.nisn && st.nisn.includes(searchFilter))
  )

  const countH = students.filter(st => (attendanceMap[st.id] || 'hadir') === 'hadir').length
  const countS = students.filter(st => attendanceMap[st.id] === 'sakit').length
  const countI = students.filter(st => attendanceMap[st.id] === 'izin').length
  const countA = students.filter(st => attendanceMap[st.id] === 'alpha').length
  const attendanceRate = students.length > 0 ? ((countH / students.length) * 100).toFixed(0) : '100'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* Control Card: Kelas & Tanggal */}
      <div className="card" style={{ padding: '1.25rem', background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#10B981', background: '#ECFDF5', padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Modul Presensi Siswa
            </span>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', margin: '4px 0 0 0' }}>Input Presensi Harian</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#4F46E5', background: '#EEF2FF', padding: '5px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles size={13} /> {attendanceRate}% Kehadiran
            </span>
            {isHoliday && (
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#DC2626', background: '#FEF2F2', padding: '5px 12px', borderRadius: '12px' }}>
                Libur: {holidayReason}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Pilih Rombel / Kelas
            </label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="input"
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Tanggal Presensi
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input"
              style={{ padding: '0.65rem 0.85rem', fontSize: '0.875rem', borderRadius: '12px' }}
            />
          </div>
        </div>
      </div>

      {/* Alert Notifikasi */}
      {message && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '14px',
          fontSize: '0.85rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: message.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: message.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${message.type === 'success' ? '#A7F3D0' : '#FECACA'}`
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>
            Tutup
          </button>
        </div>
      )}

      {/* KPI Ringkasan Status Kehadiran */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #D1FAE5', background: '#F0FDF4' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#059669', lineHeight: 1 }}>{countH}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#059669', marginTop: '4px' }}>HADIR (H)</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #FEF3C7', background: '#FFFBEB' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#D97706', lineHeight: 1 }}>{countS}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#D97706', marginTop: '4px' }}>SAKIT (S)</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #DBEAFE', background: '#EFF6FF' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#2563EB', lineHeight: 1 }}>{countI}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#2563EB', marginTop: '4px' }}>IZIN (I)</div>
        </div>
        <div className="card text-center" style={{ padding: '0.75rem 0.25rem', borderRadius: '16px', border: '1px solid #FEE2E2', background: '#FEF2F2' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#DC2626', lineHeight: 1 }}>{countA}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#DC2626', marginTop: '4px' }}>ALPHA (A)</div>
        </div>
      </div>

      {/* Main Student Attendance List Card */}
      <div className="card" style={{ padding: 0, background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header Toolbar */}
        <div style={{ padding: '0.85rem 1.25rem', background: '#F8FAFC', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Daftar Siswa ({filteredStudents.length} / {students.length})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', maxWidth: '360px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Cari siswa..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="input"
                style={{ padding: '0.45rem 0.75rem 0.45rem 2rem', fontSize: '0.8rem', borderRadius: '10px' }}
              />
            </div>
            <button
              onClick={handleMarkAllHadir}
              type="button"
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                background: '#ECFDF5',
                color: '#059669',
                border: '1px solid #A7F3D0',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <CheckCheck size={14} /> Semua H
            </button>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Memuat daftar kehadiran siswa...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {students.length === 0
              ? 'Belum ada data siswa di kelas ini. Tambahkan siswa lewat menu Master Siswa.'
              : 'Tidak ditemukan siswa yang cocok dengan pencarian.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredStudents.map((student, idx) => {
              const currentStatus = attendanceMap[student.id] || 'hadir'
              return (
                <div
                  key={student.id}
                  style={{
                    padding: '0.9rem 1.15rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.45)'
                  }}
                >
                  {/* Baris Atas: Nomor Urut, Nama Lengkap Siswa, dan Sub-informasi */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: '800',
                      color: 'var(--text-muted)',
                      background: 'rgba(0,0,0,0.04)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      flexShrink: 0,
                      marginTop: '1px'
                    }}>
                      #{idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.92rem',
                        fontWeight: '700',
                        color: 'var(--text)',
                        lineHeight: 1.35,
                        wordBreak: 'break-word',
                        whiteSpace: 'normal'
                      }}>
                        {student.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {student.nisn && <span>NISN: <b>{student.nisn}</b></span>}
                        <span>{student.gender === 'P' ? 'Perempuan' : 'Laki-laki'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Baris Bawah: Tombol Presensi [Hadir] [Sakit] [Izin] [Alfa] Lebar & Nyaman disentuh */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                    width: '100%',
                    background: '#F1F5F9',
                    padding: '4px',
                    borderRadius: '12px'
                  }}>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'hadir')}
                      style={{
                        height: '38px',
                        borderRadius: '9px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: currentStatus === 'hadir' ? '#10B981' : 'transparent',
                        color: currentStatus === 'hadir' ? '#FFFFFF' : '#475569',
                        boxShadow: currentStatus === 'hadir' ? '0 2px 6px rgba(16, 185, 129, 0.4)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Hadir"
                    >
                      <span>H</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', opacity: currentStatus === 'hadir' ? 1 : 0.7 }}>Hadir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'sakit')}
                      style={{
                        height: '38px',
                        borderRadius: '9px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: currentStatus === 'sakit' ? '#F59E0B' : 'transparent',
                        color: currentStatus === 'sakit' ? '#FFFFFF' : '#475569',
                        boxShadow: currentStatus === 'sakit' ? '0 2px 6px rgba(245, 158, 11, 0.4)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Sakit"
                    >
                      <span>S</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', opacity: currentStatus === 'sakit' ? 1 : 0.7 }}>Sakit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'izin')}
                      style={{
                        height: '38px',
                        borderRadius: '9px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: currentStatus === 'izin' ? '#3B82F6' : 'transparent',
                        color: currentStatus === 'izin' ? '#FFFFFF' : '#475569',
                        boxShadow: currentStatus === 'izin' ? '0 2px 6px rgba(59, 130, 246, 0.4)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Izin"
                    >
                      <span>I</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', opacity: currentStatus === 'izin' ? 1 : 0.7 }}>Izin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'alpha')}
                      style={{
                        height: '38px',
                        borderRadius: '9px',
                        border: 'none',
                        fontSize: '0.82rem',
                        fontWeight: '800',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        background: currentStatus === 'alpha' ? '#EF4444' : 'transparent',
                        color: currentStatus === 'alpha' ? '#FFFFFF' : '#475569',
                        boxShadow: currentStatus === 'alpha' ? '0 2px 6px rgba(239, 68, 68, 0.4)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                      title="Alpha"
                    >
                      <span>A</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', opacity: currentStatus === 'alpha' ? 1 : 0.7 }}>Alfa</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer Submit Button */}
        <div style={{ padding: '1rem 1.25rem', background: '#F8FAFC', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Pastikan data kehadiran telah dicek sebelum disimpan.
          </span>
          <button
            onClick={handleSaveAttendance}
            disabled={saving || students.length === 0}
            className="btn btn-primary"
            style={{
              width: 'auto',
              padding: '0.65rem 1.5rem',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Save size={16} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Presensi'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
