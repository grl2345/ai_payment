import { NextResponse } from 'next/server'
import { validateCredentials } from '@/lib/auth/credentials'
import { SESSION_COOKIE, createSessionValue } from '@/lib/auth/session'

export async function POST(request: Request) {
  let body: { username?: string; password?: string }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const username = body.username?.trim() ?? ''
  const password = body.password ?? ''

  if (!username || !password) {
    return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
  }

  if (!validateCredentials(username, password)) {
    return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
  }

  const session = await createSessionValue(username)
  const response = NextResponse.json({ ok: true, username })

  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })

  return response
}
