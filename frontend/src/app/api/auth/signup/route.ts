import { NextRequest, NextResponse } from 'next/server';

const DRF_URL = process.env.DRF_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Forward signup request to DRF
    const signupResponse = await fetch(`${DRF_URL}/api/auth/signup/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const signupData = await signupResponse.json();

    if (!signupResponse.ok) {
      return NextResponse.json(signupData, { status: signupResponse.status });
    }

    // Now log the user in immediately after successful signup
    const loginResponse = await fetch(`${DRF_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: body.username,
        password: body.password,
      }),
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      return NextResponse.json(
        { detail: 'Signup successful, but auto-login failed. Please log in.' },
        { status: 201 }
      );
    }

    // Create response with access token (sent to client)
    const response = NextResponse.json({
      access: loginData.access,
      username: body.username,
    });

    // Set refresh token as httpOnly cookie
    response.cookies.set('refresh_token', loginData.refresh, {
      httpOnly: true,
      secure: false, // For HTTP support
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Persistent username cookie
    response.cookies.set('tracedna_user', body.username, {
      httpOnly: false,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Signup proxy error:', error);
    return NextResponse.json(
      { detail: 'Registration service unavailable' },
      { status: 503 }
    );
  }
}
