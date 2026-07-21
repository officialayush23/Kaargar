/**
 * JobCompletionFlow — worker-side steps for finishing a job that needs
 * customer bill approval: Before photos → Extra items → After photos →
 * Review & submit → Waiting → Enter completion code.
 *
 * Rendered by ActiveJobPage when the logged-in user is the assigned worker
 * and job.status is 'started' | 'awaiting_approval' | 'approved'.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Plus, Trash2, Loader2, CheckCircle2, Clock, ShieldCheck, ArrowRight, IndianRupee } from 'lucide-react'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { formatCurrency, getErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'

const STEPS = ['before', 'items', 'after', 'review']
const STEP_LABEL = { before: 'Before photos', items: 'Extra items', after: 'After photos', review: 'Review & submit' }

/* ── Photo capture grid (mobile camera-friendly) ─────────────────────────── */
function PhotoGrid({ photos, onAdd, uploading, minRequired = 1 }) {
  const inputRef = useRef()

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(photos || []).map((url, i) => (
          <div key={i} className="aspect-square rounded-xl overflow-hidden" style={{ background: 'var(--card-bg)' }}>
            <img src={url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-colors"
          style={{ background: 'var(--card-bg)', border: '1px dashed var(--card-border)' }}
        >
          {uploading
            ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent)' }} />
            : <Camera className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />}
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Add photo</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = '' }}
      />
      {(photos?.length || 0) < minRequired && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>At least {minRequired} photo required</p>
      )}
    </div>
  )
}

export function JobCompletionFlow({ jobId, job, onJobUpdate }) {
  const [step, setStep] = useState('before')
  const [uploadingPhase, setUploadingPhase] = useState(null)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.get(`/jobs/${jobId}/items`)
      setItems(data)
    } catch {
      // non-fatal
    } finally {
      setItemsLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadItems() }, [loadItems])

  async function uploadPhoto(file, kind) {
    setUploadingPhase(kind)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/jobs/${jobId}/media?kind=${kind}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.url
    } catch (err) {
      toast.error(getErrorMessage(err, 'Upload failed — check your connection and try again'))
      return null
    } finally {
      setUploadingPhase(null)
    }
  }

  async function handleBeforeAfterPhoto(file, phase) {
    const url = await uploadPhoto(file, phase)
    if (url) onJobUpdate({ [`${phase}_photos`]: [...(job[`${phase}_photos`] || []), url] })
  }

  const extraItemsTotal = items.reduce((sum, i) => sum + Number(i.amount || 0), 0)
  const baseAmount = Number(job.final_price ?? job.quoted_price ?? 0)

  async function submitForApproval() {
    setSubmitting(true)
    try {
      await api.post(`/jobs/${jobId}/submit-for-approval`)
      toast.success('Sent to customer for approval')
      onJobUpdate({ status: 'awaiting_approval' })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit — check photos above'))
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyOtp() {
    if (otp.length < 4) return
    setVerifying(true)
    setOtpError('')
    try {
      await api.post(`/jobs/${jobId}/verify-otp`, { code: otp })
      toast.success('Job completed — payment requested from customer')
      onJobUpdate({ status: 'completed' })
    } catch (err) {
      setOtpError(getErrorMessage(err, 'Incorrect code'))
    } finally {
      setVerifying(false)
    }
  }

  /* ── Waiting for customer ─────────────────────────────────────────────── */
  if (job.status === 'awaiting_approval') {
    return (
      <GlassCard className="p-6 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent-bg)' }}>
          <Clock className="h-6 w-6" style={{ color: 'var(--accent)' }} />
        </div>
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Waiting for customer approval</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          You'll be notified the moment they review the bill. This updates automatically.
        </p>
      </GlassCard>
    )
  }

  /* ── OTP entry ─────────────────────────────────────────────────────────── */
  if (job.status === 'approved') {
    return (
      <GlassCard className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          </div>
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Customer approved the bill</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ask them for the completion code and enter it below</p>
        </div>
        <input
          value={otp}
          onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError('') }}
          inputMode="numeric"
          placeholder="• • • • • •"
          className="w-full text-center text-2xl font-mono tracking-[0.5em] py-3 rounded-xl outline-none"
          style={{ background: 'var(--card-bg)', border: `1px solid ${otpError ? '#f87171' : 'var(--card-border)'}`, color: 'var(--text-primary)' }}
        />
        {otpError && <p className="text-xs text-center text-red-400">{otpError}</p>}
        <GlassButton variant="brand" size="lg" className="w-full" loading={verifying} disabled={otp.length < 4} onClick={verifyOtp}>
          Confirm & complete job
        </GlassButton>
      </GlassCard>
    )
  }

  /* ── Multi-step: before / items / after / review ──────────────────────── */
  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 h-1 rounded-full" style={{ background: STEPS.indexOf(step) >= i ? 'var(--accent)' : 'var(--card-border)' }} />
        ))}
      </div>
      <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
        {STEP_LABEL[step]}
      </p>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}>
          {step === 'before' && (
            <PhotoGrid
              photos={job.before_photos}
              uploading={uploadingPhase === 'before'}
              onAdd={(f) => handleBeforeAfterPhoto(f, 'before')}
            />
          )}

          {step === 'items' && (
            <div className="space-y-3">
              {itemsLoading ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <>
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                      <img src={item.item_photo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatCurrency(item.amount)}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await api.delete(`/jobs/${jobId}/items/${item.id}`)
                            loadItems()
                          } catch { toast.error('Could not remove item') }
                        }}
                        className="p-1.5 rounded-lg"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>No extra items — tap below if the job needed additional parts.</p>
                  )}
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'var(--card-bg)', border: '1px dashed var(--card-border)', color: 'var(--text-secondary)' }}
                  >
                    <Plus className="h-4 w-4" /> Add item ({items.length}/20)
                  </button>
                  {items.length > 0 && (
                    <div className="flex justify-between text-sm font-semibold pt-2" style={{ borderTop: '1px solid var(--card-border)', color: 'var(--text-primary)' }}>
                      <span>Items total</span>
                      <span>{formatCurrency(extraItemsTotal)}</span>
                    </div>
                  )}
                </>
              )}
              {showAddItem && (
                <AddItemForm
                  jobId={jobId}
                  onDone={() => { setShowAddItem(false); loadItems() }}
                  onCancel={() => setShowAddItem(false)}
                />
              )}
            </div>
          )}

          {step === 'after' && (
            <PhotoGrid
              photos={job.after_photos}
              uploading={uploadingPhase === 'after'}
              onAdd={(f) => handleBeforeAfterPhoto(f, 'after')}
            />
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Before ({job.before_photos?.length || 0})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(job.before_photos || []).slice(0, 3).map((u, i) => <img key={i} src={u} className="aspect-square rounded-lg object-cover" />)}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>After ({job.after_photos?.length || 0})</p>
                  <div className="grid grid-cols-3 gap-1">
                    {(job.after_photos || []).slice(0, 3).map((u, i) => <img key={i} src={u} className="aspect-square rounded-lg object-cover" />)}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex justify-between"><span>Base amount</span><span>{formatCurrency(baseAmount)}</span></div>
                <div className="flex justify-between"><span>Extra items ({items.length})</span><span>{formatCurrency(extraItemsTotal)}</span></div>
                <div className="flex justify-between font-bold pt-1.5" style={{ borderTop: '1px solid var(--card-border)', color: 'var(--text-primary)' }}>
                  <span>Total (what customer sees)</span><span>{formatCurrency(baseAmount + extraItemsTotal)}</span>
                </div>
              </div>
              <GlassButton variant="brand" size="lg" className="w-full" loading={submitting}
                disabled={!job.before_photos?.length || !job.after_photos?.length}
                onClick={submitForApproval}>
                Submit for customer approval
              </GlassButton>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {step !== 'review' && (
        <div className="flex gap-2 pt-1">
          {STEPS.indexOf(step) > 0 && (
            <GlassButton variant="ghost" className="flex-1" onClick={() => setStep(STEPS[STEPS.indexOf(step) - 1])}>
              Back
            </GlassButton>
          )}
          <GlassButton variant="brand" className="flex-1" icon={ArrowRight} iconPosition="right"
            onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}>
            Next
          </GlassButton>
        </div>
      )}
      {step === 'review' && (
        <button onClick={() => setStep('after')} className="text-xs" style={{ color: 'var(--text-muted)' }}>← Back to after photos</button>
      )}
    </GlassCard>
  )
}

