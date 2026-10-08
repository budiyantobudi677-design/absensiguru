'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Calendar, CheckCircle2, AlertCircle, Save, RefreshCw, Sun, Moon } from 'lucide-react'

export default function InputPresensiMurid({ selectedClass, classes, user, schoolInfo }) {
  const [activeClassId, setActiveClassId] = useState(selectedClass?.id || (classes[0]?.id || ''))
  const [selectedDate, setSelectedDate] = useState('')
  const [students, setStudents] = useState([])
  const [attendanceMap, setAttendanceMap] = useState({}) // { studentId: 'hadir' | 'sakit' | 'izin' | 'alpha' }
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isHoliday, setIsHoliday] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    setSelectedDate(new Date().toLocaleDateString('en-CA'))
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
      // 1. Fetch Students in class
      const { data: studentList, error: sErr } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', activeClassId)
        .order('name', { ascending: true })

      if (sErr) throw sErr
      setStudents(studentList || [])

      // 2. Check if holiday
      const { data: holData } = await supabase
        .from('school_holidays')
        .select('*')
        .eq('tanggal', selectedDate)
        .maybeSingle()
      setIsHoliday(!!holData)

      // 3. Fetch existing attendance records
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

  const handleMarkAllHadir = () => {
    const updated = { ...attendanceMap }
    students.forEach(st => {
      if (!updated[st.id]) {
        updated[st.id] = 'hadir'
      }
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
        teacher_id: user?.id || null
      }))

      const { error } = await supabase
        .from('student_attendance')
        .upsert(recordsToUpsert, { onConflict: 'student_id, tanggal' })

      if (error) throw error

      setMessage({ type: 'success', text: 'Presensi murid berhasil disimpan ke cloud!' })
      setTimeout(() => setMessage(null), 3000)
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Gagal menyimpan: ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  const countH = students.filter(s => attendanceMap[s.id] === 'hadir').length
  const countS = students.filter(s => attendanceMap[s.id] === 'sakit').length
  const countI = students.filter(s => attendanceMap[s.id] === 'izin').length
  const countA = students.filter(s => attendanceMap[s.id] === 'alpha').length

  return (
    <div className="flex flex-col gap-4">
      {/* Selector & Tanggal Card */}
      <div className="card" style={{ padding: '1.25rem', borderRadius: '18px' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <span>📝</span> Input Presensi Siswa
            </h3>
            <p className="text-xs text-muted">Pilih kelas & tanggal untuk mencatat absensi murid.</p>
          </div>
          {isHoliday && (
            <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-bold">
              🚩 Hari Libur Sekolah
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Pilih Kelas</label>
            <select
              value={activeClassId}
              onChange={(e) => setActiveClassId(e.target.value)}
              className="input text-sm font-semibold"
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Pilih Tanggal</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input text-sm font-semibold"
            />
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-xs font-semibold text-center border ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Quick Summary Pill */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-green-50 border border-green-200 text-center">
          <div className="text-base font-black text-green-700">{countH}</div>
          <div className="text-[10px] font-bold text-green-600">HADIR</div>
        </div>
        <div className="p-2.5 rounded-xl bg-yellow-50 border border-yellow-200 text-center">
          <div className="text-base font-black text-yellow-700">{countS}</div>
          <div className="text-[10px] font-bold text-yellow-600">SAKIT</div>
        </div>
        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-center">
          <div className="text-base font-black text-blue-700">{countI}</div>
          <div className="text-[10px] font-bold text-blue-600">IZIN</div>
        </div>
        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-center">
          <div className="text-base font-black text-red-700">{countA}</div>
          <div className="text-[10px] font-bold text-red-600">ALPHA</div>
        </div>
      </div>

      {/* Student List Table */}
      <div className="card" style={{ padding: '1rem', borderRadius: '18px' }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-muted">DAFTAR SISWA ({students.length})</span>
          <button
            onClick={handleMarkAllHadir}
            className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
          >
            ✓ Semua Hadir
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-muted text-xs">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full spin mx-auto mb-2"></div>
            Memuat data siswa...
          </div>
        ) : students.length === 0 ? (
          <div className="py-8 text-center text-muted text-xs">
            Belum ada data siswa di kelas ini. Tambahkan siswa terlebih dahulu di menu Pengaturan / Master Siswa.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {students.map((student, idx) => {
              const currentStatus = attendanceMap[student.id] || 'hadir'
              return (
                <div
                  key={student.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-all gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-gray-400">{idx + 1}</span>
                    <div>
                      <div className="text-xs font-bold text-gray-800">{student.name}</div>
                      {student.gender && (
                        <div className="text-[10px] text-gray-400">({student.gender === 'L' ? 'Laki-laki' : 'Perempuan'})</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => handleStatusChange(student.id, 'hadir')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        currentStatus === 'hadir'
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                      }`}
                    >
                      H
                    </button>
                    <button
                      onClick={() => handleStatusChange(student.id, 'sakit')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        currentStatus === 'sakit'
                          ? 'bg-yellow-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-yellow-50'
                      }`}
                    >
                      S
                    </button>
                    <button
                      onClick={() => handleStatusChange(student.id, 'izin')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        currentStatus === 'izin'
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
                      }`}
                    >
                      I
                    </button>
                    <button
                      onClick={() => handleStatusChange(student.id, 'alpha')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        currentStatus === 'alpha'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-red-50'
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

        {students.length > 0 && (
          <button
            onClick={handleSaveAttendance}
            disabled={saving}
            className="btn btn-primary mt-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin"></div> : <Save size={16} />}
            {saving ? 'Menyimpan...' : 'Simpan Presensi Kelas'}
          </button>
        )}
      </div>
    </div>
  )
}
