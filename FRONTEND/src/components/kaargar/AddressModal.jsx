import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, Plus, Trash2, Home, Briefcase, Star, Check } from 'lucide-react'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { useAppStore } from '@/stores/app'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { cn } from '@/lib/utils'

const PUNE_AREAS = [
  'Hinjewadi', 'Kothrud', 'Aundh', 'Baner', 'Wakad',
  'Pimpri-Chinchwad', 'Hadapsar', 'Kharadi', 'Viman Nagar',
  'Kalyani Nagar', 'Koregaon Park', 'Camp', 'Shivajinagar',
  'Deccan', 'Katraj', 'Kondhwa', 'Magarpatta',
  'Sinhagad Road', 'Warje', 'Bavdhan',
]

const ADDR_TYPES = [
  { type: 'home',   icon: Home,      label: 'Home' },
  { type: 'work',   icon: Briefcase, label: 'Work' },
  { type: 'other',  icon: Star,      label: 'Other' },
]

export function AddressModal({ open, onClose }) {
  const { currentLocation, savedAddresses, activeAddressId, setCurrentLocation, saveAddress, removeAddress, setActiveAddress } = useAppStore()
  const { getLocation, loading: geoLoading } = useGeoLocation()
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const filteredAreas = PUNE_AREAS.filter(a =>
    a.toLowerCase().includes(search.toLowerCase())
  )

  async function handleGPS() {
    const loc = await getLocation()
    if (loc) {
      setCurrentLocation(loc)
      setActiveAddress(null)
      onClose()
    }
  }

  function selectArea(area) {
    setCurrentLocation({ label: area, address: `${area}, Pune`, lat: null, lon: null })
    setActiveAddress(null)
    onClose()
  }

  function selectSaved(addr) {
    setCurrentLocation({ label: addr.label, address: addr.address, lat: addr.lat, lon: addr.lon })
    setActiveAddress(addr.id)
    onClose()
  }

  const displayLocation = currentLocation?.label || 'Pune'

  return (
    <GlassModal open={open} onClose={onClose} title="Choose Location" size="md">
      <div className="space-y-5">

        {/* Current active */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <MapPin className="h-4 w-4 shrink-0" style={{ color: 'var(--brand)' }} />
          <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{displayLocation}</span>
        </div>

        {/* GPS button */}
        <GlassButton
          variant="ghost"
          className="w-full justify-start gap-3"
          icon={Navigation}
          loading={geoLoading}
          onClick={handleGPS}
        >
          Use my current location
        </GlassButton>

        {/* Saved addresses */}
        {savedAddresses.length > 0 && (
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Saved
            </p>
            <div className="space-y-2">
              {savedAddresses.map((addr) => {
                const TypeIcon = ADDR_TYPES.find(t => t.type === addr.type)?.icon || Star
                const active = activeAddressId === addr.id
                return (
                  <motion.div
                    key={addr.id}
                    whileHover={{ x: 2 }}
                    className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                    style={active
                      ? { background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.3)' }
                      : { background: 'var(--g-bg)', borderColor: 'var(--g-border)' }
                    }
                    onClick={() => selectSaved(addr)}
                  >
                    <TypeIcon className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{addr.label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{addr.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {active && <Check className="h-3.5 w-3.5" style={{ color: 'var(--brand)' }} />}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeAddress(addr.id) }}
                        className="p-1 hover:text-red-400 transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* Browse areas */}
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Browse areas
          </p>
          <GlassInput
            placeholder="Search Pune area…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={MapPin}
            className="mb-3"
          />
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {filteredAreas.map((area) => {
              const active = currentLocation?.label === area
              return (
                <motion.button
                  key={area}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => selectArea(area)}
                  className="text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all border"
                  style={active
                    ? { background: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.35)', color: 'var(--brand)' }
                    : { background: 'var(--g-bg)', borderColor: 'var(--g-border)', color: 'var(--text-secondary)' }
                  }
                >
                  {area}
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* Add new saved address */}
        <AnimatePresence>
          {adding ? (
            <AddAddressForm
              onSave={(addr) => { saveAddress(addr); setAdding(false) }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--brand)' }}
            >
              <Plus className="h-4 w-4" />
              Add a saved address
            </button>
          )}
        </AnimatePresence>

      </div>
    </GlassModal>
  )
}

function AddAddressForm({ onSave, onCancel }) {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState('home')

  function handleSave() {
    if (!label.trim() || !address.trim()) return
    onSave({
      id: `addr_${Date.now()}`,
      label: label.trim(),
      address: address.trim(),
      type,
      lat: null,
      lon: null,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3 pt-3"
      style={{ borderTop: '1px solid var(--g-border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        New saved address
      </p>

      <div className="flex gap-2">
        {ADDR_TYPES.map(({ type: t, icon: Icon, label: l }) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
            style={type === t
              ? { background: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.35)', color: 'var(--brand)' }
              : { background: 'var(--g-bg)', borderColor: 'var(--g-border)', color: 'var(--text-muted)' }
            }
          >
            <Icon className="h-3 w-3" />
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}
