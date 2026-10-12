/* app/api/admin/users/route.ts: list and create users (admins only). */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin } from "@/lib/auth";
import { UserError, createUser, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });

export async function GET() {
  try {
    if (!(await getAdmin())) return forbidden();
    return NextResponse.json({ users: listUsers() });
  } catch (err) {
    return apiError(err, "Loading users");
  }
}

/** Body: { name, email, password, role: "admin" | "staff" } */
export async function POST(req: Request) {
  try {
    if (!(await getAdmin())) return forbidden();
    const body = await req.json().catch(() => ({}));
    const user = createUser(body);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    return apiError(err, "Creating the user");
  }
}
