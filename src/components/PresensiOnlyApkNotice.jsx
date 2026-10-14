import React from 'react'
import { AlertTriangle } from 'lucide-react'

export default function PresensiOnlyApkNotice({ style = {} }) {
  return (
    <div
      style={{
        background: '#FFFBEB',
        border: '1.5px solid #F59E0B',
        borderRadius: '16px',
        padding: '1.75rem 1.25rem',
        margin: '1.25rem auto',
        maxWidth: '440px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)',
        ...style
      }}
    >
      <AlertTriangle size={38} color="#D97706" strokeWidth={2.2} />
      <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#B45309', lineHeight: 1.45 }}>
        🔒 Presensi Mandiri Hanya Tersedia di Aplikasi Resmi (APK)
      </span>
    </div>
  )
}
