"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import logo from "@/static/nextaLogo.png";

import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  X,
  User,
  LogOut,
  ChevronRight,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Patients", href: "/patients", icon: Users },
  { name: "Organizer", href: "/organizer", icon: Calendar },
  { name: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-72  
          bg-gradient-to-b from-[#1d1f33] via-[#15172b] to-[#0e101b]
          border-r border-white/10
          shadow-2xl shadow-black/40
          px-6 pt-8 pb-6 rounded-r-3xl
          transform transition-transform duration-300 ease-in-out
          flex flex-col
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* TOP LOGO + CLOSE BUTTON */}
        <div className="flex flex-col gap-y-4">
        <div className="flex flex-col items-center gap-3 mb-8">
          {/* X BUTTON */}
          <button
            onClick={onClose}
            className="self-end text-gray-400 hover:text-white transition-colors lg:hidden"
          >
            <X size={24} />
          </button>

          {/* LOGO */}
          <Image
            src={logo}
            alt="Nexta Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          
          <p className="text-gray-400 text-xs pb-4 font-medium">Admin Dashboard</p>
        </div>

        {/* NAVIGATION */}
        <nav className="flex flex-col gap-4 flex-1 mt-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => onClose()}
                className={`
                  flex items-center gap-4 px-4 py-3 rounded-xl 
                  transition-all duration-200
                  ${
                    isActive
                      ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-600/40"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }
                `}
              >
                <Icon size={22} />
                <span className="text-sm font-medium">{item.name}</span>
                {isActive && <ChevronRight size={18} className="ml-auto" />}
              </Link>
            );
          })}
        </nav>
        {/* USER AREA */}
        <div className="fixed w-max bottom-0  border-t border-white/10">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
              <User size={18} className="text-white" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">Admin User</p>
              <p className="text-gray-400 text-xs truncate">admin@nexta.com</p>
            </div>

            <button className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        </div>

        
      </aside>
    </>
  );
}