"use client";
import AdminTable from "@/components/AdminTable";
import SearchDebugComponent from "@/components/SearchDebugComponent";

export default function AdminPage() {
  return (
    <div className="w-full flex flex-col gap-6">
      <h2 className="text-5xl w-[25%] text-center font-bold text-white px-6">
        Admin Panel
      </h2>
      <div className="w-full rounded-t-xl bg-[#D9D9D9]/95 min-h-screen  flex justify-center">
        <div className="w-[90%] sm:w-[85%] lg:w-[90%] flex flex-col gap-8">
          <AdminTable />
          {/* <SearchDebugComponent/> */}
        </div>
      </div>
    </div>
  );
}