/* ── Add extra item form ──────────────────────────────────────────────────── */
function AddItemForm({ jobId, onDone, onCancel }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [itemPhotoUrl, setItemPhotoUrl] = useState(null)
  const [receiptUrl, setReceiptUrl] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [saving, setSaving] = useState(false)

  async function upload(file, kind, setter) {
    setUploading(kind)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(`/jobs/${jobId}/media?kind=${kind}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setter(data.url)
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(null)
    }
  }

  async function save() {
    const amt = Number(amount)
    if (!name.trim() || !amt || amt <= 0 || amt > 50000 || !itemPhotoUrl || !receiptUrl) {
      toast.error('Fill in name, a valid amount (₹1–50,000), item photo and receipt photo')
      return
    }
    setSaving(true)
    try {
      await api.post(`/jobs/${jobId}/items`, {
        name: name.trim(), amount: amt, item_photo_url: itemPhotoUrl, receipt_photo_url: receiptUrl,
      })
      onDone()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not add item'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 rounded-xl space-y-2.5" style={{ background: 'var(--card-bg)', border: '1px solid var(--accent-border)' }}>
      <input
        value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name (e.g. PVC pipe)"
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
      />
      <div className="relative">
        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
        <input
          value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Cost"
          inputMode="decimal"
          className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniUpload label="Item photo" url={itemPhotoUrl} uploading={uploading === 'item_photo'} onPick={(f) => upload(f, 'item_photo', setItemPhotoUrl)} />
        <MiniUpload label="Receipt / bill" url={receiptUrl} uploading={uploading === 'receipt_photo'} onPick={(f) => upload(f, 'receipt_photo', setReceiptUrl)} />
      </div>
      <div className="flex gap-2 pt-1">
        <GlassButton variant="ghost" size="sm" className="flex-1" onClick={onCancel}>Cancel</GlassButton>
        <GlassButton variant="brand" size="sm" className="flex-1" loading={saving} onClick={save}>Add item</GlassButton>
      </div>
    </div>
  )
}

function MiniUpload({ label, url, uploading, onPick }) {
  const ref = useRef()
  return (
    <div>
      <button
        onClick={() => ref.current?.click()}
        className="w-full aspect-square rounded-lg flex flex-col items-center justify-center gap-1 overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px dashed var(--card-border)' }}
      >
        {url ? <img src={url} className="w-full h-full object-cover" /> : uploading
          ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--accent)' }} />
          : <><Camera className="h-4 w-4" style={{ color: 'var(--text-muted)' }} /><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</span></>}
      </button>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
    </div>
  )
}
