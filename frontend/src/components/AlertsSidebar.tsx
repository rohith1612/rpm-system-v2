import { useState, useEffect, useMemo } from "react";
import type { ActiveAlert, Patient } from "../types";
import { VITAL_CONFIGS } from "../types";

interface Props {
  alerts: ActiveAlert[];
  patients: Record<string, Patient>;
  onSelectPatient: (
    patientId: string,
    vitalType: string
  ) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function AlertsSidebar({
  alerts,
  patients,
  onSelectPatient,
  isOpen,
  onToggle,
}: Props) {
  const [now, setNow] = useState(Date.now());

  const [dismissedAlerts, setDismissedAlerts] =
    useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => clearInterval(timer);
  }, []);

  const formatDuration = (
    startedAt: number
  ) => {
    const diff = Math.floor(
      (now - startedAt) / 1000
    );

    const m = Math.floor(diff / 60);
    const s = diff % 60;

    return m > 0
      ? `${m}m ${s}s`
      : `${s}s`;
  };

  const getLabel = (key: string) =>
    VITAL_CONFIGS.find(
      c => c.key === key
    )?.label || key;

  const getFirstName = (
    patientId: string
  ) => {
    const name =
      patients[patientId]?.name;

    return name
      ? name.split(" ")[0]
      : "";
  };

  const dismissAlert = (
    patientId: string,
    vitalType: string
  ) => {
    setDismissedAlerts(prev => {
      const next = new Set(prev);

      next.add(
        `${patientId}-${vitalType}`
      );

      return next;
    });
  };

  const activeAlerts = useMemo(() => {
    return alerts.filter(a => {
      const id =
        `${a.patient_id}-${a.vital_type}`;

      return !dismissedAlerts.has(id);
    });
  }, [alerts, dismissedAlerts]);

  const groupedAlerts =
    useMemo(() => {
      const groups:
        Record<
          string,
          ActiveAlert[]
        > = {};

      activeAlerts.forEach(a => {
        if (
          !groups[a.patient_id]
        ) {
          groups[a.patient_id] =
            [];
        }

        groups[
          a.patient_id
        ].push(a);
      });

      return Object.entries(
        groups
      );
    }, [activeAlerts]);

  const highestSeverity =
    activeAlerts.some(
      a =>
        a.severity ===
        "critical"
    )
      ? "critical"
      : activeAlerts.length
        ? "warning"
        : null;

  return (
    <>
      <button
        onClick={onToggle}
        title="Toggle Alerts"
        className={`
fixed
top-1/2
right-0
-translate-y-1/2
z-50

w-12
h-28

rounded-l-2xl
border
border-r-0
shadow-xl

flex
items-center
justify-center

${highestSeverity ===
            "critical"
            ? "bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]"
            : highestSeverity ===
              "warning"
              ? "bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]"
              : activeAlerts.length
                ? "bg-indigo-500 text-white"
                : "bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          }
`}
      >
        {!isOpen &&
          activeAlerts.length >
          0 && (
            <span
              className="
absolute
-top-2
-left-2
w-6
h-6
rounded-full
bg-red-600
text-white
text-[10px]
font-bold
flex
items-center
justify-center
"
            >
              {
                activeAlerts.length
              }
            </span>
          )}

        <span
          className={`text-xl ${isOpen
              ? "rotate-180"
              : ""
            }`}
        >
          ❮
        </span>
      </button>

      <aside
        className={`
fixed
right-0
top-0
w-80
h-screen
bg-white
dark:bg-slate-900
border-l
dark:border-slate-800
shadow-2xl
z-40
transition-transform
${isOpen
            ? "translate-x-0"
            : "translate-x-full"
          }
`}
      >
        <div className="p-5 h-full flex flex-col">

          <h2 className="font-bold border-b dark:border-slate-800 pb-3 mb-4 dark:text-white">
            System Alerts
          </h2>

          {activeAlerts.length ===
            0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-white">
              No active alerts
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto pr-2">

              {groupedAlerts.map(
                ([
                  patientId,
                  patientAlerts,
                ]) => (
                  <div
                    key={patientId}
                    className="border dark:border-slate-800 rounded-2xl p-4 space-y-3"
                  >
                  <div className="text-sm font-bold text-slate-700 dark:text-white">
                      👤{" "}
                      {getFirstName(
                        patientId
                      )}
                    </div>

                    {patientAlerts.map(
                      alert => (
                        <div
                          key={`${alert.patient_id}-${alert.vital_type}`}
                          onClick={() =>
                            onSelectPatient(
                              alert.patient_id,
                              alert.vital_type
                            )
                          }
                          className={`
relative
rounded-xl
p-4
cursor-pointer
text-white
shadow-md
border

${alert.severity ===
                              "critical"
                              ? "bg-red-600 border-red-700"
                              : "bg-amber-500 border-amber-600"
                            }
`}
                        >
                          <button
                            onClick={(
                              e
                            ) => {
                              e.stopPropagation();

                              dismissAlert(
                                alert.patient_id,
                                alert.vital_type
                              );
                            }}
                            className="
absolute
top-2
right-2

w-6
h-6

rounded-full

bg-white/20
hover:bg-white/40

text-xs
font-bold

flex
items-center
justify-center
 dark:bg-transparent dark:border-white/10"
                          >
                            ✕
                          </button>

                          <div className="font-bold text-lg">
                            {getLabel(
                              alert.vital_type
                            )}
                          </div>

                          <div className="text-sm mt-2">
                            {
                              alert.message
                            }
                          </div>

                          <div className="text-xs mt-3 opacity-90">
                            {formatDuration(
                              alert.started_at
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}