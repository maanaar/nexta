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

  return (
    <div className="rounded-lg overflow-hidden w-full">
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
        <table className="w-full justify-center bg-white/80 items-center top-[10%] border-collapse">
          <thead>
            <tr className="bg-blue-300/60">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="border border-gray-400 px-3 py-2 h-[10%] text-center font-semibold text-gray-900 text-xs"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-gray-200/80 space-y-16">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="border border-gray-400 px-3 py-6 text-center text-gray-500">
                  No patient records found
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="hover:bg-gray-300/40 transition-colors">
                  {columns.map((_, colIndex) => (
                    <td
                      key={colIndex}
                      className="border border-gray-400 px-3 py-6 text-center text-sm"
                    >
                      {getCellValue(row, colIndex)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}