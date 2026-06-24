// lib/http.ts
// Tiny helpers for consistent JSON responses. Failures always return { error }.

import { NextResponse } from 'next/server'

export const ok = <T>(data: T, status = 200): NextResponse => NextResponse.json(data, { status })

export const err = (message: string, status = 400): NextResponse =>
  NextResponse.json({ error: message }, { status })
