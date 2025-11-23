import { cookies } from 'next/headers';

export interface User {
  email: string;
}

export async function getSession(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token');
    const userEmail = cookieStore.get('user_email');

    if (sessionToken && userEmail) {
      return {
        email: userEmail.value,
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

