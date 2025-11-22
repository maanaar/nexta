import React, { useState } from 'react'
import { Search, User } from "lucide-react";
import Image from "next/image";
import nexta from '@/static/nexta.png'


export default function AdminNavbar2() {
  const [activeTab, setActiveTab] = useState("admin");
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <div className="w-full flex flex-col items-center justify-center my-4 sm:my-7 gap-y-8 gap-x-4 px-4">
      {/* Logo and User Section */}
      <div className="w-full sm:w-[85%] lg:w-[70%] flex justify-between items-center px-3 sm:px-6 py-3">
        <Image src={nexta} alt="Nexta" height={60} className="h-10 sm:h-12 md:h-[60px] w-auto"/>

        {/* Username */}
        <div className="flex items-center gap-2 sm:gap-3 bg-white rounded-full shadow-md px-3 sm:px-4 py-2">
          <span className="font-semibold text-gray-800 text-sm sm:text-base">Username</span>
          <div className="bg-gray-300 rounded-full p-2">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Navigation and Search Section */}
      <div className="w-full justify-evenly sm:w-[85%] lg:w-[70%] flex h-auto sm:h-12">
        <div className="flex flex-col sm:flex-row items-center  gap-8 w-full sm:h-12 bg-white/95 rounded-3xl sm:rounded-full sm:gap-4 lg:gap-28 shadow-lg px-4 py-3  sm:py-0">
          {/* Navigation Tabs */}
          <button
            onClick={() => setActiveTab("admin")}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
              activeTab === "admin"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Admin Panel
          </button>
          <button
            onClick={() => setActiveTab("organizer")}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
              activeTab === "organizer"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            organizer panel
          </button>
          <button
            onClick={() => setActiveTab("patients")}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2 rounded-full font-semibold transition-all text-sm sm:text-base ${
              activeTab === "patients"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            patients
          </button>

          {/* Search Bar */}
          <div className="relative flex items-center bg-gray-300 h-8 rounded-xl w-full sm:min-w-[30%]">
            <input
              type="text"
              placeholder="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-full px-4 pr-10 rounded-full bg-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-gray-800 text-sm sm:text-base"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>
    </div>
  )
}