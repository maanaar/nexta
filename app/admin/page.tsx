"use client";

export default function AdminPage() {
  const tableData = [
    { id: 1, col1: "", col2: "", col3: "", col4: "", col5: "", col6: "", col7: "", col8: "", col9: "" },
    { id: 2, col1: "", col2: "", col3: "", col4: "", col5: "", col6: "", col7: "", col8: "", col9: "" },
    { id: 3, col1: "", col2: "", col3: "", col4: "", col5: "", col6: "", col7: "", col8: "", col9: "" },
    { id: 4, col1: "", col2: "", col3: "", col4: "", col5: "", col6: "", col7: "", col8: "", col9: "" },
  ];

  return (
    <>
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white">Admin Panel</h2>
      </div>

      <div className=" bg-black rounded-lg p-6 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[...Array(9)].map((_, i) => (
                  <th
                    key={i}
                    className="border border-gray-400 bg-gray-300/50 p-4 text-left font-semibold text-gray-700"
                  >
                    {/* Add column headers */}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((row) => (
                <tr key={row.id} className="hover:bg-gray-300/30 transition-colors">
                  <td className="border border-gray-400 p-4">{row.col1}</td>
                  <td className="border border-gray-400 p-4">{row.col2}</td>
                  <td className="border border-gray-400 p-4">{row.col3}</td>
                  <td className="border border-gray-400 p-4">{row.col4}</td>
                  <td className="border border-gray-400 p-4">{row.col5}</td>
                  <td className="border border-gray-400 p-4">{row.col6}</td>
                  <td className="border border-gray-400 p-4">{row.col7}</td>
                  <td className="border border-gray-400 p-4">{row.col8}</td>
                  <td className="border border-gray-400 p-4">{row.col9}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}