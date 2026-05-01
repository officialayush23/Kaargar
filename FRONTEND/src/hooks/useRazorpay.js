/**
 * useRazorpay — UPI-first Razorpay checkout
 *
 * Usage:
 *   const { openCheckout, loading, error } = useRazorpay()
 *   openCheckout({ amount, orderId, prefillContact, onSuccess, onDismiss })
 */
import { useState, useCallback, useRef } from 'react'

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'
const KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || ''

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Failed to load payment gateway'))
    document.head.appendChild(script)
  })
}

export function useRazorpay() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const rzpRef = useRef(null)

  const openCheckout = useCallback(async ({
    amount,          // in paise (₹1 = 100 paise)
    currency = 'INR',
    orderId,         // Razorpay order ID from backend
    name = 'Kaargar',
    description = 'Service payment',
    prefillName = '',
    prefillEmail = '',
    prefillContact = '',  // phone number — pre-fills UPI field
    onSuccess,       // ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => void
    onDismiss,       // () => void
  }) => {
    setError(null)
    setLoading(true)

    try {
      await loadScript(RAZORPAY_SCRIPT)
    } catch {
      setError('Could not load payment gateway. Check your connection.')
      setLoading(false)
      return
    }

    if (!window.Razorpay) {
      setError('Razorpay not available.')
      setLoading(false)
      return
    }

    const options = {
      key: KEY_ID,
      amount,
      currency,
      name,
      description,
      order_id: orderId,

      // ── UPI-only checkout ────────────────────────────────────────────────
      // Show only UPI; hide cards, netbanking, wallets
      config: {
        display: {
          blocks: {
            upi_block: {
              name: 'Pay via UPI',
              instruments: [
                { method: 'upi', flows: ['collect', 'qr', 'intent'] },
              ],
            },
          },
          sequence: ['block.upi_block'],
          preferences: { show_default_blocks: false },
        },
      },

      prefill: {
        name: prefillName,
        email: prefillEmail,
        contact: prefillContact,
        method: 'upi',
      },

      theme: { color: '#22C55E' },

      modal: {
        backdropclose: false,
        escape: true,
        animation: true,
        ondismiss: () => {
          setLoading(false)
          onDismiss?.()
        },
      },

      handler: (response) => {
        setLoading(false)
        onSuccess?.(response)
      },
    }

    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', (response) => {
      setLoading(false)
      setError(response.error?.description || 'Payment failed. Please try again.')
      onDismiss?.()
    })

    rzpRef.current = rzp
    rzp.open()
  }, [])

  const closeCheckout = useCallback(() => {
    rzpRef.current?.close()
  }, [])

  return { openCheckout, closeCheckout, loading, error }
}
