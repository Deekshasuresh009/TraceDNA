import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ detail: 'Logged out successfully' });
  
  // Clear all auth-related cookies
  response.cookies.delete('refresh_token');
  response.cookies.delete('tracedna_user');
  
  return response;
}
