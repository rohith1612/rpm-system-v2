import { useState } from "react";
import { createPatient } from "../api";

interface Props {
  onPatientAdded: (patientId: string) => void;
}

export default function AddPatientCard({ onPatientAdded }: Props) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [age, setAge] = useState("");
  const [condition, setCondition] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!patientId.trim()) {
      setError("Patient ID is required");
      return;
    }
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      setError("Valid age is required");
      return;
    }
    if (!condition.trim()) {
      setError("Diagnosis/Condition is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fullName = surname ? `${name} ${surname}`.trim() : name;
      await createPatient({ id: patientId, name: fullName, age: ageNum, condition });
      // Reset form
      setPatientId("");
      setName("");
      setSurname("");
      setAge("");
      setCondition("");
      setIsFormOpen(false);
      onPatientAdded(patientId);
    } catch (e) {
      setError("Failed to save. Ensure ID is unique.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!isFormOpen) {
    return (
      <div 
        onClick={() => setIsFormOpen(true)}
        className="bg-indigo-50/50 dark:bg-transparent dark:border-slate-700 rounded-2xl border-2 border-dashed border-indigo-200 p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all duration-300 min-h-[220px] select-none"
      >
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-indigo-600 text-2xl shadow-sm mb-3 dark:bg-transparent dark:border-white/10">
          +
        </div>
        <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-400">Add New Patient</h3>
        <p className="text-[10px] text-indigo-500/70 dark:text-indigo-500 mt-1">Register to DB & Dashboard</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-indigo-200 dark:border-slate-700 p-4 flex flex-col min-h-[220px] relative select-none">
      <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
        <h3 className="text-xs font-bold text-slate-800 dark:text-white">New Patient Registration</h3>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsFormOpen(false);
            setError(null);
          }}
          className="text-slate-400 dark:text-white hover:text-slate-600 dark:text-white font-bold text-xs"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSave} className="flex flex-col flex-1 gap-2 text-xs">
        <input
          type="text"
          placeholder="Patient ID (e.g. PD_123)"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded focus:outline-none focus:border-indigo-500"
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-1/2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded focus:outline-none focus:border-indigo-500"
            disabled={saving}
            onClick={(e) => e.stopPropagation()}
          />
          <input
            type="text"
            placeholder="Surname"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            className="w-1/2 px-2 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded focus:outline-none focus:border-indigo-500"
            disabled={saving}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <input
          type="number"
          placeholder="Age"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded focus:outline-none focus:border-indigo-500"
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
        />
        <input
          type="text"
          placeholder="Diagnosis / Condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded focus:outline-none focus:border-indigo-500"
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
        />
        
        {error && <span className="text-[10px] text-red-500 mt-1">{error}</span>}
        
        <div className="mt-auto pt-2 flex gap-2">
          <button 
            type="submit" 
            disabled={saving}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded disabled:opacity-50"
            onClick={(e) => e.stopPropagation()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
