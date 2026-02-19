/**
 * WireGuard key generation using Web Crypto API (Curve25519 / X25519).
 * Falls back gracefully if the browser doesn't support X25519.
 */

function arrayBufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export interface WireGuardKeyPair {
  privateKey: string; // base64
  publicKey: string;  // base64
}

/**
 * Generate a real Curve25519 (X25519) keypair using the Web Crypto API.
 * Returns base64-encoded private and public keys compatible with WireGuard.
 */
export async function generateKeyPair(): Promise<WireGuardKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    true, // extractable
    ["deriveBits"]
  );

  const rawPrivate = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  // PKCS8 wraps the 32-byte key; the raw key is the last 32 bytes
  const privateBytes = new Uint8Array(rawPrivate).slice(-32);

  return {
    privateKey: arrayBufferToBase64(privateBytes.buffer),
    publicKey: arrayBufferToBase64(rawPublic),
  };
}

/**
 * Check if the browser supports X25519 key generation.
 */
export async function isX25519Supported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
    return true;
  } catch {
    return false;
  }
}
