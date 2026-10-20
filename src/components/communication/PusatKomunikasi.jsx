import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Users,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Calendar,
  Share2,
  ExternalLink,
  Plus,
  Check,
  User,
  Search,
  RefreshCw,
  Bell,
  BookOpen,
  FileText
} from 'lucide-react'
import {
  CHAT_CHANNELS,
  fetchMessages,
  sendChatMessage,
  fetchDispositions,
  createDisposition,
  updateDispositionStatus,
  openWhatsAppDirect,
  createAttendanceReminderTemplate,
  createPersonalReminderTemplate,
  createStudentAbsenceTemplate,
  createAnnouncementWhatsAppTemplate
} from '../../lib/schoolCommunicationManager'

export default function PusatKomunikasi({ user, supabase, darkMode = false }) {
  const [activeMainTab, setActiveMainTab] = useState('chat') // 'chat' | 'disposisi' | 'wa_tools'
  const [activeChannel, setActiveChannel] = useState('umum') // 'umum' | 'kkg' | 'kedinasan' | 'private'
  const [selectedPartner, setSelectedPartner] = useState(null) // user object for private chat
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)

  // Disposisi state
  const [dispositions, setDispositions] = useState([])
  const [loadingDispositions, setLoadingDispositions] = useState(false)
  const [showAddDispModal, setShowAddDispModal] = useState(false)
  const [dispTitle, setDispTitle] = useState('')
  const [dispDesc, setDispDesc] = useState('')
  const [dispTargetId, setDispTargetId] = useState('')
  const [dispDeadline, setDispDeadline] = useState('')
  const [submittingDisp, setSubmittingDisp] = useState(false)

  // Guru & Pegawai list
  const [teachersList, setTeachersList] = useState([])
  const [teacherSearch, setTeacherSearch] = useState('')

  // WA Tools state
  const [schoolName, setSchoolName] = useState('Sekolah')
  const [pengumumanList, setPengumumanList] = useState([])
  const [unclockedTeachers, setUnclockedTeachers] = useState([])
  const [editableAnnouncementText, setEditableAnnouncementText] = useState('')

  // Sinkronisasi teks pengumuman yang dapat diedit dengan data pengumuman terbaru
  useEffect(() => {
    const latest = pengumumanList[0]
    const initialText = createAnnouncementWhatsAppTemplate({
      schoolName,
      title: latest?.judul || 'Pemberitahuan Sekolah',
      content: latest?.pesan || latest?.isi || 'Dihimbau kepada seluruh Bapak/Ibu Guru dan Tenaga Kependidikan untuk senantiasa memperhatikan kedisiplinan dan koordinasi kegiatan sekolah.',
      dateStr: latest?.created_at ? new Date(latest.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
    })
    setEditableAnnouncementText(prev => prev ? prev : initialText)
  }, [schoolName, pengumumanList])

  const messagesEndRef = useRef(null)
  const sendingRef = useRef(false)

  const currentUserId = user?.id

  // Helper deduplikasi pesan: hindari ID duplikat atau pengiriman ganda dalam selisih waktu sangat cepat
  const deduplicateMessages = (msgList) => {
    if (!Array.isArray(msgList)) return []
    const result = []
    const seenIds = new Set()

    for (let i = 0; i < msgList.length; i++) {
      const m = msgList[i]
      if (!m || !m.id) continue
      if (seenIds.has(m.id)) continue

      // Cek apakah pesan ini duplikat cepat dari pesan sebelumnya (teks sama, pengirim sama, channel sama, waktu <= 3 detik)
      const prev = result[result.length - 1]
      if (
        prev &&
        prev.sender_id === m.sender_id &&
        prev.channel === m.channel &&
        prev.message === m.message &&
        Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 3000
      ) {
        continue
      }

      seenIds.add(m.id)
      result.push(m)
    }
    return result
  }

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load teachers, school name, and initial data
  useEffect(() => {
    async function initData() {
      try {
        const [{ data: profs }, { data: sSet }, { data: pList }] = await Promise.all([
          supabase.from('profiles').select('*').order('full_name'),
          supabase.from('school_settings').select('school_name').limit(1),
          supabase.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(20)
        ])

        if (profs) setTeachersList(profs)
        if (sSet && sSet[0]?.school_name) setSchoolName(sSet[0].school_name)
        if (pList) {
          const validPengumuman = pList.filter(p => {
            if (p.target_type && p.target_type.startsWith('__')) return false
            return p.pesan || p.isi || p.judul
          })
          setPengumumanList(validPengumuman)
        }

        // Cek guru yang belum absen hari ini
        const todayStr = new Date().toLocaleDateString('en-CA')
        const { data: todayAbs } = await supabase
          .from('absensi')
          .select('user_id')
          .eq('tanggal', todayStr)

        const clockedIds = new Set((todayAbs || []).map(a => a.user_id))
        const unclocked = (profs || []).filter(p => !clockedIds.has(p.id))
        setUnclockedTeachers(unclocked)
      } catch (e) {
        console.warn('Init communication data error:', e)
      }
    }
    initData()
  }, [supabase])

  // Load messages whenever channel or partner changes
  useEffect(() => {
    let isMounted = true
    async function loadChat() {
      setLoadingMessages(true)
      const data = await fetchMessages({
        supabase,
        channel: activeChannel,
        currentUserId,
        partnerId: selectedPartner?.id,
        limit: 80
      })
      if (isMounted) {
        setMessages(deduplicateMessages(data || []))
        setLoadingMessages(false)
        setTimeout(scrollToBottom, 100)
      }
    }
    loadChat()

    // Realtime subscription dengan channel name terisolasi
    const channelSubName = `realtime:school_chat:${activeChannel}:${selectedPartner?.id || 'group'}_${Date.now()}`
    const channelSub = supabase
      .channel(channelSubName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'school_chat_messages' },
        (payload) => {
          const newMsg = payload.new
          if (!newMsg || !newMsg.id) return

          // Cek apakah pesan cocok dengan channel/partner yang sedang dibuka
          if (activeChannel === 'private') {
            if (
              (newMsg.sender_id === currentUserId && newMsg.receiver_id === selectedPartner?.id) ||
              (newMsg.sender_id === selectedPartner?.id && newMsg.receiver_id === currentUserId)
            ) {
              setMessages(prev => {
                // Jangan tambahkan jika ID pesan sudah ada (mencegah pesan double dari event realtime vs sendChatMessage)
                if (prev.some(m => m.id === newMsg.id)) return prev
                const last = prev[prev.length - 1]
                if (
                  last &&
                  last.sender_id === newMsg.sender_id &&
                  last.message === newMsg.message &&
                  Math.abs(new Date(newMsg.created_at).getTime() - new Date(last.created_at).getTime()) < 3000
                ) {
                  return prev
                }
                return [...prev, newMsg]
              })
              setTimeout(scrollToBottom, 100)
            }
          } else if (newMsg.channel === activeChannel) {
            setMessages(prev => {
              // Jangan tambahkan jika ID pesan sudah ada
              if (prev.some(m => m.id === newMsg.id)) return prev
              const last = prev[prev.length - 1]
              if (
                last &&
                last.sender_id === newMsg.sender_id &&
                last.channel === newMsg.channel &&
                last.message === newMsg.message &&
                Math.abs(new Date(newMsg.created_at).getTime() - new Date(last.created_at).getTime()) < 3000
              ) {
                return prev
              }
              return [...prev, newMsg]
            })
            setTimeout(scrollToBottom, 100)
          }
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channelSub)
    }
  }, [supabase, activeChannel, selectedPartner, currentUserId])

  // Load dispositions
  useEffect(() => {
    if (activeMainTab === 'disposisi') {
      loadDispositionsData()
    }
  }, [activeMainTab])

  const loadDispositionsData = async () => {
    setLoadingDispositions(true)
    const list = await fetchDispositions({
      supabase,
      userId: currentUserId,
      role: user?.role || 'guru'
    })
    setDispositions(list)
    setLoadingDispositions(false)
  }

  // Handle send message
  const handleSendMessage = async (e) => {
    e?.preventDefault()
    const textToSend = inputText.trim()
    if (!textToSend || sendingRef.current || sending) return

    sendingRef.current = true
    setSending(true)
    setInputText('') // Segera kosongkan input form agar tidak dapat dikirim ganda

    try {
      const sent = await sendChatMessage({
        supabase,
        senderId: currentUserId,
        receiverId: activeChannel === 'private' ? selectedPartner?.id : null,
        channel: activeChannel,
        message: textToSend
      })
      if (sent) {
        setMessages(prev => {
          // Cegah double jika event realtime telah lebih dulu menambahkan pesan
          if (prev.some(m => m.id === sent.id)) return prev
          return [...prev, sent]
        })
        setTimeout(scrollToBottom, 50)
      }
    } catch (err) {
      setInputText(textToSend) // Kembalikan isi teks jika pengiriman gagal
      alert(`Gagal mengirim pesan: ${err.message}`)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  // Handle create disposition
  const handleCreateDisposition = async (e) => {
    e.preventDefault()
    if (!dispTitle.trim() || !dispTargetId) {
      alert('Judul dan guru penerima wajib diisi.')
      return
    }

    setSubmittingDisp(true)
    try {
      await createDisposition({
        supabase,
        fromUserId: currentUserId,
        toUserId: dispTargetId,
        title: dispTitle,
        description: dispDesc,
        deadline: dispDeadline
      })
      setShowAddDispModal(false)
      setDispTitle('')
      setDispDesc('')
      setDispTargetId('')
      setDispDeadline('')
      loadDispositionsData()
      alert('Instruksi tugas kedinasan berhasil dikirim ke guru yang dituju!')
    } catch (err) {
      alert(`Gagal membuat instruksi: ${err.message}`)
    } finally {
      setSubmittingDisp(false)
    }
  }

  // Filter teachers for private chat
  const filteredTeachers = teachersList.filter(t => {
    if (t.id === currentUserId) return false
    const q = teacherSearch.toLowerCase()
    return (
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.nip || '').includes(q)
    )
  })

  const isLeader = user?.role === 'admin' || user?.role === 'kepsek'

  return (
    <div className="fade-in" style={{ paddingBottom: '2rem' }}>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={24} color="#4F46E5" />
            Pusat Komunikasi & Koordinasi Sekolah
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
            Ruang diskusi dewan guru, instruksi dinas pimpinan, dan integrasi WhatsApp cepat
          </p>
        </div>

        {/* NOTIFIKASI RETENSI 14 HARI */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '20px',
            background: darkMode ? '#1E1B4B' : '#EEF2FF',
            border: darkMode ? '1px solid #3730A3' : '1px solid #C7D2FE',
            fontSize: '0.74rem',
            color: darkMode ? '#C7D2FE' : '#3730A3',
            fontWeight: 600
          }}
        >
          <ShieldCheck size={14} color="#4F46E5" />
          <span>Pembersihan Otomatis 14 Hari Aktif</span>
        </div>
      </div>

      {/* TAB NAVIGASI UTAMA */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
          marginBottom: '1.25rem',
          overflowX: 'auto',
          paddingBottom: '4px'
        }}
      >
        {[
          { id: 'chat', label: '💬 Obrolan Internal Staf', desc: 'Chat pribadi & grup dewan guru' },
          { id: 'disposisi', label: '📌 Disposisi & Instruksi Pimpinan', desc: 'Lembar tugas kedinasan resmi' },
          { id: 'wa_tools', label: '📲 Tombol WhatsApp Instan', desc: 'Pengingat presensi & pengumuman gratis' }
        ].map(tab => {
          const isActive = activeMainTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveMainTab(tab.id)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px 12px 0 0',
                border: 'none',
                borderBottom: isActive ? '3px solid #4F46E5' : '3px solid transparent',
                background: isActive ? (darkMode ? '#1E293B' : '#FFFFFF') : 'transparent',
                color: isActive ? '#4F46E5' : (darkMode ? '#94A3B8' : '#64748B'),
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.86rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OBROLAN INTERNAL SEKOLAH (CHAT ROOM) */}
      {/* ========================================================================= */}
      {activeMainTab === 'chat' && (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 300px) 1fr',
            minHeight: '560px',
            background: darkMode ? '#1E293B' : '#FFFFFF',
            border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
            borderRadius: '16px'
          }}
        >
          {/* KOLOM KIRI: DAFTAR RUANG / CHANNEL & KONTAK GURU */}
          <div
            style={{
              borderRight: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
              background: darkMode ? '#0F172A' : '#F8FAFC',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header Kolom Kiri */}
            <div style={{ padding: '1rem', borderBottom: darkMode ? '1px solid #334155' : '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: darkMode ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Ruang Diskusi Resmi
              </div>
            </div>

            {/* List Channels */}
            <div style={{ padding: '8px' }}>
              {CHAT_CHANNELS.map(ch => {
                const isSelected = activeChannel === ch.id
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setActiveChannel(ch.id)
                      setSelectedPartner(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isSelected ? '#4F46E5' : 'transparent',
                      color: isSelected ? 'white' : (darkMode ? '#F8FAFC' : '#1E293B'),
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '4px',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>{ch.icon}</span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {ch.label}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: isSelected ? 'rgba(255,255,255,0.8)' : (darkMode ? '#94A3B8' : '#64748B') }}>
                        {ch.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Header Chat Pribadi */}
            <div style={{ padding: '10px 1rem 6px 1rem', borderTop: darkMode ? '1px solid #334155' : '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: darkMode ? '#94A3B8' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                Obrolan Pribadi Staf
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Cari guru / tendik..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: '8px',
                    border: darkMode ? '1px solid #334155' : '1px solid #CBD5E1',
                    background: darkMode ? '#1E293B' : 'white',
                    color: darkMode ? '#F8FAFC' : '#1E293B',
                    fontSize: '0.76rem'
                  }}
                />
              </div>
            </div>

            {/* List Kontak Guru */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
              {filteredTeachers.map(t => {
                const isSelected = activeChannel === 'private' && selectedPartner?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveChannel('private')
                      setSelectedPartner(t)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isSelected ? '#4F46E5' : 'transparent',
                      color: isSelected ? 'white' : (darkMode ? '#F8FAFC' : '#1E293B'),
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '3px'
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isSelected ? 'rgba(255,255,255,0.2)' : '#E0E7FF',
                        color: isSelected ? 'white' : '#4338CA',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        flexShrink: 0
                      }}
                    >
                      {t.full_name ? t.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {t.full_name || t.email}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: isSelected ? 'rgba(255,255,255,0.8)' : (darkMode ? '#94A3B8' : '#64748B') }}>
                        {t.role === 'admin' ? 'Administrator' : (t.role === 'kepsek' ? 'Kepala Sekolah' : 'Guru Pegawai')}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* KOLOM KANAN: FEED OBROLAN & INPUT PESAN */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '560px' }}>
            {/* Header Chat Room */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderBottom: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: darkMode ? '#1E293B' : '#FFFFFF'
              }}
            >
              <div>
                <strong style={{ fontSize: '0.95rem', color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                  {activeChannel === 'private'
                    ? `💬 Obrolan Pribadi: ${selectedPartner?.full_name || selectedPartner?.email}`
                    : CHAT_CHANNELS.find(c => c.id === activeChannel)?.label}
                </strong>
                <span style={{ display: 'block', fontSize: '0.72rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  {activeChannel === 'private'
                    ? `NIP: ${selectedPartner?.nip || '-'}`
                    : CHAT_CHANNELS.find(c => c.id === activeChannel)?.desc}
                </span>
              </div>

              {/* Tombol WhatsApp Rekan (Jika Obrolan Pribadi) */}
              {activeChannel === 'private' && (
                <button
                  type="button"
                  onClick={() => {
                    const text = `Halo Bapak/Ibu *${selectedPartner?.full_name}*, terkait koordinasi di aplikasi PanritaEdu...`
                    openWhatsAppDirect(selectedPartner?.phone, text)
                  }}
                  className="btn"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: '#25D366',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <span>📲 Chat via WhatsApp</span>
                </button>
              )}
            </div>

            {/* Pesan Feed */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                background: darkMode ? '#0F172A' : '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8', fontSize: '0.85rem' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  Memuat percakapan...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', margin: 'auto', padding: '2rem', color: '#94A3B8' }}>
                  <MessageSquare size={36} style={{ margin: '0 auto 10px auto', display: 'block', opacity: 0.5 }} />
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Belum ada pesan di ruang ini</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Mulai percakapan santun kedinasan dengan rekan kerja Anda.</div>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.sender_id === currentUserId
                  const senderObj = msg.sender || teachersList.find(t => t.id === msg.sender_id)
                  const senderName = isMe ? 'Saya' : (senderObj?.full_name || 'Rekan Kerja')
                  const senderRole = senderObj?.role === 'admin' ? 'Admin' : (senderObj?.role === 'kepsek' ? 'Kepsek' : 'Guru/Tendik')
                  const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''

                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start'
                      }}
                    >
                      {/* Nama Pengirim (Jika Pesan Orang Lain di Grup) */}
                      {!isMe && activeChannel !== 'private' && (
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginBottom: '2px', paddingLeft: '4px' }}>
                          <strong>{senderName}</strong> <span style={{ opacity: 0.7 }}>({senderRole})</span>
                        </div>
                      )}

                      {/* Bubble Pesan */}
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                          background: isMe ? '#4F46E5' : (darkMode ? '#1E293B' : '#FFFFFF'),
                          color: isMe ? '#FFFFFF' : (darkMode ? '#F8FAFC' : '#1E293B'),
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          border: isMe ? 'none' : (darkMode ? '1px solid #334155' : '1px solid #E2E8F0'),
                          fontSize: '0.85rem',
                          lineHeight: '1.45',
                          wordBreak: 'break-word'
                        }}
                      >
                        {msg.message}
                        <div
                          style={{
                            textAlign: 'right',
                            fontSize: '0.65rem',
                            marginTop: '4px',
                            color: isMe ? 'rgba(255,255,255,0.7)' : '#94A3B8'
                          }}
                        >
                          {timeStr}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Kotak Input Pengetikan Pesan */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '0.75rem 1rem',
                borderTop: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                background: darkMode ? '#1E293B' : '#FFFFFF',
                display: 'flex',
                gap: '8px'
              }}
            >
              <input
                type="text"
                placeholder={activeChannel === 'private' ? `Tulis pesan pribadi ke ${selectedPartner?.full_name || 'rekan'}...` : 'Tulis pesan koordinasi di ruang ini...'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '12px',
                  border: darkMode ? '1px solid #334155' : '1px solid #CBD5E1',
                  background: darkMode ? '#0F172A' : '#F8FAFC',
                  color: darkMode ? '#F8FAFC' : '#1E293B',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="btn btn-primary"
                style={{
                  padding: '0 1.25rem',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                  color: 'white',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  cursor: (sending || !inputText.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                <Send size={16} />
                <span>Kirim</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DISPOSISI & INSTRUKSI TUGAS KEDINASAN PIMPINAN */}
      {/* ========================================================================= */}
      {activeMainTab === 'disposisi' && (
        <div>
          {/* Header Bar Disposisi */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '1rem' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                Lembar Instruksi & Disposisi Tugas Kedinasan
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                {isLeader ? 'Kelola dan pantau tugas kedinasan yang diberikan ke dewan guru' : 'Daftar instruksi dan tugas kedinasan dari Kepala Sekolah yang ditujukan kepada Anda'}
              </p>
            </div>

            {/* Tombol Buat Tugas (Khusus Kepsek / Admin) */}
            {isLeader && (
              <button
                type="button"
                onClick={() => setShowAddDispModal(true)}
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: '#4F46E5',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                <span>+ Buat Instruksi Tugas Baru</span>
              </button>
            )}
          </div>

          {/* List Disposisi Cards */}
          {loadingDispositions ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
              Memuat data instruksi...
            </div>
          ) : dispositions.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '3rem',
                background: darkMode ? '#1E293B' : 'white',
                border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                borderRadius: '16px'
              }}
            >
              <CheckCircle2 size={40} color="#10B981" style={{ margin: '0 auto 10px auto', display: 'block' }} />
              <strong style={{ fontSize: '1rem', color: darkMode ? '#F8FAFC' : '#1E293B' }}>Tidak ada tugas yang tertunda</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                Seluruh instruksi kedinasan telah selesai atau belum ada tugas baru yang ditambahkan.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {dispositions.map(disp => {
                const isAssignedToMe = disp.to_user_id === currentUserId
                return (
                  <div
                    key={disp.id}
                    className="card"
                    style={{
                      background: darkMode ? '#1E293B' : 'white',
                      border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: '20px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: disp.status === 'selesai' ? '#ECFDF5' : (disp.status === 'proses' ? '#EFF6FF' : '#FFFBEB'),
                              color: disp.status === 'selesai' ? '#065F46' : (disp.status === 'proses' ? '#1E40AF' : '#92400E'),
                              border: `1px solid ${disp.status === 'selesai' ? '#A7F3D0' : (disp.status === 'proses' ? '#BFDBFE' : '#FDE68A')}`
                            }}
                          >
                            {disp.status === 'selesai' ? '✓ SELESAI' : (disp.status === 'proses' ? '⏳ SEDANG DIKERJAKAN' : '⚠️ MENUNGGU TINDAK LANJUT')}
                          </span>

                          {disp.deadline && (
                            <span style={{ fontSize: '0.74rem', color: '#EF4444', fontWeight: 600 }}>
                              Tenggat: {new Date(disp.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>

                        <h4 style={{ margin: '4px 0', fontSize: '1rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                          {disp.title}
                        </h4>
                        <p style={{ margin: '4px 0 8px 0', fontSize: '0.82rem', color: darkMode ? '#CBD5E1' : '#475569', lineHeight: '1.5' }}>
                          {disp.description || 'Tidak ada catatan tambahan.'}
                        </p>

                        <div style={{ fontSize: '0.74rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                          Pemberi Tugas: <strong>{disp.from_user?.full_name || teachersList.find(t => t.id === disp.from_user_id)?.full_name || 'Kepala Sekolah'}</strong> &nbsp;|&nbsp;
                          Penerima Tugas: <strong>{disp.to_user?.full_name || teachersList.find(t => t.id === disp.to_user_id)?.full_name || 'Guru'}</strong>
                        </div>
                      </div>

                      {/* Aksi Guru Penerima Tugas */}
                      {isAssignedToMe && disp.status !== 'selesai' && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {disp.status === 'menunggu' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateDispositionStatus({ supabase, dispositionId: disp.id, status: 'proses' })
                                loadDispositionsData()
                              }}
                              className="btn"
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                background: '#3B82F6',
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              Mulai Kerjakan
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={async () => {
                              const note = window.prompt('Tambahkan catatan laporan penyelesaian (opsional):')
                              await updateDispositionStatus({ supabase, dispositionId: disp.id, status: 'selesai', responseNote: note || '' })
                              loadDispositionsData()
                              alert('Status tugas berhasil diperbarui menjadi Selesai!')
                            }}
                            className="btn"
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              background: '#10B981',
                              color: 'white',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Tandai Selesai
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Modal Tambah Instruksi Baru */}
          {showAddDispModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '1rem'
              }}
            >
              <div
                className="card"
                style={{
                  maxWidth: '500px',
                  width: '100%',
                  background: darkMode ? '#1E293B' : 'white',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                  Buat Disposisi / Instruksi Kedinasan
                </h4>

                <form onSubmit={handleCreateDisposition}>
                  <div className="input-group" style={{ marginBottom: '1rem' }}>
                    <label className="input-label" style={{ fontSize: '0.82rem' }}>Pilih Guru Penerima Tugas</label>
                    <select
                      className="input"
                      value={dispTargetId}
                      onChange={(e) => setDispTargetId(e.target.value)}
                      required
                    >
                      <option value="">-- Pilih Guru / Tendik --</option>
                      {teachersList.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group" style={{ marginBottom: '1rem' }}>
                    <label className="input-label" style={{ fontSize: '0.82rem' }}>Judul Tugas / Instruksi</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Contoh: Pembuatan Kisi-Kisi Soal Asesmen Semester"
                      value={dispTitle}
                      onChange={(e) => setDispTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '1rem' }}>
                    <label className="input-label" style={{ fontSize: '0.82rem' }}>Rincian Arahan & Catatan</label>
                    <textarea
                      className="input"
                      rows="3"
                      placeholder="Tuliskan arahan detail mengenai tugas ini..."
                      value={dispDesc}
                      onChange={(e) => setDispDesc(e.target.value)}
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="input-label" style={{ fontSize: '0.82rem' }}>Tenggat Waktu (Deadline)</label>
                    <input
                      type="date"
                      className="input"
                      value={dispDeadline}
                      onChange={(e) => setDispDeadline(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddDispModal(false)}
                      className="btn"
                      style={{ padding: '8px 16px', borderRadius: '10px', background: '#F1F5F9', color: '#1E293B' }}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingDisp}
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', borderRadius: '10px', background: '#4F46E5', color: 'white' }}
                    >
                      {submittingDisp ? 'Menyimpan...' : 'Kirim Instruksi'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TOMBOL WHATSAPP CEPAT (TANPA API - 100% GRATIS) */}
      {/* ========================================================================= */}
      {activeMainTab === 'wa_tools' && (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {/* Section A: Pengingat Presensi ke Grup WA */}
          <div
            className="card"
            style={{
              background: darkMode ? '#1E293B' : 'white',
              border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📢</span> Pengingat Presensi Pagi ke Grup WhatsApp Dewan Guru
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  1-Klik menyusun teks resmi pengingat Clock In dan membuka WhatsApp ke Grup Guru Anda
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const text = createAttendanceReminderTemplate({ schoolName })
                  openWhatsAppDirect('', text)
                }}
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                }}
              >
                <Share2 size={15} />
                <span>Kirim Pengingat ke Grup WhatsApp</span>
              </button>
            </div>

            {/* Preview Teks Template */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '10px',
                background: darkMode ? '#0F172A' : '#F8FAFC',
                border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                fontSize: '0.78rem',
                color: darkMode ? '#CBD5E1' : '#334155',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5'
              }}
            >
              {createAttendanceReminderTemplate({ schoolName })}
            </div>
          </div>

          {/* Section B: Guru yang Belum Absen Hari Ini */}
          <div
            className="card"
            style={{
              background: darkMode ? '#1E293B' : 'white',
              border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.25rem'
            }}
          >
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏰</span> Guru & Pegawai Belum Presensi Hari Ini ({unclockedTeachers.length} Orang)
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                Kirim pesan WhatsApp santun secara personal ke masing-masing guru dengan 1-klik
              </p>
            </div>

            {unclockedTeachers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#10B981', fontSize: '0.85rem', fontWeight: 600 }}>
                ✓ Luar biasa! Seluruh guru dan pegawai telah melakukan presensi hari ini.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                {unclockedTeachers.map(t => (
                  <div
                    key={t.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: darkMode ? '#0F172A' : '#F8FAFC',
                      border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.82rem', display: 'block', color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                        {t.full_name}
                      </strong>
                      <span style={{ fontSize: '0.7rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                        NIP: {t.nip || '-'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const text = createPersonalReminderTemplate({ teacherName: t.full_name, schoolName })
                        openWhatsAppDirect(t.phone, text)
                      }}
                      className="btn"
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        background: '#25D366',
                        color: 'white',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>Ingatkan WA</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section C: Bagikan Pengumuman Sekolah ke WhatsApp */}
          <div
            className="card"
            style={{
              background: darkMode ? '#1E293B' : 'white',
              border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📜</span> Bagikan Pengumuman Resmi Sekolah ke WhatsApp
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  Pesan dapat diedit langsung sebelum dikirimkan ke WhatsApp grup guru atau paguyuban orang tua
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    const latest = pengumumanList[0]
                    const resetText = createAnnouncementWhatsAppTemplate({
                      schoolName,
                      title: latest?.judul || 'Pemberitahuan Sekolah',
                      content: latest?.pesan || latest?.isi || 'Dihimbau kepada seluruh Bapak/Ibu Guru dan Tenaga Kependidikan untuk senantiasa memperhatikan kedisiplinan dan koordinasi kegiatan sekolah.',
                      dateStr: latest?.created_at ? new Date(latest.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
                    })
                    setEditableAnnouncementText(resetText)
                  }}
                  title="Kembalikan teks ke template pengumuman awal"
                  style={{
                    background: 'transparent',
                    border: darkMode ? '1px solid #475569' : '1px solid #CBD5E1',
                    color: darkMode ? '#CBD5E1' : '#64748B',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={12} />
                  <span>Reset Template</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = (editableAnnouncementText && editableAnnouncementText.trim()) ? editableAnnouncementText.trim() : createAnnouncementWhatsAppTemplate({
                      schoolName,
                      title: pengumumanList[0]?.judul || 'Pemberitahuan Sekolah',
                      content: pengumumanList[0]?.pesan || pengumumanList[0]?.isi || 'Dihimbau kepada seluruh Bapak/Ibu Guru dan Tenaga Kependidikan untuk senantiasa memperhatikan kedisiplinan dan koordinasi kegiatan sekolah.'
                    })
                    openWhatsAppDirect('', text)
                  }}
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  <Share2 size={15} />
                  <span>Bagikan ke WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Info Sumber Pengumuman Aktif */}
            {pengumumanList.length > 0 && (pengumumanList[0].pesan || pengumumanList[0].judul) && (
              <div style={{ marginBottom: '0.6rem', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                <span style={{ fontWeight: 600, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                  Sumber Pengumuman Terkini ({new Date(pengumumanList[0].created_at || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}):
                </span>{' '}
                {pengumumanList[0].pesan || pengumumanList[0].isi || pengumumanList[0].judul}
              </div>
            )}

            {/* Kotak Input / Textarea Pengumuman yang Dapat Diedit Langsung */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: darkMode ? '#94A3B8' : '#64748B' }}>
                  ✏️ Edit Teks Pesan WhatsApp Sebelum Dikirim:
                </label>
                <span style={{ fontSize: '0.7rem', color: darkMode ? '#64748B' : '#94A3B8' }}>
                  Format tebal (*teks*), miring (_teks_), dll didukung di WhatsApp
                </span>
              </div>
              <textarea
                value={editableAnnouncementText}
                onChange={(e) => setEditableAnnouncementText(e.target.value)}
                placeholder="Tulis atau sesuaikan pesan pengumuman resmi sekolah di sini..."
                rows={9}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  background: darkMode ? '#0F172A' : '#F8FAFC',
                  border: darkMode ? '1px solid #334155' : '1px solid #CBD5E1',
                  fontSize: '0.82rem',
                  color: darkMode ? '#F8FAFC' : '#1E293B',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
