import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Calendar, Clock, MapPin, Package,
  CreditCard, ChevronRight, Check, Loader2
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const TIME_SLOTS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
  '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM',
]

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// Booking is a 4-step flow:
// 1. Select date + time
// 2. Select service / package
// 3. Enter location
// 4. Confirm + Pay
const STEPS = ['datetime', 'service', 'location', 'confirm']
const STEP_LABELS = ['Date & Time', 'Service', 'Location', 'Confirm']

export default function BookDiscoveryPage() {
  const { workerId } = useParams()
  const navigate = useNavigate()

  const [stepIdx, setStepIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(0)

  const [selectedDate, setSelectedDate] = useState(getTodayStr())
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [address, setAddress] = useState('')
  const [addressNotes, setAddressNotes] = useState('')

  function nextStep() { setPrevIdx(stepIdx); setStepIdx(i => i + 1) }
  function prevStep() { setPrevIdx(stepIdx); setStepIdx(i => i - 1) }
  const direction = stepIdx >= prevIdx ? 1 : -1

  // Fetch worker's services
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['worker-services', workerId],
    queryFn: async () => {
      const { data } = await api.get(`/workers/${workerId}/services`)
      return Array.isArray(data) ? data : []
    },
    enabled: !!workerId,
  })

  // Calculate total
  const price = selectedPackage?.price ?? selectedService?.base_price ?? 0
  const commissionRate = 0.10
  const platformFee = Math.round(price * commissionRate)
  const total = price + platformFee

  // Create job + initiate Razorpay
  const bookMutation = useMutation({
    mutationFn: async () => {
      const scheduledFor = new Date(`${selectedDate}T${convertTo24h(selectedTime)}`).toISOString()
      const { data } = await api.post('/jobs', {
        job_type: 'discovery',
        worker_id: workerId,
        service_id: selectedService?.id,
        package_id: selectedPackage?.id,
        location_address: address,
        notes: addressNotes || undefined,
        scheduled_for: scheduledFor,
        quoted_price: price,
      })
      return data
    },
    onSuccess: (job) => {
      // Initiate payment
      initiateRazorpay(job.id, total)
    },
    onError: (e) => {
      toast.error(e.response?.data?.detail || 'Booking failed. Try again.')
    },
  })

  function initiateRazorpay(jobId, amount) {
    // Razorpay integration placeholder
    // In production: create Razorpay order via POST /payments/create-order
    // then open Razorpay checkout widget
    toast.success('Booking created! Payment integration coming soon.')
    navigate(`/bookings`)
  }

  function convertTo24h(slot) {
    if (!slot) return '09:00:00'
    const [time, period] = slot.split(' ')
    let [h, m] = time.split(':').map(Number)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
  }

  const slideVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
  }

  const step = STEPS[stepIdx]
  const canProceed =
    (step === 'datetime' && selectedDate && selectedTime) ||
    (step === 'service' && selectedService) ||
    (step === 'location' && address.trim().length >= 5) ||
    (step === 'confirm')

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-sm mx-auto px-4 py-6 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={stepIdx > 0 ? prevStep : () => navigate(-1)}
            style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
              Book Service
            </h1>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1 mb-6">
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  height: '3px',
                  borderRadius: '2px',
                  background: i <= stepIdx ? 'var(--amber)' : 'var(--card-border)',
                  width: '100%',
                  transition: 'background 0.3s ease',
                }}
              />
              <span
                style={{
                  fontSize: '10px',
                  color: i === stepIdx ? 'var(--amber)' : i < stepIdx ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: i === stepIdx ? 600 : 400,
                  transition: 'color 0.2s ease',
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          {/* ── STEP 1: Date + Time ── */}
          {step === 'datetime' && (
            <motion.div
              key="datetime"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={16} style={{ color: 'var(--amber)' }} />
                  <h3 className="font-semibold font-syne text-sm" style={{ color: 'var(--text-primary)' }}>
                    Select date
                  </h3>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  min={getTodayStr()}
                  onChange={e => setSelectedDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                {selectedDate && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(selectedDate)}
                  </p>
                )}
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} style={{ color: 'var(--amber)' }} />
                  <h3 className="font-semibold font-syne text-sm" style={{ color: 'var(--text-primary)' }}>
                    Select time slot
                  </h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {TIME_SLOTS.map(slot => (
                    <motion.button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        padding: '9px 6px',
                        borderRadius: '8px',
                        border: selectedTime === slot ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
                        background: selectedTime === slot ? 'rgba(245,158,11,0.12)' : 'var(--card-bg)',
                        color: selectedTime === slot ? 'var(--amber)' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: selectedTime === slot ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {slot}
                    </motion.button>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 2: Service ── */}
          {step === 'service' && (
            <motion.div
              key="service"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-3"
            >
              {servicesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : services.length === 0 ? (
                <GlassCard className="p-8 text-center">
                  <Package size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    No services listed yet
                  </p>
                </GlassCard>
              ) : (
                services.map(svc => (
                  <motion.div
                    key={svc.id}
                    onClick={() => { setSelectedService(svc); setSelectedPackage(null) }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '14px',
                      border: selectedService?.id === svc.id
                        ? '1.5px solid var(--amber)'
                        : '1px solid var(--card-border)',
                      background: selectedService?.id === svc.id
                        ? 'rgba(245,158,11,0.08)'
                        : 'var(--card-bg)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                          {svc.title}
                        </p>
                        {svc.description && (
                          <p
                            className="text-xs mt-1"
                            style={{
                              color: 'var(--text-muted)',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {svc.description}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        {svc.base_price && (
                          <p className="font-semibold text-sm" style={{ color: 'var(--amber)' }}>
                            ₹{svc.base_price}
                          </p>
                        )}
                        {selectedService?.id === svc.id && (
                          <div
                            style={{
                              width: '20px', height: '20px', borderRadius: '50%',
                              background: 'var(--amber)', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', marginTop: '4px', marginLeft: 'auto',
                            }}
                          >
                            <Check size={11} color="#000" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Packages */}
                    {selectedService?.id === svc.id && svc.packages?.length > 0 && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--card-border)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                          Choose a package:
                        </p>
                        <div className="space-y-2">
                          {svc.packages.map(pkg => (
                            <motion.button
                              key={pkg.id}
                              onClick={e => { e.stopPropagation(); setSelectedPackage(pkg) }}
                              whileTap={{ scale: 0.97 }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: selectedPackage?.id === pkg.id
                                  ? '1.5px solid var(--amber)'
                                  : '1px solid var(--card-border)',
                                background: selectedPackage?.id === pkg.id
                                  ? 'rgba(245,158,11,0.10)'
                                  : 'transparent',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{pkg.name}</span>
                              <span className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>₹{pkg.price}</span>
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </motion.div>
          )}

          {/* ── STEP 3: Location ── */}
          {step === 'location' && (
            <motion.div
              key="location"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={16} style={{ color: 'var(--amber)' }} />
                  <h3 className="font-semibold font-syne text-sm" style={{ color: 'var(--text-primary)' }}>
                    Service address
                  </h3>
                </div>
                <div className="space-y-3">
                  <GlassInput
                    label="Full address"
                    placeholder="Flat no., building name, street…"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    icon={MapPin}
                    autoFocus
                  />
                  <GlassInput
                    label="Landmark / notes (optional)"
                    placeholder="Near park, blue building…"
                    value={addressNotes}
                    onChange={e => setAddressNotes(e.target.value)}
                  />
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 4: Confirm ── */}
          {step === 'confirm' && (
            <motion.div
              key="confirm"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5 space-y-4">
                <h3 className="font-semibold font-syne text-sm" style={{ color: 'var(--text-primary)' }}>
                  Booking summary
                </h3>

                {[
                  {
                    icon: Calendar,
                    label: 'Date & Time',
                    value: `${formatDate(selectedDate)} at ${selectedTime}`,
                  },
                  {
                    icon: Package,
                    label: 'Service',
                    value: selectedPackage
                      ? `${selectedService?.title} — ${selectedPackage.name}`
                      : selectedService?.title,
                  },
                  {
                    icon: MapPin,
                    label: 'Location',
                    value: address + (addressNotes ? ` (${addressNotes})` : ''),
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                        background: 'rgba(245,158,11,0.10)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Icon size={15} style={{ color: 'var(--amber)' }} />
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                      <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {value || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </GlassCard>

              {/* Price breakdown */}
              <GlassCard className="p-5">
                <h3 className="font-semibold font-syne text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
                  Price breakdown
                </h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Service fee', value: `₹${price}` },
                    { label: 'Platform fee (10%)', value: `₹${platformFee}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{value}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      borderTop: '1px solid var(--card-border)',
                      paddingTop: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Total
                    </span>
                    <span className="font-bold text-base" style={{ color: 'var(--amber)' }}>
                      ₹{total}
                    </span>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        <div className="mt-6">
          {step !== 'confirm' ? (
            <GlassButton
              variant="discovery"
              size="lg"
              className="w-full"
              disabled={!canProceed}
              onClick={nextStep}
              icon={ChevronRight}
              iconPosition="right"
            >
              Continue
            </GlassButton>
          ) : (
            <GlassButton
              variant="instant"
              size="lg"
              className="w-full"
              loading={bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
              icon={CreditCard}
              iconPosition="left"
            >
              Pay ₹{total} &amp; Confirm
            </GlassButton>
          )}
        </div>
      </div>
    </div>
  )
}
