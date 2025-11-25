"use client";

import { useState, useEffect } from 'react';

interface PatientRecord {
  id: number;
  patientName: string;
  whatsappNum: string;
  modality: string;
  studyDesc: string;
  accessionNum: string;
  patientId: string;
  createdOn: string;
  reportCreationDate: string;
  sentAt: string;
  timer: string;
  state: string;
}

export default function AdminTable() {
  const [data, setData] = useState<PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedModalities, setExpandedModalities] = useState<Set<string>>(new Set());

  const columns = [
    "Patient name",
    "whatsapp num",
    "modality",
    "Study Desc",
    "Accession Num",
    "Patient Id",
    "Created On",
    "Report Creation Date",
    "Sent At",
    "Timer",
    "State"
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/patients');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      setData(result.data || []);
    } catch (err: any) {
      console.error('Error fetching patient data:', err);
      setError(err.message || 'Failed to load patient data');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModality = (modality: string) => {
    const newExpanded = new Set(expandedModalities);
    if (newExpanded.has(modality)) {
      newExpanded.delete(modality);
    } else {
      newExpanded.add(modality);
    }
    setExpandedModalities(newExpanded);
  };

  const getCellValue = (row: PatientRecord, columnIndex: number): string => {
    const columnMap: (keyof PatientRecord)[] = [
      'patientName',
      'whatsappNum',
      'modality',
      'studyDesc',
      'accessionNum',
      'patientId',
      'createdOn',
      'reportCreationDate',
      'sentAt',
      'timer',
      'state',
    ];
    
    const key = columnMap[columnIndex];
    return row[key]?.toString() || 'N/A';
  };

  // Group data by modality
  const groupedData = data.reduce((acc, record) => {
    const modality = record.modality || 'Unknown';
    if (!acc[modality]) {
      acc[modality] = [];
    }
    acc[modality].push(record);
    return acc;
  }, {} as Record<string, PatientRecord[]>);

  const modalities = Object.keys(groupedData).sort();

  return (
    <div className="rounded-lg w-full overflow-x-auto">
      <div className="h-4 sm:h-8 lg:h-12"></div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="text-gray-600">Loading patient data...</div>
        </div>
      ) : (
        <div className="space-y-8">
          <table className="w-full table-fixed justify-center min-h-[80%] bg-transparent items-center border-5 border-b-blue-950 border-spacing-y-0 font-sans">
            <colgroup>
              {columns.map((_, index) => (
                <col key={index} className="w-40" />
              ))}
            </colgroup>
            <thead>
              <tr className=" bg-linear-to-r from-[#3485A1]/50 via-[#43739c]/0 to-[#3371A9]/50 border-black">
                {columns.map((column, index) => (
                  <th
                    key={index}
                    className={`border-2 border-gray-400 shadow-md px-4 py-6 text-center font-semibold text-gray-900 text-sm w-40 whitespace-nowrap ${
                      index === 0 ? "rounded-tl-2xl" : ""
                    } ${index === columns.length - 1 ? "rounded-tr-2xl" : ""}`}
                  >
                    <span className="block truncate">{column}</span>
                  </th>
                ))}
              </tr>
            </thead>
          </table>

          {data.length === 0 ? (
            <div className="border-2 border-gray-400 shadow-lg px-10 py-16 text-center text-gray-500 bg-white/80 rounded">
              No patient records found
            </div>
          ) : (
            modalities.map((modality) => (
              <div key={modality} className="mb-8">
                <table className="w-full table-fixed bg-white/80 border-separate border-spacing-y-3 font-sans">
                  <colgroup>
                    {columns.map((_, index) => (
                      <col key={index} className="w-40" />
                    ))}
                  </colgroup>
                  <tbody className="bg-transparent">
                    {/* Collapsible Modality Header Row */}
                    <tr 
                      onClick={() => toggleModality(modality)}
                      className="cursor-pointer hover:bg-blue-400/60 transition-colors"
                    >
                      <td 
                        colSpan={columns.length}
                        className="border-2 border-gray-400 shadow-lg px-10 py-8 text-left text-sm font-bold bg-gray-700/10 text-black/70 rounded"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-sm">
                            {expandedModalities.has(modality) ? '▼' : '▶'}
                          </span>
                          <span>{modality}</span>
                          <span className="text-sm font-normal">
                            ({groupedData[modality].length} records)
                          </span>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expanded Rows */}
                    {expandedModalities.has(modality) && groupedData[modality].map((row) => (
                      <tr key={row.id} className="hover:bg-gray-300/40 transition-colors">
                        {columns.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className="border-2 border-gray-400 shadow-md px-4 py-6 text-center text-sm bg-white/80 first:rounded-l last:rounded-r w-40 whitespace-nowrap"
                          >
                            <span className="block truncate">
                              {getCellValue(row, colIndex)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}