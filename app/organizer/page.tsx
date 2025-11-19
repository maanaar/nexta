"use client";

import { useState, useEffect } from "react";
import { Activity, User, FileText, Stethoscope, Clock, CheckCircle2, XCircle, AlertCircle, PhoneOff, MessageSquareOff } from "lucide-react";

const STAGE_CONFIG = {
  InProgress: {
    label: "In Progress",
    icon: Clock,
    color: "blue",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-700",
    badgeColor: "bg-blue-100",
  },
  sent: {
    label: "Sent",
    icon: CheckCircle2,
    color: "green",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    textColor: "text-green-700",
    badgeColor: "bg-green-100",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "red",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-700",
    badgeColor: "bg-red-100",
  },
  Missing: {
    label: "Missing",
    icon: AlertCircle,
    color: "yellow",
    bgColor: "bg-yellow-50",
    borderColor: "border-yellow-200",
    textColor: "text-yellow-700",
    badgeColor: "bg-yellow-100",
  },
  no_number: {
    label: "No Number",
    icon: PhoneOff,
    color: "gray",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    textColor: "text-gray-700",
    badgeColor: "bg-gray-100",
  },
  no_whatsapp: {
    label: "No WhatsApp",
    icon: MessageSquareOff,
    color: "purple",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    textColor: "text-purple-700",
    badgeColor: "bg-purple-100",
  },
};

// Mock data - used as fallback
const mockOrganizerData = {
  InProgress: [
    {
      id: "1",
      name: "John Doe",
      nid: "0100000001",
      accession: "5554321",
      study: "CR",
    },
    {
      id: "2",
      name: "Jane Smith",
      nid: "0100000002",
      accession: "5554322",
      study: "MRI",
    },
  ],
  sent: [
    {
      id: "3",
      name: "Bob Johnson",
      nid: "0100000003",
      accession: "5554323",
      study: "CT",
    },
  ],
  failed: [
    {
      id: "5",
      name: "Michael Brown",
      nid: "0100000005",
      accession: "5554325",
      study: "Ultrasound",
    },
  ],
  Missing: [
    {
      id: "4",
      name: "Alice Williams",
      nid: "0100000004",
      accession: "5554324",
      study: "X-Ray",
    },
  ],
  no_number: [],
  no_whatsapp: [],
};

async function fetchOrganizerData() {
  try {
    // Try to fetch from Odoo API
    const response = await fetch('/api/organizer', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Fetched data from Odoo');
      return data;
    } else {
      console.warn('⚠️ Odoo API returned error, using mock data');
      return mockOrganizerData;
    }
  } catch (error) {
    console.warn('⚠️ Failed to connect to Odoo, using mock data:', error);
    return mockOrganizerData;
  }
}

export default function OrganizerPage() {
  const [stages, setStages] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchOrganizerData();
        setStages(data);
      } catch (error) {
        console.error("Failed to fetch organizer data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-4">
          <Activity className="animate-spin text-blue-600" size={48} />
          <span className="text-lg text-gray-600 font-medium">Loading organizer data...</span>
        </div>
      </div>
    );
  }

  // Filter only stages that have patients
  const visibleStages = Object.entries(stages).filter(
    ([, patients]) => patients.length > 0
  );

  // Calculate total patients
  const totalPatients = visibleStages.reduce(
    (sum, [, patients]) => sum + patients.length,
    0
  );

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="flex flex-row">
            
        </div>

      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Patient Organizer
              </h1>
              <p className="text-gray-600">
                Manage and track patient records across different stages
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 rounded-xl border border-blue-200">
                <div className="text-sm text-blue-600 font-medium mb-1">Total Patients</div>
                <div className="text-3xl font-bold text-blue-700">{totalPatients}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {visibleStages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-96">
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center max-w-md">
            <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="text-gray-400" size={40} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No records found</h3>
            <p className="text-gray-500">
              There are currently no patient records to display.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-8 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {visibleStages.map(([stage, patients]) => {
              const config = STAGE_CONFIG[stage];
              const Icon = config.icon;
              
              return (
                <div
                  key={stage}
                  className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden transition-all hover:shadow-xl"
                >
                  {/* Column Header */}
                  <div className={`${config.bgColor} ${config.borderColor} border-b px-6 py-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`${config.badgeColor} p-2 rounded-lg`}>
                          <Icon className={config.textColor} size={20} />
                        </div>
                        <h2 className={`text-lg font-bold ${config.textColor}`}>
                          {config.label}
                        </h2>
                      </div>
                      <span className={`${config.badgeColor} ${config.textColor} text-sm font-bold px-3 py-1.5 rounded-full`}>
                        {patients.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards Container */}
                  <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
                    {patients.map((p) => (
                      <div
                        key={p.id}
                        className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
                      >
                        {/* Patient Name */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-500 to-blue-600 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shadow-md group-hover:scale-110 transition-transform">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                                {p.name}
                              </h3>
                            </div>
                          </div>
                        </div>

                        {/* Patient Details */}
                        <div className="space-y-2.5 pl-1">
                          <div className="flex items-center gap-2 text-sm">
                            <User className="text-gray-400" size={16} />
                            <span className="text-gray-500 font-medium">ID:</span>
                            <span className="text-gray-700 font-semibold">{p.nid || p.id}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="text-gray-400" size={16} />
                            <span className="text-gray-500 font-medium">Accession:</span>
                            <span className="text-gray-700 font-semibold">{p.accession}</span>
                          </div>
                          
                          {p.study && (
                            <div className="flex items-center gap-2 text-sm">
                              <Stethoscope className="text-gray-400" size={16} />
                              <span className="text-gray-500 font-medium">Study:</span>
                              <span className={`${config.badgeColor} ${config.textColor} px-2.5 py-1 rounded-md font-semibold text-xs`}>
                                {p.study}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}