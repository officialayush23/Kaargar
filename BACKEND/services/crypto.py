"""
Phone-call masking.

Phone numbers must never be exposed as plaintext in an API response (network
tab, logs, etc). This module encrypts a phone number with AES-256-GCM using a
key shared with the frontend (PHONE_CALL_CIPHER_KEY == VITE_PHONE_CALL_KEY).

The frontend decrypts the ciphertext in memory, purely to build a `tel:`
link at the moment the user taps "Call" — it never renders or stores the
plaintext number. This does not hide the number from the phone's native
dialer/call log once the call is placed (that would require a true
call-masking telephony provider), but it keeps the number out of API
payloads, browser devtools network inspection, and server/application logs.
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import get_settings

_settings = get_settings()


def _get_key() -> bytes:
    key_b64 = _settings.phone_call_cipher_key
    if not key_b64:
        raise RuntimeError(
            "PHONE_CALL_CIPHER_KEY is not set — cannot encrypt phone numbers. "
            "Set it (base64, 32 bytes) in the backend .env, matching VITE_PHONE_CALL_KEY."
        )
    key = base64.b64decode(key_b64)
    if len(key) != 32:
        raise RuntimeError("PHONE_CALL_CIPHER_KEY must decode to exactly 32 bytes (AES-256).")
    return key


def encrypt_phone(phone: str) -> dict:
    """
    Encrypts `phone` with AES-256-GCM using a random 12-byte nonce.
    Returns {"iv": base64, "ciphertext": base64} — ciphertext includes the
    GCM auth tag appended (standard AESGCM.encrypt behaviour), which the
    frontend's SubtleCrypto AES-GCM decrypt expects in the same layout.
    """
    key = _get_key()
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, phone.encode("utf-8"), None)
    return {
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }
