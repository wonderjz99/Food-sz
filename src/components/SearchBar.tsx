import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FoodSafetyUnit } from "../types";

type SearchRecord = {
  i: string; // id
  n: string; // name
  a: string; // address
  l: string; // ratingLevel
  d: string; // district
  t: number; // ratingYear
  g: boolean; // hasGeocode
};

type SearchBarProps = {
  onSelect: (unit: Partial<FoodSafetyUnit> & { hasGeocode: boolean }) => void;
};

export function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchRecord[] | null>(null);
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Lazy-load search index on first focus
  const loadIndex = async () => {
    if (index) return;
    try {
      const res = await fetch("/data/search-index.json");
      if (res.ok) {
        const data: SearchRecord[] = await res.json();
        setIndex(data);
        setResults(data.slice(0, 10));
        setOpen(true);
      }
    } catch {/* ignore */}
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (inputWrapRef.current && !inputWrapRef.current.contains(target) && !target.closest(".search-results-portal")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Filter on input change
  const doSearch = (q: string) => {
    setQuery(q);
    setSelectedIdx(0);
    if (!q.trim() || !index) {
      setResults([]);
      setOpen(false);
      return;
    }
    const lower = q.trim().toLowerCase();
    const found = index
      .filter((r) => r.n.toLowerCase().includes(lower) || r.a.toLowerCase().includes(lower))
      .slice(0, 10);
    setResults(found);
    if (found.length > 0 && inputWrapRef.current) {
      const r = inputWrapRef.current.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(found.length > 0);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const select = (r: SearchRecord) => {
    setQuery(r.n);
    setOpen(false);
    onSelect({
      id: r.i,
      name: r.n,
      address: r.a,
      ratingLevel: r.l as FoodSafetyUnit["ratingLevel"],
      district: r.d,
      ratingYear: r.t,
      hasGeocode: r.g,
    });
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="search-bar-container">
      <div className="search-bar-input" ref={inputWrapRef}>
        <Search size={16} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => doSearch(e.target.value)}
          onFocus={() => { if (!index) loadIndex(); else if (results.length > 0) {
            if (inputWrapRef.current) {
              const r = inputWrapRef.current.getBoundingClientRect();
              setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
            }
            setOpen(true);
          }}}
          onKeyDown={handleKeyDown}
          placeholder="搜索餐厅名称或地址…"
        />
        {query && (
          <button type="button" className="search-clear" onClick={clear}>
            <X size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && dropdownRect && createPortal(
        <ul className="search-results search-results-portal" style={{
          position: "fixed",
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
          zIndex: 99999,
        }}>
          {results.map((r, idx) => (
            <li
              key={r.i}
              className={idx === selectedIdx ? "selected" : ""}
              onMouseEnter={() => setSelectedIdx(idx)}
              onClick={() => select(r)}
            >
              <span className="search-result-name">
                {r.n}
                {!r.g && <small className="search-no-geo">无坐标</small>}
              </span>
              <span className="search-result-meta">
                <span className={`rating-badge rating-${r.l.toLowerCase()}`}>{r.l}级</span>
                <span className="search-result-district">{r.d}</span>
              </span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
