"use client";

import { useState } from "react";
import { Search, User } from "lucide-react";
import Image from "next/image";
import nexta from '@/static/nexta.png'

// AdminNavbar Component
export default function AdminNavbar2() {
  const [activeTab, setActiveTab] = useState("admin");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="w-full flex flex-col items-center justify-between bg-orange-500">
        {/* Top Row: Logo and Username */}
        <div className=" w-[70%] flex bg-amber-950 items-center h-12 justify-around">
          {/* Logo */}
          <Image src={nexta} alt="Nexta" height={60} className="mx-auto" />

          {/* Username */}
          <div className="flex items-center bg-white rounded-full shadow-md">
            <span className="font-semibold text-gray-800">Username</span>
            <div className="bg-gray-300 rounded-full">
              <User className="w-5 h-5 text-gray-600" />
            </div>
        </div>
      </div>

      {/* Bottom Row: Navigation and Search */}
      <div className="relative bg-black mt-4">
        <div className="flex items-center justify-center h-12  gap-6 bg-white/95 rounded-full mx-auto shadow-lg ">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("admin")}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                activeTab === "admin"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              Admin Panel
            </button>
            <button
              onClick={() => setActiveTab("organizer")}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                activeTab === "organizer"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              organizer panel
            </button>
            <button
              onClick={() => setActiveTab("patients")}
              className={`px-6 py-2 rounded-full font-semibold transition-all ${
                activeTab === "patients"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              patients
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative flex justify-items-center bg-gray-200 rounded-3xl min-w-[200px]">
            <input
              type="text"
              placeholder="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pr-10 rounded-full bg-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-gray-800"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}