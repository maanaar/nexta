"use client";

import { createContext, useContext, useState } from "react";
import { DEFAULT_DATE_FILTER, type DateFilter } from "@/lib/date-filter";

interface SearchContextType {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  dateFilter: DateFilter;
  setDateFilter: (value: DateFilter) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  return (
    <SearchContext.Provider value={{ searchQuery, setSearchQuery, dateFilter, setDateFilter }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used inside SearchProvider");
  }
  return context;
}
