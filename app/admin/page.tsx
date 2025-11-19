"use client";

import { Search, ChevronDown, Eye } from "lucide-react";
import { useState } from "react";

export default function AdminPage() {
  const [modality, setModality] = useState("All");

  return (
    <div className="bg-white shadow-md rounded-xl p-5 border border-gray-200 space-y-4">
      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-800 mb-5">
        Administrator Panel
      </h2>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 my-8 mb-4">
        {/* Search Input */}
        {/* <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search patients, records..."
            className="pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50 w-80 focus:ring-2 focus:ring-purple-300 outline-none"
          />
        </div> */}

        {/* Modality Filter */}
        <div className="relative bg-amber-400">
          <select
            className="pl-3 pr-8 py-2.5 border border-gray-300 bg-gray-50 rounded-lg appearance-none cursor-pointer"
            value={modality}
            onChange={(e) => setModality(e.target.value)}
          >
            <option value="All">All Modalities</option>
            <option value="CR">CR</option>
            <option value="US">US</option>
          </select>

          <ChevronDown
            size={18}
            className="absolute right-3 top-3 text-gray-500 pointer-events-none"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="border bg-amber-600 border-gray-200 rounded-xl my-4 overflow-hidden">
        <table className="w-full bg-amber-600 text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="p-3 text-left">Patient Name</th>
              <th className="p-3 text-left">WhatsApp Number</th>
              <th className="p-3 text-left">Modality</th>
              <th className="p-3 text-left">Study Desc</th>
              <th className="p-3 text-left">Accession Number</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {/* === CR SECTION === */}
            <tr className="bg-gray-100 text-gray-700 font-semibold">
              <td colSpan={6} className="p-3">
                CR (3)
              </td>
            </tr>

            {["Walied Alsayed Ali", "Karim Mohamed", "Samer Mohamed"].map(
              (name, index) => (
                <tr
                  key={index}
                  className="border-b hover:bg-purple-50 transition"
                >
                  <td className="p-3">{name}</td>
                  <td className="p-3">0100000000</td>
                  <td className="p-3">CR</td>
                  <td className="p-3">X.Wrist Joint Uni…</td>
                  <td className="p-3">555432{index + 3}</td>
                  <td className="p-3 text-center">
                    <button className="text-purple-500 hover:text-purple-700 transition">
                      <Eye size={20} strokeWidth={1.3} />
                    </button>
                  </td>
                </tr>
              )
            )}

            {/* === US SECTION === */}
            <tr className="bg-gray-100 text-gray-700 font-semibold">
              <td colSpan={6} className="p-3">
                US (3)
              </td>
            </tr>

            {["AET-MRC49377", "Sooaad Mohamed", "NAJWA FOUAD"].map(
              (name, index) => (
                <tr
                  key={index}
                  className="border-b hover:bg-purple-50 transition"
                >
                  <td className="p-3">{name}</td>
                  <td className="p-3">0123456789</td>
                  <td className="p-3">US</td>
                  <td className="p-3">US abdomen and…</td>
                  <td className="p-3">55528{index + 30}</td>
                  <td className="p-3 text-center">
                    <button className="text-purple-500 hover:text-purple-700 transition">
                      <Eye size={20} strokeWidth={1.3} />
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
