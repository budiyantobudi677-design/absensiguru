import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Fix default marker icon Leaflet di bundler Vite/Webpack
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

export default function GeofenceMapPicker({ lat, lng, radius, onLocationChange }) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    const initialLat = Number(lat) || -5.147665
    const initialLng = Number(lng) || 119.432732
    const initialRadius = Number(radius) || 100

    // Inisialisasi peta jika belum ada
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([initialLat, initialLng], 16)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map)

      // Marker yang bisa digeser (draggable)
      const marker = L.marker([initialLat, initialLng], {
        draggable: true,
        icon: defaultIcon
      }).addTo(map)

      marker.bindPopup('<b>Lokasi Pusat Sekolah</b><br>Geser pin ini untuk menentukan titik koordinat.').openPopup()

      marker.on('dragend', (e) => {
        const position = e.target.getLatLng()
        onLocationChange(position.lat, position.lng)
      })

      // Klik peta untuk memindahkan marker
      map.on('click', (e) => {
        const { lat: clickLat, lng: clickLng } = e.latlng
        marker.setLatLng([clickLat, clickLng])
        onLocationChange(clickLat, clickLng)
      })

      // Lingkaran radius sekolah
      const circle = L.circle([initialLat, initialLng], {
        color: '#10B981',
        fillColor: '#34D399',
        fillOpacity: 0.25,
        radius: initialRadius
      }).addTo(map)

      mapInstanceRef.current = map
      markerRef.current = marker
      circleRef.current = circle

      // Fix render size Leaflet di container modal / hidden div
      setTimeout(() => {
        map.invalidateSize()
      }, 250)
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Update marker & circle posisi jika lat/lng berubah dari luar (misal tombol GPS)
  useEffect(() => {
    const curLat = Number(lat) || -5.147665
    const curLng = Number(lng) || 119.432732
    const curRadius = Number(radius) || 100

    if (mapInstanceRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([curLat, curLng])
      circleRef.current.setLatLng([curLat, curLng])
      circleRef.current.setRadius(curRadius)
      mapInstanceRef.current.panTo([curLat, curLng])
    }
  }, [lat, lng, radius])

  return (
    <div style={{ width: '100%', marginBottom: '1rem' }}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '240px',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '2px solid #E2E8F0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
          zIndex: 1
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem', color: '#64748B' }}>
        <span>💡 Geser pin atau klik di peta untuk menentukan titik sekolah.</span>
        <span style={{ fontWeight: '600', color: '#10B981' }}>Radius: {radius}m</span>
      </div>
    </div>
  )
}
