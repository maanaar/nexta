"use client";

import AdminTable from "@/components/AdminTable";
import PatientStateBar from "@/components/PatientStateBar";

export default function AdminPage() {
  return (
    <div className="w-full flex flex-col gap-6">
      <h2 className="text-5xl w-[25%] text-center font-bold text-white px-6">
        Admin Panel
      </h2>

      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen pt-10 flex justify-center">
        <div className="w-[90%] sm:w-[85%] lg:w-[90%] flex flex-col gap-8">
          <PatientStateBar />
          <AdminTable />
        </div>
      </div>
    </div>
  );
}