/**
 * Next.js Auth Refresh Proxy
 *
 * POST /api/auth/refresh
 *
 * Reads the httpOnly refresh cookie, sends it to DRF refresh endpoint,
 * returns a new access token, and updates the refresh cookie.
 */
import { NextRequest, NextResponse } from 'next/server';

const DRF_URL = process.env.DRF_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { detail: 'No refresh token found' },
        { status: 401 }
      );
    }

    // Forward refresh request to DRF
    const drfResponse = await fetch(`${DRF_URL}/api/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    const data = await drfResponse.json();

    if (!drfResponse.ok) {
      // Clear invalid refresh cookie
      const errorResponse = NextResponse.json(data, { status: drfResponse.status });
      errorResponse.cookies.delete('refresh_token');
      return errorResponse;
    }

    // Return new access token along with the persisted username
    const username = request.cookies.get('tracedna_user')?.value || 'User';
    const response = NextResponse.json({
      access: data.access,
      username: username,
    });

    // If DRF rotated the refresh token, update the cookie
    if (data.refresh) {
      response.cookies.set('refresh_token', data.refresh, {
        httpOnly: true,
        secure: false, // process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (error) {
    console.error('Refresh proxy error:', error);
    return NextResponse.json(
      { detail: 'Token refresh service unavailable' },
      { status: 503 }
    );
  }
}
