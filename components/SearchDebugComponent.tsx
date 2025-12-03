"use client";
import { useSearch } from "@/context/SearchContext";

/**
 * Temporary debug component - Add this to your AdminPage to test if context is working
 * Place it right above <AdminTable />
 */
export default function SearchDebugComponent() {
  const { searchQuery } = useSearch();
  
  return (
    <div className="bg-yellow-100 border-2 border-yellow-500 p-4 rounded mb-4">
      <h3 className="font-bold">🐛 Debug Info:</h3>
      <p>Current search query: "<strong>{searchQuery}</strong>"</p>
      <p>Query length: {searchQuery.length}</p>
      <p>Is empty: {searchQuery ? 'No' : 'Yes'}</p>
    </div>
  );
}