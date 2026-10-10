import { useState, useEffect, useRef } from 'react'
import { RefreshCw, ArrowDown } from 'lucide-react'

export default function PullToRefresh({ children, onRefresh }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const isPulling = useRef(false)
  const maxPull = 90
  const threshold = 65

  useEffect(() => {
    const handleTouchStart = (e) => {
      // Only trigger if user is at the very top of the page
      if (window.scrollY <= 0 || document.documentElement.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY
        isPulling.current = true
      } else {
        isPulling.current = false
      }
    }

    const handleTouchMove = (e) => {
      if (!isPulling.current || isRefreshing) return
      
      const currentY = e.touches[0].clientY
      const diff = currentY - touchStartY.current

      // Only handle downward pull when at top of window
      if (diff > 0 && (window.scrollY <= 0 || document.documentElement.scrollTop <= 0)) {
        // Apply resistance curve
        const distance = Math.min(diff * 0.45, maxPull)
        setPullDistance(distance)
        if (distance > 10 && e.cancelable) {
          // Prevent default overscroll if pulling down
          // e.preventDefault()
        }
      } else {
        setPullDistance(0)
      }
    }

    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing) return
      isPulling.current = false

      if (pullDistance >= threshold) {
        setIsRefreshing(true)
        setPullDistance(threshold)
        try {
          if (onRefresh) {
            await onRefresh()
          } else {
            // Default: reload window
            window.location.reload()
            return
          }
        } catch {
          // ignore
        } finally {
          setTimeout(() => {
            setIsRefreshing(false)
            setPullDistance(0)
          }, 600)
        }
      } else {
        setPullDistance(0)
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pullDistance, isRefreshing, onRefresh])

  const progress = Math.min(pullDistance / threshold, 1)

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100%' }}>
      {/* Pull indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={{
            position: 'fixed',
            top: `${Math.min(pullDistance * 0.75, 45)}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'white',
            color: '#0B2545',
            padding: '8px 16px',
            borderRadius: '9999px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
            fontSize: '0.82rem',
            fontWeight: 600,
            transition: isPulling.current ? 'none' : 'all 0.3s ease',
            pointerEvents: 'none',
          }}
        >
          {isRefreshing ? (
            <>
              <RefreshCw size={16} className="animate-spin text-blue-600" />
              <span>Memuat ulang...</span>
            </>
          ) : pullDistance >= threshold ? (
            <>
              <RefreshCw size={16} className="text-emerald-600" />
              <span style={{ color: '#059669' }}>Lepas untuk memuat ulang</span>
            </>
          ) : (
            <>
              <div style={{ transform: `rotate(${progress * 180}deg)`, transition: 'transform 0.1s' }}>
                <ArrowDown size={16} className="text-blue-600" />
              </div>
              <span style={{ color: '#475569' }}>Tarik untuk memuat ulang</span>
            </>
          )}
        </div>
      )}

      {children}
    </div>
  )
}
