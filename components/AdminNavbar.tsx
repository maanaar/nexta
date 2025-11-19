"use client";

import { Menu, Search, Bell, User } from "lucide-react";

export default function AdminNavbar({
  onMenuClick
}: {
  onMenuClick: () => void;
}) {
  return (
    <header className="h-20 bg-white ">
      <div className="h-full px-6 flex items-center rounded-3xl justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <Menu size={24} />
          </button>

          <div className="hidden md:flex items-center gap-2 bg-gray-300 px-4 py-2.5 rounded-3xl w-80">
            <Search className="text-gray-600 rounded-3xl" size={20}  />
            <input
              type="text"
              placeholder="Search patients"
              className="bg-transparent outline-none text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl">
            <Bell size={22} />
            {/* <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span> */}
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-gray-900">Admin User</p>
              <p className="text-xs text-gray-500">Administrator</p>
            </div>
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center cursor-pointer hover:scale-105 transition-transform">
              <User size={20} className="text-white" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
