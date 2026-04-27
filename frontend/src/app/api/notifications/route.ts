import { NextRequest, NextResponse } from 'next/server';

const DRF_URL = process.env.DRF_API_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  const url = request.nextUrl.searchParams.toString();

  const res = await fetch(`${DRF_URL}/api/notifications/${url ? `?${url}` : ''}`, {
    headers: {
      Authorization: auth || '',
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const auth = request.headers.get('Authorization');

  const res = await fetch(`${DRF_URL}/api/notifications/mark-read/`, {
    method: 'PATCH',
    headers: {
      Authorization: auth || '',
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
