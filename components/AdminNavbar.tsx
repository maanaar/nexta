'use client';

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation';
import { Search, User, LogOut } from "lucide-react";
import Image from "next/image";
import nexta from '@/static/nexta.png'


export default function AdminNavbar2() {
  const [activeTab, setActiveTab] = useState("admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is logged in by checking for user_email cookie
    const checkAuth = () => {
      const cookies = document.cookie.split(';');
      const userEmailCookie = cookies.find(cookie => cookie.trim().startsWith('user_email='));
      
      if (userEmailCookie) {
        const email = userEmailCookie.split('=')[1];
        setIsLoggedIn(true);
        setUserEmail(decodeURIComponent(email));
      } else {
        setIsLoggedIn(false);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        // Clear local state
        setIsLoggedIn(false);
        setUserEmail('');
        // Redirect to login page
        router.push('/login');
        router.refresh();
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Still redirect even if API call fails
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-y-8 gap-x-4 bg-transparent">
      {/* Logo and User Section */}
      <div className="w-full sm:w-[85%] lg:w-[70%] flex justify-between items-center sm:px-6 pb-3">
        <Image src={nexta} alt="Nexta"  className="h-10 w-[20%] mx-auto sm:h-12 md:h-[60px]"/>

        {/* Username or Logout Button */}
        {!isLoading && (
          isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: '#0d9488' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0f766e'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#0d9488'}
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="font-semibold text-sm sm:text-base">Logout</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
              <span className="font-semibold text-sm sm:text-base">Username</span>
              <div className="p-2">
                <User className="w-32 h-32 sm:w-5 sm:h-5 rounded-full bg-amber-50" />
              </div>
            </div>
          )
        )}
      </div>

      {/* Navigation and Search Section */}
      <div className="w-full justify-evenly mx-auto sm:w-[85%]  lg:w-[70%] flex h-auto sm:h-12">
        <div className="flex flex-col sm:flex-row items-center justify-between w-full sm:h-12  rounded-l bg-white/95 sm:rounded-full sm:gap-4 lg:gap-20 lg:justify-evenly shadow-lg px-6 sm:px-8 lg:px-12 py-3 sm:py-0">
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
          <div className="relative flex items-center bg-gray-300 h-8 rounded-xl w-1/4 sm:min-w-[30%]">
            <input
              type="text"
              placeholder="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-full px-8 pr-10 rounded-full bg-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 text-gray-800 text-sm sm:text-base"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>
    </div>
  )
}