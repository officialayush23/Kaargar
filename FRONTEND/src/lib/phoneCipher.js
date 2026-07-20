/**
 * Decrypts the AES-256-GCM phone payload returned by GET /jobs/:id/contact.
 *
 * The backend never sends a plaintext phone number — only {iv, ciphertext}
 * (see BACKEND/services/crypto.py). This decrypts entirely in memory using
 * the Web Crypto API and VITE_PHONE_CALL_KEY (must match the backend's
 * PHONE_CALL_CIPHER_KEY). The caller must use the returned string only to
 * build a `tel:` link and must never render it, log it, or store it.
 */

function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

let cachedKeyPromise = null

function getKey() {
  if (!cachedKeyPromise) {
    const keyB64 = import.meta.env.VITE_PHONE_CALL_KEY
    if (!keyB64) throw new Error('VITE_PHONE_CALL_KEY is not configured')
    const keyBytes = base64ToBytes(keyB64)
    cachedKeyPromise = window.crypto.subtle.importKey(
      'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
    )
  }
  return cachedKeyPromise
}

/** Returns the decrypted phone number as a plain string. Never cache/store the result. */
export async function decryptPhone({ iv, ciphertext }) {
  const key = await getKey()
  const ivBytes = base64ToBytes(iv)
  const ctBytes = base64ToBytes(ciphertext)
  const plainBuf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ctBytes)
  return new TextDecoder('utf-8').decode(plainBuf)
}
