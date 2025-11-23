import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail, verifyPassword } from '@/lib/db';

// Fallback hardcoded credentials (used when database is not configured)
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

    let user = null;
    let userEmail = email;

    // First, try to authenticate from database
    const dbUser = await findUserByEmail(email);
    
    if (dbUser) {
      // User found in database - verify password
      if (verifyPassword(password, dbUser.password)) {
        user = {
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
        };
        userEmail = dbUser.email;
      }
    }

    // If not found in database, check hardcoded credentials (fallback)
    if (!user) {
      const hardcodedUser = VALID_CREDENTIALS.find(
        (cred) => cred.email === email && cred.password === password
      );

      if (hardcodedUser) {
        user = {
          email: hardcodedUser.email,
        };
        userEmail = hardcodedUser.email;
      }
    }

    // If still no user found, authentication failed
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session token (in production, use JWT or secure session management)
    const sessionToken = Buffer.from(`${userEmail}:${Date.now()}`).toString('base64');
    
    // Set cookie with session token
    const response = NextResponse.json(
      { 
        success: true, 
        message: 'Login successful',
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
        }
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
    response.cookies.set('user_email', userEmail, {
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

