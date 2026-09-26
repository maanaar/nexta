import { NextRequest, NextResponse } from 'next/server';

// Hardcoded users until a real user store is added
const VALID_CREDENTIALS = [
  { email: 'admin@nexta.com', password: 'admin123' },
  { email: 'user@nexta.com', password: 'user123' },
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const user = VALID_CREDENTIALS.find((cred) => cred.email === email && cred.password === password);

    // Unknown user or wrong password
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session token (in production, use JWT or secure session management)
    const sessionToken = Buffer.from(`${user.email}:${Date.now()}`).toString('base64');
    
    // Set cookie with session token
    const response = NextResponse.json(
      { 
        success: true, 
        message: 'Login successful',
        user: { email: user.email },
      },
      { status: 200 }
    );

    // Set HTTP-only cookie for security
    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Also store user email in a separate cookie for easy access
    response.cookies.set('user_email', user.email, {
      httpOnly: false, // Can be accessed by client
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

