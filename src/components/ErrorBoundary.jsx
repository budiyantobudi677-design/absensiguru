import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearCache = () => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B1120',
          color: '#F8FAFC',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            background: '#1E293B',
            borderRadius: '24px',
            padding: '2rem',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1.3rem'
              }}>
                !
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#F1F5F9' }}>Terjadi Kesalahan Aplikasi</h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94A3B8' }}>Sistem mendeteksi galat saat memuat halaman akun.</p>
              </div>
            </div>

            <div style={{
              background: '#020617',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.5rem',
              fontSize: '0.82rem',
              color: '#FCA5A5',
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: '220px',
              border: '1px solid #1E293B',
              lineHeight: 1.5
            }}>
              <strong>{this.state.error?.name || 'Error'}:</strong> {this.state.error?.message || 'Unknown error occurred'}
              {this.state.errorInfo?.componentStack && (
                <div style={{ marginTop: '0.5rem', color: '#64748B', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                  {this.state.errorInfo.componentStack}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: '#4F46E5',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '12px',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                onClick={this.handleClearCache}
                style={{
                  background: 'transparent',
                  color: '#CBD5E1',
                  border: '1px solid #475569',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '12px',
                  fontWeight: '500',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Bersihkan Cache & Masuk Ulang
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
