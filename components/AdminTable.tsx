"use client";

export default function AdminTable() {
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

  const data = [
    { id: 1 },
    { id: 2 },
    { id: 3 },
  ];

  return (
    <div className="bg-white/80 rounded-lg shadow-xl mt-48 overflow-hidden w-full">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-blue-300/60">
            {columns.map((column, index) => (
              <th
                key={index}
                className="border border-gray-400 px-3 py-2 text-center font-semibold text-gray-900 text-xs"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-gray-200/80">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-300/40 transition-colors">
              {columns.map((_, colIndex) => (
                <td
                  key={colIndex}
                  className="border border-gray-400 px-3 py-6"
                >
                  {/* Add your data here */}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}