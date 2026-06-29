import { useState, useRef, useEffect } from "react";
import { API_BASE_URL } from "../api";

interface CernerPatientResult {
  cerner_id: string;
  name: string;
  gender: string;
  birthDate: string;
}

export default function CernerSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CernerPatientResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      // Auto load some users if empty
      if (results.length === 0 && !loading) {
        handleSearch(new Event("submit") as any, true);
      }
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const handleSearch = async (e: React.FormEvent, isAutoLoad = false) => {
    e.preventDefault();
    if (!isAutoLoad && !query.trim()) return;
    
    setLoading(true);
    setResults([]);
    try {
      const url = isAutoLoad 
        ? `${API_BASE_URL}/api/patients/cerner/search`
        : `${API_BASE_URL}/api/patients/cerner/search?name=${encodeURIComponent(query)}`;
      
      const sessionId = sessionStorage.getItem("smart_session_id");
      const headers = sessionId ? { "X-Session-Id": sessionId } : {};

      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        console.error("Search failed:", await res.text());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (cernerId: string) => {
    setImportingId(cernerId);
    try {
      const sessionId = sessionStorage.getItem("smart_session_id");
      const res = await fetch(`${API_BASE_URL}/api/patients/cerner/import/${cernerId}`, {
        method: "POST",
        headers: sessionId ? { "X-Session-Id": sessionId } : {}
      });
      if (res.ok) {
        alert("Patient imported successfully! They will appear on the dashboard.");
        setIsOpen(false);
      } else {
        alert("Failed to import patient. They may already exist.");
      }
    } catch (err) {
      console.error(err);
      alert("Error importing patient.");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 px-4 py-2 rounded-xl text-sm font-bold border border-indigo-600/20 transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        Search Cerner Sandbox
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-slate-900/40 backdrop-blur-sm">
          <div 
            ref={modalRef}
            className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Header / Search Bar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <form onSubmit={handleSearch} className="flex items-center gap-3 relative">
                <div className="absolute left-4 text-slate-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Type a patient's last name (e.g. Smart) and press Enter..." 
                  className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button type="submit" disabled={loading} className="px-5 py-3 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50">
                  {loading ? "Searching..." : "Search"}
                </button>
              </form>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2 bg-white dark:bg-slate-900">
              {results.length === 0 && !loading && (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                  No patients found. Enter a name to search the Cerner FHIR Sandbox.
                </div>
              )}

              {loading && (
                <div className="py-12 text-center text-indigo-500 text-sm font-semibold animate-pulse">
                  Querying Cerner...
                </div>
              )}

              {results.map((p) => (
                <div key={p.cerner_id} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900 dark:to-blue-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold uppercase text-lg border border-indigo-200 dark:border-indigo-800 shadow-sm">
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-white text-base">{p.name}</h4>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 mt-0.5">
                        <span className="capitalize">{p.gender}</span> • 
                        <span>DOB: {p.birthDate}</span> • 
                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">ID: {p.cerner_id}</span>
                      </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleImport(p.cerner_id)}
                    disabled={importingId === p.cerner_id}
                    className="px-4 py-2 text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg shadow-sm transition-all disabled:opacity-50"
                  >
                    {importingId === p.cerner_id ? "Importing..." : "Import"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
