export const SESSION_COOKIE = 'ai_payment_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? 'ai-payment-dev-secret'
}

async function hmacSign(message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(getAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSessionValue(username: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${username}:${exp}`
  const sig = await hmacSign(payload)
  return `${payload}:${sig}`
}

export async function verifySessionValue(
  value: string | undefined,
): Promise<{ username: string } | null> {
  if (!value) return null

  const parts = value.split(':')
  if (parts.length !== 3) return null

  const [username, expStr, sig] = parts
  const exp = Number(expStr)
  if (!username || !Number.isFinite(exp) || Date.now() > exp) return null

  const payload = `${username}:${expStr}`
  const expected = await hmacSign(payload)
  if (sig !== expected) return null

  return { username }
}
