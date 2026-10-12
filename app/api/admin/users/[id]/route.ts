/* app/api/admin/users/[id]/route.ts: change role / set password, or delete a user (admins only). */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { getAdmin } from "@/lib/auth";
import { UserError, deleteUser, updateUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Only admins can manage users" }, { status: 403 });

/** Body: { role?: "admin" | "staff", password?: string } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdmin();
    if (!admin) return forbidden();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const user = updateUser(Number(id), admin.id, { role: body.role, password: body.password });
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    return apiError(err, "Updating the user");
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdmin();
    if (!admin) return forbidden();
    const { id } = await params;
    deleteUser(Number(id), admin.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    return apiError(err, "Deleting the user");
  }
}
