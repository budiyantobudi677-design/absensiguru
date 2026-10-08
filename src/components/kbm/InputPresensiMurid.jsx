'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Calendar, CheckCircle2, UserCheck, AlertCircle, Save, Check, Users, Sparkles, Filter, ChevronRight } from 'lucide-react'

export default function InputPresensiMurid({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes?.[0]?.id || ''))
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [students, setStudents] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isHoliday, setIsHoliday] = useState(false)
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

      const { data: holData } = await supabase
        .from('school_holidays')
        .select('*')
        .eq('tanggal', selectedDate)
        .maybeSingle()
      setIsHoliday(!!holData)

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
      setMessage({ type: 'error', text: 'Gagal memuat data: ' + err.message })
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

  const handleMarkAll = (status) => {
    const updated = { ...attendanceMap }
    students.forEach(st => {
      updated[st.id] = status
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

      setMessage({ type: 'success', text: `Presensi ${students.length} siswa berhasil disimpan!` })
      setTimeout(() => setMessage(null), 4000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
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
    <div className="flex flex-col gap-4">
      {/* Hero Control Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Modul Presensi Siswa</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">Input Kehadiran Harian</h2>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
              <Sparkles size={13} /> {attendanceRate}% Kehadiran
            </span>
            {isHoliday && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                Hari Libur
              </span>
            )}
          </div>
        </div>

        {/* Filter Selection Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Pilih Rombel / Kelas</label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              {(classes || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Tanggal Pembelajaran</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in transition-all ${
          message.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-[11px] underline opacity-75 hover:opacity-100">Tutup</button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-white border border-emerald-100/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
            H
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 leading-none">{countH}</div>
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mt-1">Hadir</div>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-amber-100/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm shrink-0">
            S
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 leading-none">{countS}</div>
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mt-1">Sakit</div>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-blue-100/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0">
            I
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 leading-none">{countI}</div>
            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mt-1">Izin</div>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white border border-rose-100/80 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm shrink-0">
            A
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 leading-none">{countA}</div>
            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wide mt-1">Alpha</div>
          </div>
        </div>
      </div>

      {/* Main Student Attendance List Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Header & Quick Action */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-slate-500" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Daftar Siswa ({filteredStudents.length} dari {students.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Cari nama siswa..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => handleMarkAll('hadir')}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              ✓ Semua Hadir
            </button>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat daftar kehadiran siswa...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs px-4">
            {students.length === 0
              ? 'Belum ada siswa di kelas ini. Masukkan siswa lewat Master Siswa.'
              : 'Tidak ditemukan siswa yang cocok dengan pencarian.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredStudents.map((student, idx) => {
              const currentStatus = attendanceMap[student.id] || 'hadir'
              return (
                <div
                  key={student.id}
                  className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-xs font-bold text-slate-300">{idx + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/60">
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">{student.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        NISN: {student.nisn || '-'} • Gender: {student.gender === 'L' ? 'L' : 'P'}
                      </div>
                    </div>
                  </div>

                  {/* Status Toggle Pills */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center bg-slate-100/80 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'hadir')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        currentStatus === 'hadir'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-emerald-700'
                      }`}
                    >
                      H
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'sakit')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        currentStatus === 'sakit'
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'text-slate-600 hover:text-amber-700'
                      }`}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'izin')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        currentStatus === 'izin'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-blue-700'
                      }`}
                    >
                      I
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(student.id, 'alpha')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        currentStatus === 'alpha'
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-rose-700'
                      }`}
                    >
                      A
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer Submit Button */}
        <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Pastikan status kehadiran telah sesuai sebelum menyimpan.
          </span>
          <button
            onClick={handleSaveAttendance}
            disabled={saving || students.length === 0}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save size={15} />
            <span>{saving ? 'Menyimpan...' : 'Simpan Presensi'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
