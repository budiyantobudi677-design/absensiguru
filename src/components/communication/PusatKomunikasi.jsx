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
  CheckCheck,
  User,
  Search,
  RefreshCw,
  Bell,
  BookOpen,
  FileText,
  ArrowLeft,
  ChevronRight,
  Phone,
  Sparkles,
  Paperclip,
  Smile
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
import { fetchDeletedAccountsRegistry, isAccountDeleted } from '../../lib/deletedAccountsManager'
import { playNotificationSound } from '../../lib/soundNotification'

export default function PusatKomunikasi({ user, supabase, darkMode = false }) {
  const [activeMainTab, setActiveMainTab] = useState('chat') // 'chat' | 'disposisi' | 'wa_tools'
  const [activeChannel, setActiveChannel] = useState('umum') // 'umum' | 'kkg' | 'kedinasan' | 'private'
  const [selectedPartner, setSelectedPartner] = useState(null) // user object for private chat
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)

  // Mobile vs Desktop responsive navigation
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  const [mobileChatView, setMobileChatView] = useState('list') // 'list' (daftar obrolan) | 'room' (ruang percakapan)
  const [chatFilter, setChatFilter] = useState('all') // 'all' | 'groups' | 'direct'

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

  const messagesEndRef = useRef(null)
  const sendingRef = useRef(false)
  const currentUserId = user?.id

  // Responsive window resize listener
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setMobileChatView('room')
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  // Helper deduplikasi pesan: hindari ID duplikat atau pengiriman ganda dalam selisih waktu sangat cepat
  const deduplicateMessages = (msgList) => {
    if (!Array.isArray(msgList)) return []
    const result = []
    const seenIds = new Set()

    for (let i = 0; i < msgList.length; i++) {
      const m = msgList[i]
      if (!m || !m.id) continue
      if (seenIds.has(m.id)) continue

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
        const [{ data: profs }, { data: sSet }, { data: pList }, deletedReg] = await Promise.all([
          supabase.from('profiles').select('*').order('full_name'),
          supabase.from('school_settings').select('school_name').limit(1),
          supabase.from('pengumuman').select('*').order('created_at', { ascending: false }).limit(20),
          fetchDeletedAccountsRegistry(supabase)
        ])

        if (profs) {
          const activeProfs = profs.filter(p => !isAccountDeleted(p, deletedReg))
          setTeachersList(activeProfs)
        }
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

          // Bunyikan notifikasi suara jika pesan baru berasal dari pengguna lain
          if (newMsg.sender_id !== currentUserId) {
            playNotificationSound('message')
          }

          // Cek apakah pesan cocok dengan channel/partner yang sedang dibuka
          if (activeChannel === 'private') {
            if (
              (newMsg.sender_id === currentUserId && newMsg.receiver_id === selectedPartner?.id) ||
              (newMsg.sender_id === selectedPartner?.id && newMsg.receiver_id === currentUserId)
            ) {
              setMessages(prev => {
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

  // Realtime subscription untuk lembar instruksi/disposisi baru
  useEffect(() => {
    if (!supabase) return
    const dispChannel = supabase
      .channel(`realtime:disposisi_listener_${currentUserId || 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'disposisi_tugas' },
        (payload) => {
          const row = payload.new
          if (!row) return
          if (row.assigned_to === currentUserId || row.assigned_to === 'all' || !row.assigned_to) {
            playNotificationSound('disposition')
            loadDispositionsData()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(dispChannel)
    }
  }, [supabase, currentUserId])

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
    setInputText('')

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
          if (prev.some(m => m.id === sent.id)) return prev
          return [...prev, sent]
        })
        setTimeout(scrollToBottom, 50)
      }
    } catch (err) {
      setInputText(textToSend)
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

  // Filter teachers for direct message
  const filteredTeachers = teachersList.filter(t => {
    if (t.id === currentUserId) return false
    const q = teacherSearch.toLowerCase()
    return (
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q) ||
      (t.nip || '').includes(q) ||
      (t.jabatan || '').toLowerCase().includes(q)
    )
  })

  // Filtered channels
  const filteredChannels = CHAT_CHANNELS.filter(ch => {
    const q = teacherSearch.toLowerCase()
    return ch.label.toLowerCase().includes(q) || ch.desc.toLowerCase().includes(q)
  })

  const isLeader = user?.role === 'admin' || user?.role === 'kepsek'

  // Warna pengirim pesan bergaya Telegram/WhatsApp
  const getSenderColor = (senderId, role) => {
    if (role === 'kepsek') return '#D97706' // Amber
    if (role === 'admin') return '#4F46E5' // Indigo
    const colors = ['#059669', '#2563EB', '#7C3AED', '#DB2777', '#0891B2', '#EA580C']
    if (!senderId) return colors[0]
    let hash = 0
    for (let i = 0; i < senderId.length; i++) hash += senderId.charCodeAt(i)
    return colors[hash % colors.length]
  }

  // Buka room chat dari daftar
  const openChatRoom = (channelId, partner = null) => {
    setActiveChannel(channelId)
    setSelectedPartner(partner)
    if (isMobile) {
      setMobileChatView('room')
    }
  }

  return (
    <div className="wa-telegram-root fade-in" style={{ paddingBottom: '2.5rem' }}>
      {/* SCOPED CSS STYLES FOR WHATSAPP & TELEGRAM EXPERIENCE */}
      <style>{`
        .wa-telegram-root {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .wa-chat-wallpaper {
          background-color: ${darkMode ? '#0B141A' : '#EFEAE2'};
          background-image: ${darkMode 
            ? `radial-gradient(#1E293B 1px, transparent 1px), radial-gradient(#1E293B 1px, #0B141A 1px)` 
            : `radial-gradient(#CBD5E1 1px, transparent 1px), radial-gradient(#CBD5E1 1px, #EFEAE2 1px)`};
          background-size: 24px 24px;
          background-position: 0 0, 12px 12px;
        }
        .wa-chat-item:active, .wa-chat-item:hover {
          background-color: ${darkMode ? '#1E293B' : '#F1F5F9'} !important;
        }
        .wa-bubble-out {
          background: ${darkMode ? '#005C4B' : '#D9FDD3'} !important;
          color: ${darkMode ? '#E9EDEF' : '#111B21'} !important;
          border-radius: 14px 14px 2px 14px !important;
          box-shadow: 0 1px 1.5px rgba(11, 20, 26, 0.13) !important;
        }
        .wa-bubble-in {
          background: ${darkMode ? '#202C33' : '#FFFFFF'} !important;
          color: ${darkMode ? '#E9EDEF' : '#111B21'} !important;
          border-radius: 14px 14px 14px 2px !important;
          box-shadow: 0 1px 1.5px rgba(11, 20, 26, 0.13) !important;
        }
        .wa-tab-btn {
          position: relative;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .wa-tab-btn.active {
          color: #25D366 !important;
          font-weight: 700 !important;
        }
        .wa-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 12%;
          right: 12%;
          height: 3px;
          background: #25D366;
          border-radius: 3px 3px 0 0;
        }
        .wa-input-pill:focus-within {
          box-shadow: 0 0 0 2px rgba(37, 211, 102, 0.4) !important;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* HEADER SECTION APP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '0.85rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)', color: 'white' }}>
              <MessageSquare size={18} />
            </span>
            Pusat Komunikasi Staf
          </h3>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
            Obrolan kilat WA/Telegram antar pendidik, disposisi pimpinan, dan kontak instan
          </p>
        </div>

        {/* NOTIFIKASI RETENSI 14 HARI (CLEAN PILL) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '9999px',
            background: darkMode ? '#064E3B' : '#ECFDF5',
            border: darkMode ? '1px solid #059669' : '1px solid #A7F3D0',
            fontSize: '0.7rem',
            color: darkMode ? '#A7F3D0' : '#065F46',
            fontWeight: 700
          }}
        >
          <ShieldCheck size={13} color="#10B981" />
          <span>Privasi & Retensi 14 Hari</span>
        </div>
      </div>

      {/* TAB NAVIGASI UTAMA (MODERN SEGMENTED CONTROL: RAPI & TIDAK SALING MENEKAN) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          background: darkMode ? '#0F172A' : '#F1F5F9',
          borderRadius: '16px',
          padding: '6px',
          marginBottom: '1.25rem',
          border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}
      >
        {[
          { id: 'chat', label: 'Obrolan Staf', icon: '💬', badge: null },
          { id: 'disposisi', label: 'Disposisi Kedinasan', icon: '📌', badge: dispositions.filter(d => d.status === 'pending').length || null },
          { id: 'wa_tools', label: 'Tombol WhatsApp', icon: '📲', badge: null }
        ].map(tab => {
          const isActive = activeMainTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveMainTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '0.65rem 0.5rem',
                border: isActive
                  ? (darkMode ? '1px solid #10B981' : '1px solid #10B981')
                  : '1px solid transparent',
                background: isActive
                  ? (darkMode ? '#1E293B' : '#FFFFFF')
                  : 'transparent',
                color: isActive
                  ? (darkMode ? '#34D399' : '#059669')
                  : (darkMode ? '#94A3B8' : '#64748B'),
                borderRadius: '12px',
                fontWeight: isActive ? 800 : 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{tab.icon}</span>
              <span style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontSize: 'inherit'
              }}>
                {tab.label}
              </span>
              {tab.badge ? (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: '#EF4444',
                  color: 'white',
                  lineHeight: 1.2,
                  flexShrink: 0
                }}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OBROLAN INTERNAL SEKOLAH (WHATSAPP & TELEGRAM FULL REDESIGN) */}
      {/* ========================================================================= */}
      {activeMainTab === 'chat' && (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            display: 'flex',
            height: isMobile ? 'calc(100vh - 215px)' : '650px',
            minHeight: isMobile ? '500px' : '580px',
            maxHeight: '750px',
            background: darkMode ? '#1E293B' : '#FFFFFF',
            border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
            borderRadius: '18px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            position: 'relative'
          }}
        >
          {/* ------------------------------------------------------------- */}
          {/* PANE KIRI: DAFTAR CHAT / KONTAK (WHATSAPP CHAT LIST)           */}
          {/* ------------------------------------------------------------- */}
          <div
            style={{
              width: isMobile ? '100%' : '330px',
              minWidth: isMobile ? '100%' : '300px',
              maxWidth: isMobile ? '100%' : '350px',
              borderRight: isMobile ? 'none' : (darkMode ? '1px solid #334155' : '1px solid #E2E8F0'),
              background: darkMode ? '#111B21' : '#FFFFFF',
              display: (!isMobile || mobileChatView === 'list') ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              zIndex: 10
            }}
          >
            {/* Header Chat List */}
            <div style={{ padding: '0.85rem 1rem 0.6rem 1rem', background: darkMode ? '#202C33' : '#F0F2F5', borderBottom: darkMode ? '1px solid #2A3942' : '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: darkMode ? '#E9EDEF' : '#111B21' }}>
                  Obrolan GammaraApp
                </span>
                <span style={{ fontSize: '0.7rem', color: '#10B981', background: darkMode ? '#064E3B' : '#DCFCE7', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                  ● Aktif
                </span>
              </div>

              {/* Kotak Pencarian Chat / Guru */}
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '10px', color: '#8696A0' }} />
                <input
                  type="text"
                  placeholder="Cari ruang obrolan atau guru..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: '20px',
                    border: 'none',
                    background: darkMode ? '#111B21' : '#FFFFFF',
                    color: darkMode ? '#E9EDEF' : '#111B21',
                    fontSize: '0.8rem',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                  }}
                />
              </div>

              {/* WhatsApp Filter Chips */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '0.6rem' }}>
                {[
                  { id: 'all', label: 'Semua' },
                  { id: 'groups', label: 'Grup Sekolah' },
                  { id: 'direct', label: 'Pribadi' }
                ].map(chip => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setChatFilter(chip.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '16px',
                      border: 'none',
                      background: chatFilter === chip.id ? '#00A884' : (darkMode ? '#111B21' : '#E9EDEF'),
                      color: chatFilter === chip.id ? '#FFFFFF' : (darkMode ? '#8696A0' : '#54656F'),
                      fontSize: '0.72rem',
                      fontWeight: chatFilter === chip.id ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List Chat Channels & Guru */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {/* Section 1: Grup Sekolah */}
              {(chatFilter === 'all' || chatFilter === 'groups') && (
                <div>
                  <div style={{ padding: '8px 1rem 4px 1rem', fontSize: '0.7rem', fontWeight: 800, color: '#8696A0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Ruang Grup Kedinasan
                  </div>
                  {filteredChannels.map(ch => {
                    const isSelected = activeChannel === ch.id
                    return (
                      <div
                        key={ch.id}
                        onClick={() => openChatRoom(ch.id, null)}
                        className="wa-chat-item"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 1rem',
                          cursor: 'pointer',
                          background: isSelected ? (darkMode ? '#2A3942' : '#F0F2F5') : 'transparent',
                          borderLeft: isSelected ? '4px solid #25D366' : '4px solid transparent',
                          borderBottom: darkMode ? '1px solid #1F2C34' : '1px solid #F1F5F9'
                        }}
                      >
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: ch.id === 'umum' ? 'linear-gradient(135deg, #10B981, #059669)' : (ch.id === 'kkg' ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)' : 'linear-gradient(135deg, #F59E0B, #B45309)'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            color: 'white',
                            flexShrink: 0,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}
                        >
                          {ch.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: darkMode ? '#E9EDEF' : '#111B21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ch.label}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: '#8696A0' }}>Grup</span>
                          </div>
                          <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#8696A0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ch.desc}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Section 2: Obrolan Pribadi Staf */}
              {(chatFilter === 'all' || chatFilter === 'direct') && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ padding: '8px 1rem 4px 1rem', fontSize: '0.7rem', fontWeight: 800, color: '#8696A0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Obrolan Pribadi Staf ({filteredTeachers.length})
                  </div>
                  {filteredTeachers.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#8696A0', fontSize: '0.78rem' }}>
                      Tidak ada guru/pegawai yang cocok dengan kata kunci.
                    </div>
                  ) : (
                    filteredTeachers.map(t => {
                      const isSelected = activeChannel === 'private' && selectedPartner?.id === t.id
                      const initial = t.full_name ? t.full_name.charAt(0).toUpperCase() : 'U'
                      const roleLabel = t.role === 'admin' ? 'Administrator' : (t.role === 'kepsek' ? 'Kepala Sekolah' : (t.jabatan || 'Guru'))
                      return (
                        <div
                          key={t.id}
                          onClick={() => openChatRoom('private', t)}
                          className="wa-chat-item"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 1rem',
                            cursor: 'pointer',
                            background: isSelected ? (darkMode ? '#2A3942' : '#F0F2F5') : 'transparent',
                            borderLeft: isSelected ? '4px solid #25D366' : '4px solid transparent',
                            borderBottom: darkMode ? '1px solid #1F2C34' : '1px solid #F1F5F9'
                          }}
                        >
                          {/* Avatar WhatsApp Circle */}
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            {t.foto_profil ? (
                              <img src={t.foto_profil} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '50%',
                                  background: getSenderColor(t.id, t.role),
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: '1.05rem',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                              >
                                {initial}
                              </div>
                            )}
                            {/* Online green indicator dot */}
                            <span
                              style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#10B981',
                                border: `2px solid ${darkMode ? '#111B21' : '#FFFFFF'}`
                              }}
                            />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: darkMode ? '#E9EDEF' : '#111B21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.full_name || t.email}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: '#8696A0' }}>
                                {t.role === 'kepsek' ? 'Kepsek' : (t.role === 'admin' ? 'Admin' : 'Guru')}
                              </span>
                            </div>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#8696A0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {roleLabel} {t.nip ? `• NIP: ${t.nip}` : ''}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* PANE KANAN: RUANG CHAT AKTIF (WHATSAPP/TELEGRAM CANVAS)        */}
          {/* ------------------------------------------------------------- */}
          <div
            style={{
              flex: 1,
              display: (!isMobile || mobileChatView === 'room') ? 'flex' : 'none',
              flexDirection: 'column',
              height: '100%',
              background: darkMode ? '#0B141A' : '#EFEAE2',
              position: 'relative'
            }}
          >
            {/* Header Ruang Obrolan (WhatsApp Top Bar) */}
            <div
              style={{
                padding: '0.65rem 1rem',
                background: darkMode ? '#202C33' : '#F0F2F5',
                borderBottom: darkMode ? '1px solid #2A3942' : '1px solid #D1D7DB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 20
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {/* Tombol Back di Mobile (Kembali ke Daftar Chat) */}
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => setMobileChatView('list')}
                    title="Kembali ke Daftar Obrolan"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: darkMode ? '#E9EDEF' : '#111B21',
                      padding: '6px',
                      marginRight: '-4px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}

                {/* Avatar Room */}
                <div style={{ flexShrink: 0 }}>
                  {activeChannel === 'private' ? (
                    selectedPartner?.foto_profil ? (
                      <img src={selectedPartner.foto_profil} alt="" style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: getSenderColor(selectedPartner?.id, selectedPartner?.role),
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.95rem'
                        }}
                      >
                        {selectedPartner?.full_name ? selectedPartner.full_name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )
                  ) : (
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: activeChannel === 'umum' ? '#10B981' : (activeChannel === 'kkg' ? '#3B82F6' : '#F59E0B'),
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.15rem'
                      }}
                    >
                      {CHAT_CHANNELS.find(c => c.id === activeChannel)?.icon || '💬'}
                    </div>
                  )}
                </div>

                {/* Nama & Status */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: darkMode ? '#E9EDEF' : '#111B21', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {activeChannel === 'private'
                      ? (selectedPartner?.full_name || selectedPartner?.email)
                      : CHAT_CHANNELS.find(c => c.id === activeChannel)?.label}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>●</span>
                    <span style={{ color: darkMode ? '#8696A0' : '#54656F' }}>
                      {activeChannel === 'private'
                        ? (selectedPartner?.jabatan || selectedPartner?.role || 'Staf Sekolah')
                        : 'Semua Anggota Terhubung'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Aksi Kanan (Direct WA Shortcut) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {activeChannel === 'private' && (
                  <button
                    type="button"
                    onClick={() => {
                      const text = `Halo Bapak/Ibu *${selectedPartner?.full_name}*, terkait koordinasi tugas di GammaraApp...`
                      openWhatsAppDirect(selectedPartner?.phone, text)
                    }}
                    title="Buka Chat WhatsApp Resmi"
                    style={{
                      background: '#25D366',
                      color: 'white',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)'
                    }}
                  >
                    <Phone size={13} />
                    <span>WhatsApp</span>
                  </button>
                )}
              </div>
            </div>

            {/* Canvas Pesan WhatsApp (Wallpaper Pattern) */}
            <div
              className="wa-chat-wallpaper"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {/* Pill Tanggal Hari Ini (Tengah ala WhatsApp) */}
              <div style={{ textAlign: 'center', margin: '6px 0 10px 0' }}>
                <span
                  style={{
                    background: darkMode ? '#182229' : 'rgba(255, 255, 255, 0.9)',
                    color: darkMode ? '#8696A0' : '#54656F',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: '8px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px'
                  }}
                >
                  Pesan Terenkripsi • Retensi 14 Hari
                </span>
              </div>

              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#8696A0', fontSize: '0.82rem' }}>
                  <RefreshCw size={22} className="spin" style={{ margin: '0 auto 8px auto', display: 'block', color: '#00A884' }} />
                  Memuat obrolan...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', margin: 'auto', padding: '2rem', maxWidth: '320px' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      background: darkMode ? '#202C33' : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px auto',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                  >
                    <MessageSquare size={32} color="#00A884" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: darkMode ? '#E9EDEF' : '#111B21' }}>
                    Belum Ada Pesan
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: '#8696A0', lineHeight: 1.4 }}>
                    Mulai koordinasi kedinasan santun dengan rekan guru dan staf sekolah di ruang ini.
                  </p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.sender_id === currentUserId
                  const senderObj = msg.sender || teachersList.find(t => t.id === msg.sender_id)
                  const senderName = isMe ? 'Saya' : (senderObj?.full_name || 'Rekan Kerja')
                  const senderRole = senderObj?.role === 'admin' ? 'Admin' : (senderObj?.role === 'kepsek' ? 'Kepsek' : 'Guru')
                  const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''
                  const senderColor = getSenderColor(msg.sender_id, senderObj?.role)

                  return (
                    <div
                      key={msg.id}
                      style={{
                        alignSelf: isMe ? 'flex-end' : 'flex-start',
                        maxWidth: isMobile ? '86%' : '75%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isMe ? 'flex-end' : 'flex-start'
                      }}
                    >
                      {/* Bubble Chat WhatsApp/Telegram */}
                      <div
                        className={isMe ? 'wa-bubble-out' : 'wa-bubble-in'}
                        style={{
                          padding: '7px 11px',
                          fontSize: '0.86rem',
                          lineHeight: '1.42',
                          wordBreak: 'break-word',
                          position: 'relative',
                          minWidth: '90px'
                        }}
                      >
                        {/* Nama Pengirim pada Bubble Lawan Bicara (Grup) */}
                        {!isMe && activeChannel !== 'private' && (
                          <div style={{ fontSize: '0.74rem', fontWeight: 800, color: senderColor, marginBottom: '2px' }}>
                            {senderName}
                            <span style={{ fontSize: '0.66rem', fontWeight: 500, color: '#8696A0', marginLeft: '5px' }}>
                              ({senderRole})
                            </span>
                          </div>
                        )}

                        {/* Isi Teks Pesan */}
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {msg.message}
                        </div>

                        {/* Waktu & Tanda Centang Dua (✓✓) ala WhatsApp */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '3px',
                            marginTop: '2px',
                            fontSize: '0.65rem',
                            color: isMe ? (darkMode ? '#8696A0' : '#667781') : '#8696A0'
                          }}
                        >
                          <span>{timeStr}</span>
                          {isMe && (
                            <span style={{ color: '#53BDEB', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center' }}>
                              <CheckCheck size={13} strokeWidth={2.5} />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Kotak Input Pesan ala WhatsApp (Pill Input & Circular Send) */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '8px 10px',
                background: darkMode ? '#202C33' : '#F0F2F5',
                borderTop: darkMode ? '1px solid #2A3942' : '1px solid #D1D7DB',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 20
              }}
            >
              <div
                className="wa-input-pill"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  background: darkMode ? '#2A3942' : '#FFFFFF',
                  borderRadius: '24px',
                  padding: '2px 14px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
                }}
              >
                <input
                  type="text"
                  placeholder={activeChannel === 'private' ? `Pesan ke ${selectedPartner?.full_name?.split(' ')[0] || 'rekan'}...` : 'Ketik pesan koordinasi...'}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '9px 4px',
                    border: 'none',
                    background: 'transparent',
                    color: darkMode ? '#E9EDEF' : '#111B21',
                    fontSize: '0.86rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Tombol Kirim Bundar Hijau WhatsApp */}
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                title="Kirim Pesan"
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: (!inputText.trim() || sending) 
                    ? (darkMode ? '#2A3942' : '#CBD5E1') 
                    : 'linear-gradient(135deg, #00A884 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: (!inputText.trim() || sending) ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  boxShadow: inputText.trim() ? '0 2px 8px rgba(0, 168, 132, 0.4)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              >
                <Send size={18} style={{ marginLeft: '2px' }} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DISPOSISI & INSTRUKSI TUGAS KEDINASAN PIMPINAN                     */}
      {/* ========================================================================= */}
      {activeMainTab === 'disposisi' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Header Bar Disposisi */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                Lembar Instruksi & Disposisi Kedinasan
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                {isLeader ? 'Kelola dan pantau tugas kedinasan yang diberikan ke guru' : 'Daftar instruksi resmi dari Kepala Sekolah yang ditujukan kepada Anda'}
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
                  padding: '7px 14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
                }}
              >
                <Plus size={15} />
                <span>+ Buat Instruksi Tugas</span>
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
                padding: '2.5rem 1.5rem',
                background: darkMode ? '#1E293B' : 'white',
                border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                borderRadius: '16px'
              }}
            >
              <CheckCircle2 size={38} color="#10B981" style={{ margin: '0 auto 10px auto', display: 'block' }} />
              <strong style={{ fontSize: '0.95rem', color: darkMode ? '#F8FAFC' : '#1E293B' }}>Tidak Ada Tugas Tertunda</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                Seluruh instruksi kedinasan telah selesai atau belum ada tugas baru yang ditugaskan.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
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
                      padding: '1rem 1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              background: disp.status === 'selesai' ? '#ECFDF5' : (disp.status === 'proses' ? '#EFF6FF' : '#FFFBEB'),
                              color: disp.status === 'selesai' ? '#065F46' : (disp.status === 'proses' ? '#1E40AF' : '#92400E'),
                              border: `1px solid ${disp.status === 'selesai' ? '#A7F3D0' : (disp.status === 'proses' ? '#BFDBFE' : '#FDE68A')}`
                            }}
                          >
                            {disp.status === 'selesai' ? '✓ SELESAI' : (disp.status === 'proses' ? '⏳ SEDANG DIKERJAKAN' : '⚠️ MENUNGGU TINDAK LANJUT')}
                          </span>

                          {disp.deadline && (
                            <span style={{ fontSize: '0.72rem', color: '#EF4444', fontWeight: 600 }}>
                              Tenggat: {new Date(disp.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>

                        <h4 style={{ margin: '4px 0', fontSize: '0.95rem', fontWeight: 700, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                          {disp.title}
                        </h4>
                        <p style={{ margin: '4px 0 8px 0', fontSize: '0.8rem', color: darkMode ? '#CBD5E1' : '#475569', lineHeight: '1.45' }}>
                          {disp.description || 'Tidak ada catatan tambahan.'}
                        </p>

                        <div style={{ fontSize: '0.72rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                          Pemberi: <strong>{disp.from_user?.full_name || teachersList.find(t => t.id === disp.from_user_id)?.full_name || 'Kepala Sekolah'}</strong> &nbsp;|&nbsp;
                          Penerima: <strong>{disp.to_user?.full_name || teachersList.find(t => t.id === disp.to_user_id)?.full_name || 'Guru'}</strong>
                        </div>
                      </div>

                      {/* Aksi Guru Penerima Tugas */}
                      {isAssignedToMe && disp.status !== 'selesai' && (
                        <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-start' }}>
                          {disp.status === 'menunggu' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateDispositionStatus({ supabase, dispositionId: disp.id, status: 'proses' })
                                loadDispositionsData()
                              }}
                              className="btn"
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                background: '#3B82F6',
                                color: 'white',
                                fontSize: '0.74rem',
                                fontWeight: 700,
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
                              fontSize: '0.74rem',
                              fontWeight: 700,
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
                  maxWidth: '480px',
                  width: '100%',
                  background: darkMode ? '#1E293B' : 'white',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B' }}>
                  Buat Disposisi / Instruksi Kedinasan
                </h4>

                <form onSubmit={handleCreateDisposition}>
                  <div className="input-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="input-label" style={{ fontSize: '0.8rem' }}>Pilih Guru Penerima Tugas</label>
                    <select
                      className="input"
                      value={dispTargetId}
                      onChange={(e) => setDispTargetId(e.target.value)}
                      required
                      style={{ fontSize: '0.82rem' }}
                    >
                      <option value="">-- Pilih Guru / Tendik --</option>
                      {teachersList.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="input-label" style={{ fontSize: '0.8rem' }}>Judul Tugas / Instruksi</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Contoh: Pembuatan Kisi-Kisi Soal Asesmen"
                      value={dispTitle}
                      onChange={(e) => setDispTitle(e.target.value)}
                      required
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '0.85rem' }}>
                    <label className="input-label" style={{ fontSize: '0.8rem' }}>Rincian Arahan & Catatan</label>
                    <textarea
                      className="input"
                      rows="3"
                      placeholder="Tuliskan arahan detail mengenai tugas ini..."
                      value={dispDesc}
                      onChange={(e) => setDispDesc(e.target.value)}
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  <div className="input-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="input-label" style={{ fontSize: '0.8rem' }}>Tenggat Waktu (Deadline)</label>
                    <input
                      type="date"
                      className="input"
                      value={dispDeadline}
                      onChange={(e) => setDispDeadline(e.target.value)}
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddDispModal(false)}
                      className="btn"
                      style={{ padding: '7px 14px', borderRadius: '10px', background: '#F1F5F9', color: '#1E293B', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingDisp}
                      className="btn btn-primary"
                      style={{ padding: '7px 16px', borderRadius: '10px', background: '#4F46E5', color: 'white', fontSize: '0.8rem', fontWeight: 700 }}
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
      {/* TAB 3: TOMBOL WHATSAPP CEPAT (GRATIS - TANPA API)                         */}
      {/* ========================================================================= */}
      {activeMainTab === 'wa_tools' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {/* Section A: Pengingat Presensi ke Grup WA */}
          <div
            className="card"
            style={{
              background: darkMode ? '#1E293B' : 'white',
              border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '1.2rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '0.85rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📢</span> Pengingat Presensi ke Grup WhatsApp Guru
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  1-Klik menyusun pesan pengingat Clock In resmi dan membuka WhatsApp
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
                  fontSize: '0.78rem',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 3px 10px rgba(37, 211, 102, 0.3)'
                }}
              >
                <Share2 size={14} />
                <span>Kirim ke Grup WA</span>
              </button>
            </div>

            {/* Preview Teks Template */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                background: darkMode ? '#0F172A' : '#F8FAFC',
                border: darkMode ? '1px solid #334155' : '1px solid #E2E8F0',
                fontSize: '0.75rem',
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
              padding: '1.2rem'
            }}
          >
            <div style={{ marginBottom: '0.85rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏰</span> Guru & Pegawai Belum Presensi ({unclockedTeachers.length} Orang)
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                Kirim pesan WhatsApp santun secara personal ke masing-masing guru
              </p>
            </div>

            {unclockedTeachers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.25rem', color: '#10B981', fontSize: '0.82rem', fontWeight: 700 }}>
                ✓ Luar biasa! Seluruh guru dan pegawai telah melakukan presensi hari ini.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
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
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: '0.8rem', display: 'block', color: darkMode ? '#F8FAFC' : '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.full_name}
                      </strong>
                      <span style={{ fontSize: '0.68rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                        {t.jabatan || (t.role === 'admin' ? 'Admin' : 'Guru')}
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
                        padding: '5px 9px',
                        borderRadius: '8px',
                        background: '#25D366',
                        color: 'white',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0
                      }}
                    >
                      <Phone size={11} />
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
              padding: '1.2rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '0.85rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: darkMode ? '#F8FAFC' : '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📜</span> Bagikan Pengumuman Resmi Sekolah ke WhatsApp
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: darkMode ? '#94A3B8' : '#64748B' }}>
                  Edit pesan sebelum dikirim ke grup guru atau paguyuban orang tua
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={11} />
                  <span>Reset Teks</span>
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
                    fontSize: '0.78rem',
                    padding: '7px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  <Share2 size={14} />
                  <span>Bagikan ke WA</span>
                </button>
              </div>
            </div>

            {/* Kotak Input / Textarea Pengumuman */}
            <div>
              <textarea
                value={editableAnnouncementText}
                onChange={(e) => setEditableAnnouncementText(e.target.value)}
                placeholder="Tulis atau sesuaikan pesan pengumuman resmi sekolah di sini..."
                rows={7}
                style={{
                  width: '100%',
                  padding: '0.75rem 0.95rem',
                  borderRadius: '12px',
                  background: darkMode ? '#0F172A' : '#F8FAFC',
                  border: darkMode ? '1px solid #334155' : '1px solid #CBD5E1',
                  fontSize: '0.8rem',
                  color: darkMode ? '#F8FAFC' : '#1E293B',
                  lineHeight: '1.5',
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
