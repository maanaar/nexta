/* app/api/admin/patients/route.ts */
import { NextResponse } from "next/server";
import { getAllPatients } from "@/lib/patient-data";


export async function GET() {
const data = await getAllPatients();
return NextResponse.json({ data });
}