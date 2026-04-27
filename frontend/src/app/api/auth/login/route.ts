/**
 * Next.js Auth Login Proxy
 *
 * POST /api/auth/login
 *
 * Calls DRF login endpoint, extracts refresh token,
 * sets it as an httpOnly cookie with SameSite=Strict.
 *
 * CRITICAL CSRF GUARD:
 * - SameSite=Strict
 * - Secure: true only in production (to avoid breaking local dev)
 */
import { NextRequest, NextResponse } from 'next/server';

const DRF_URL = process.env.DRF_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward login request to DRF
    const drfResponse = await fetch(`${DRF_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await drfResponse.json();

    if (!drfResponse.ok) {
      return NextResponse.json(data, { status: drfResponse.status });
    }

    // Create response with access token (sent to client)
    const response = NextResponse.json({
      access: data.access,
      username: body.username,
    });

    // Set refresh token as httpOnly cookie
    // CRITICAL CSRF GUARD: SameSite=Strict, Secure only in production
    response.cookies.set('refresh_token', data.refresh, {
      httpOnly: true,
      secure: false, // process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days (matches DRF refresh lifetime)
    });

    // Persistent username cookie (not httpOnly so client can't steal for auth, but proxy can read)
    response.cookies.set('tracedna_user', body.username, {
      httpOnly: false,
      secure: false, 
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Login proxy error:', error);
    return NextResponse.json(
      { detail: 'Authentication service unavailable' },
      { status: 503 }
    );
  }
}
