/**
 * AddressBook — manage + pick saved user addresses.
 *
 * Two modes:
 *  • picker={false} (default) — full management UI: list, add, edit, delete, set default
 *  • picker={true}            — compact list for selecting an address in a booking flow,
 *                               calls onSelect(address) when user taps one
 *
 * Usage (management):
 *   <AddressBook />
 *
 * Usage (picker in booking flow):
 *   <AddressBook picker onSelect={(addr) => setLocation(addr)} selected={selectedAddr} />
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Plus, Star, Trash2, Pencil, Check, X, Home, Briefcase } from 'lucide-react'
import {
  useAddresses, useCreateAddress, useUpdateAddress,
  useDeleteAddress, useSetDefaultAddress,
} from '@/hooks/useAddresses'
import { useAddressAutocomplete } from '@/hooks/useGeocoding'

// ── Icon helper ──────────────────────────────────────────────
function LabelIcon({ label }) {
  const l = label?.toLowerCase()
  if (l === 'home') return <Home size={14} />
  if (l === 'work') return <Briefcase size={14} />
  return <MapPin size={14} />
}

// ── Address form ─────────────────────────────────────────────
function AddressForm({ initial, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '')
  const [addressLine, setAddressLine] = useState(initial?.address_line || '')
  const [isDefault, setIsDefault] = useState(initial?.is_default || false)
  const [query, setQuery] = useState(initial?.address_line || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { suggestions, search: fetchSuggestions, resolvePlace, loading: geoLoading } = useAddressAutocomplete()

  const [coords, setCoords] = useState(
    initial?.lat ? { lat: initial.lat, lon: initial.lon, place_id: initial.place_id } : null
  )

  const PRESET_LABELS = ['Home', 'Work', 'Other']

  async function handleSelectSuggestion(s) {
    setShowSuggestions(false)
    setQuery(s.description)
    setAddressLine(s.description)
    const place = await resolvePlace(s.place_id)
    if (place) setCoords({ lat: place.lat, lon: place.lon, place_id: s.place_id })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim() || !addressLine.trim()) return
    onSave({
      label: label.trim(),
      address_line: addressLine.trim(),
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      place_id: coords?.place_id ?? null,
      is_default: isDefault,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Label presets */}
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Label</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESET_LABELS.map(p => (
            <button key={p} type="button"
              onClick={() => setLabel(p)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                border: label === p ? '1.5px solid var(--brand)' : '1px solid var(--card-border)',
                background: label === p ? 'rgba(75,123,255,0.12)' : 'var(--card-bg)',
                color: label === p ? 'var(--brand)' : 'var(--text-secondary)',
                fontWeight: label === p ? 600 : 400,
              }}>
              {p}
            </button>
          ))}
          {/* Custom label input */}
          <input
            value={!PRESET_LABELS.includes(label) ? label : ''}
            onChange={e => setLabel(e.target.value)}
            placeholder="Custom…"
            style={{
              flex: 1, minWidth: 80, padding: '5px 10px', borderRadius: 20, fontSize: 13,
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Address autocomplete */}
      <div style={{ position: 'relative' }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Address</p>
        <input
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setAddressLine(e.target.value)
            fetchSuggestions(e.target.value)
            setShowSuggestions(true)
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
          placeholder="Search address…"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 14,
            border: '1px solid var(--card-border)', background: 'var(--card-bg)',
            color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--elevated, #1C1C1E)', border: '1px solid var(--card-border)',
                borderRadius: 12, marginTop: 4, overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
              {suggestions.map((s, i) => (
                <button key={i} type="button"
                  onMouseDown={() => handleSelectSuggestion(s)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', margin: 0 }}>{s.main_text}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{s.secondary_text}</p>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Set as default toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div
          onClick={() => setIsDefault(v => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10, position: 'relative',
            background: isDefault ? 'var(--brand)' : 'rgba(255,255,255,0.1)',
            transition: 'background 0.2s', cursor: 'pointer', flexShrink: 0,
          }}>
          <div style={{
            position: 'absolute', top: 2, left: isDefault ? 18 : 2,
            width: 16, height: 16, borderRadius: 8, background: '#fff',
            transition: 'left 0.2s',
          }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Set as default address</span>
      </label>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" onClick={onCancel}
          style={{
            padding: '8px 18px', borderRadius: 10, border: '1px solid var(--card-border)',
            background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          }}>
          Cancel
        </button>
        <button type="submit"
          style={{
            padding: '8px 20px', borderRadius: 10, border: 'none',
            background: 'var(--brand)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
          Save
        </button>
      </div>
    </form>
  )
}

// ── Main component ───────────────────────────────────────────
export function AddressBook({ picker = false, onSelect, selected }) {
  const { data: addresses = [], isLoading } = useAddresses()
  const createAddr = useCreateAddress()
  const updateAddr = useUpdateAddress()
  const deleteAddr = useDeleteAddress()
  const setDefault = useSetDefaultAddress()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // address object being edited

  async function handleCreate(body) {
    await createAddr.mutateAsync(body)
    setShowForm(false)
  }

  async function handleEdit(body) {
    await updateAddr.mutateAsync({ id: editing.id, ...body })
    setEditing(null)
  }

  if (isLoading) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--brand)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
    </div>
  )

  return (
    <div>
      {/* Address list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {addresses.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)' }}>
            <MapPin size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No saved addresses yet</p>
          </div>
        )}

        {addresses.map(addr => {
          const isSelected = selected?.id === addr.id
          return (
            <motion.div key={addr.id}
              layout
              whileTap={picker ? { scale: 0.98 } : undefined}
              onClick={picker ? () => onSelect?.(addr) : undefined}
              style={{
                padding: '12px 14px', borderRadius: 14,
                border: isSelected
                  ? '1.5px solid var(--brand)'
                  : '1px solid var(--card-border)',
                background: isSelected
                  ? 'rgba(75,123,255,0.08)'
                  : 'var(--card-bg)',
                cursor: picker ? 'pointer' : 'default',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                transition: 'all 0.15s',
              }}>
              {/* Icon */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: addr.is_default ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: addr.is_default ? 'var(--amber, #F59E0B)' : 'var(--text-muted)',
              }}>
                <LabelIcon label={addr.label} />
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{addr.label}</span>
                  {addr.is_default && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 6,
                      background: 'rgba(245,158,11,0.15)', color: 'var(--amber, #F59E0B)',
                      fontWeight: 600, letterSpacing: '0.04em',
                    }}>DEFAULT</span>
                  )}
                  {isSelected && <Check size={13} color="var(--brand)" />}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {addr.address_line}
                </p>
              </div>

              {/* Actions (management mode only) */}
              {!picker && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {!addr.is_default && (
                    <button
                      title="Set as default"
                      onClick={() => setDefault.mutate(addr.id)}
                      style={{
                        width: 28, height: 28, borderRadius: 8, border: '1px solid var(--card-border)',
                        background: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                      }}>
                      <Star size={13} />
                    </button>
                  )}
                  <button
                    title="Edit"
                    onClick={() => { setEditing(addr); setShowForm(false) }}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: '1px solid var(--card-border)',
                      background: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)',
                    }}>
                    <Pencil size={12} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => deleteAddr.mutate(addr.id)}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                      background: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(239,68,68,0.7)',
                    }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Edit form */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginTop: 12 }}>
            <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Edit address</p>
              <AddressForm initial={editing} onSave={handleEdit} onCancel={() => setEditing(null)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add button / form */}
      {!picker && (
        <div style={{ marginTop: 12 }}>
          <AnimatePresence>
            {showForm ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}>
                <div style={{ padding: 16, borderRadius: 14, border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>New address</p>
                  <AddressForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
                </div>
              </motion.div>
            ) : (
              <button
                onClick={() => { setShowForm(true); setEditing(null) }}
                style={{
                  width: '100%', padding: '11px', borderRadius: 14,
                  border: '1.5px dashed rgba(75,123,255,0.3)',
                  background: 'rgba(75,123,255,0.05)',
                  color: 'var(--brand)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <Plus size={15} /> Add address
              </button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Picker: add new inline */}
      {picker && (
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            width: '100%', marginTop: 8, padding: '10px',
            borderRadius: 12, border: '1px dashed rgba(75,123,255,0.3)',
            background: 'rgba(75,123,255,0.05)', color: 'var(--brand)',
            fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          <Plus size={14} /> Save a new address
        </button>
      )}
      {picker && showForm && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 14, border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
          <AddressForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}
    </div>
  )
}

export default AddressBook
