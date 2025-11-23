import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json(
    { success: true, message: 'Logged out successfully' },
    { status: 200 }
  );

  // Clear session cookies
  response.cookies.delete('session_token');
  response.cookies.delete('user_email');

  return response;
}

