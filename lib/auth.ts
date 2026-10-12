import { cookies } from "next/headers";
import { userFromSessionToken, type User } from "@/lib/users";

export type { User };

/** The logged-in user, verified from the signed session cookie (null if not logged in). */
export async function getSession(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    return userFromSessionToken(cookieStore.get("session_token")?.value);
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSession()) !== null;
}

/** The logged-in user if they're an admin, else null. */
export async function getAdmin(): Promise<User | null> {
  const user = await getSession();
  return user?.role === "admin" ? user : null;
}
