import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { SESSION_MAX_AGE, createSessionToken, verifyLogin } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = verifyLogin(email, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user: { email: user.email, name: user.name, role: user.role },
    });

    // Only mark the cookie "secure" on HTTPS: over plain HTTP on the hospital
    // network (e.g. http://192.168.x.x:3000) browsers would drop it
    const secure =
      request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

    // Signed, so it can't be forged (see lib/users.ts)
    response.cookies.set("session_token", createSessionToken(user), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    // Readable by the page, only for showing who's logged in
    response.cookies.set("user_email", user.email, {
      httpOnly: false,
      secure,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (err) {
    return apiError(err, "Logging in");
  }
}
