# Clinical RPM System — UX Analysis & Enhancement Guide

> **Document Version:** 1.0  
> **Date:** June 2026  
> **Project:** Remote Patient Monitoring (RPM) System  
> **Stack:** React + TypeScript (Vite), FastAPI backend, MQTT-based simulator

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current UX Features](#2-current-ux-features)
   - 2.1 [Layout & Navigation](#21-layout--navigation)
   - 2.2 [Patient List Sidebar](#22-patient-list-sidebar)
   - 2.3 [Vitals Tab — Cards & Chart](#23-vitals-tab--cards--chart)
   - 2.4 [ECG Monitor Tab](#24-ecg-monitor-tab)
   - 2.5 [Alerts Sidebar](#25-alerts-sidebar)
   - 2.6 [History Modal](#26-history-modal)
   - 2.7 [Thresholds Modal (Alert Settings)](#27-thresholds-modal-alert-settings)
   - 2.8 [Real-Time WebSocket Layer](#28-real-time-websocket-layer)
   - 2.9 [Animations & Micro-interactions](#29-animations--micro-interactions)
   - 2.10 [Design System & Styling](#210-design-system--styling)
3. [UX Enhancements — Minimal Changes, Maximum Impact](#3-ux-enhancements--minimal-changes-maximum-impact)
   - 3.1 [High Priority](#31-high-priority)
   - 3.2 [Medium Priority](#32-medium-priority)
   - 3.3 [Low Priority (Polish)](#33-low-priority-polish)
4. [Component-Level File Map](#4-component-level-file-map)
5. [Architecture Notes](#5-architecture-notes)

---

## 1. System Overview

The Clinical RPM System is a **real-time patient monitoring dashboard** used to observe vitals, ECG waveforms, and clinical alerts for multiple patients simultaneously. Data flows from a Python-based **simulator** → **MQTT broker** → **FastAPI backend** → **WebSocket** → **React frontend**.

The application is a **single-page dashboard** (`/`) with three collapsible panels:

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER  [ ☰ ] [ ♥ RPM System ]           [ 09:37:10 | 🟢 Live ]  │
├──────────────┬────────────────────────────┬─────────────────┤
│              │                            │                 │
│  PATIENT     │    CENTRAL WORKSPACE       │  ALERTS         │
│  LIST        │  [ Vitals | ECG Monitor ]  │  SIDEBAR        │
│  SIDEBAR     │                            │                 │
│  (Left)      │   VitalsPanel / VitalChart │  (Right)        │
│              │      OR EcgPanel           │                 │
└──────────────┴────────────────────────────┴─────────────────┘
```

---

## 2. Current UX Features

### 2.1 Layout & Navigation

| Feature | Description | Source File |
|---|---|---|
| **Three-panel layout** | Left (patient list) + Center (workspace) + Right (alerts) | `Dashboard.tsx` |
| **Collapsible patient panel** | Hamburger (☰) button in header toggles the left sidebar | `Dashboard.tsx` L46-57 |
| **Collapsible alerts panel** | Toggle chevron button on alerts sidebar left edge | `AlertsSidebar.tsx` L64-74 |
| **Auto-collapse on ECG expand** | Expanding ECG to fullscreen automatically hides the patient list sidebar | `Dashboard.tsx` L32-39 |
| **Keyboard: `Escape`** | Closes expanded ECG and any open modals (History, Thresholds) | `EcgPanel.tsx` L42-57, `HistoryModal.tsx` L82-88, `ThresholdsModal.tsx` L31-37 |
| **WebSocket live indicator** | Top-right pill shows a green/red animated dot + "Live" / "Connecting..." text | `Dashboard.tsx` L71-78 |
| **Timestamp display** | Selected patient's last update time shown in the header (monospace pill) | `Dashboard.tsx` L66-70 |
| **Empty state** | Animated "Select a Patient" prompt shown when no patient is selected | `CentralWorkspace.tsx` L26-43 |
| **Tab switcher** | Animated pill toggle between "Vitals" and "ECG Monitor" tabs with spring animation | `CentralWorkspace.tsx` L48-91 |

---

### 2.2 Patient List Sidebar

| Feature | Description | Source File |
|---|---|---|
| **Per-patient status dots** | Color-coded dot (green = normal, amber = warning, red = critical) computed from all 6 vitals | `PatientList.tsx` L16-25 |
| **Active patient highlight** | Selected patient gets an animated background highlight using Framer Motion `layoutId` spring | `PatientList.tsx` L84-91 |
| **Patient metadata** | Shows name, age badge (e.g., "45y"), and medical condition | `PatientList.tsx` L94-99 |
| **Sparkline mini-chart** | Tiny 40×16px SVG polyline showing the last 30 heart-rate readings; color changes red if HR is out of range (50–100 bpm) | `PatientList.tsx` L27-58 |
| **Sorted list** | Patients sorted alphabetically by ID | `PatientList.tsx` L61-63 |
| **No-patients empty state** | Prompt to start the simulator if no patients are connected | `PatientList.tsx` L68-72 |
| **Slide-out animation** | CSS transition hides the sidebar off-screen with smooth width collapse | `PatientList.css` |

---

### 2.3 Vitals Tab — Cards & Chart

#### VitalCard (per-vital summary tile)

| Feature | Description | Source File |
|---|---|---|
| **6 vital sign cards** | Heart Rate, SpO₂, Temperature, Respiratory Rate, Systolic BP, Diastolic BP | `VitalsPanel.tsx`, `types.ts` L121-128 |
| **Color-coded severity** | Cards change border/background color: normal → warning → critical | `VitalCard.tsx` L21-23 |
| **Hover scale animation** | `whileHover={{ scale: 1.02 }}` and `whileTap={{ scale: 0.98 }}` via Framer Motion | `VitalCard.tsx` L30-32 |
| **Live value update animation** | Value slides in from above (`y: -5 → 0, opacity: 0.5 → 1`) on every WebSocket update | `VitalCard.tsx` L38-46 |
| **Selectable cards** | Clicking a card selects that vital for the chart below | `VitalCard.tsx` L34, `VitalsPanel.tsx` L38-41 |
| **Glassmorphism styling** | Cards use `.glass-card` class (frosted backdrop blur + noise grain texture) | `index.css` L70-95 |
| **Null value handling** | Shows `"--"` when no data is yet received | `VitalCard.tsx` L45 |

#### VitalChart (historical line chart)

| Feature | Description | Source File |
|---|---|---|
| **Live rolling chart** | Appends new WebSocket data in real time; older data scrolls off the left | `VitalChart.tsx` L78-99 |
| **Time range selection** | Switch between 5m / 15m / 30m / 1h time windows | `VitalChart.tsx` L28-33, L200-208 |
| **Gap detection** | Breaks the chart line on gaps > 5 seconds (shows disconnection honestly) | `VitalChart.tsx` L113-127 |
| **Live badge** | "Viewing: HH:MM:SS — HH:MM:SS (Live)" context banner above chart | `VitalChart.tsx` L220-225 |
| **Min / Max / Avg stats bar** | Real-time statistics calculated over visible time window | `VitalChart.tsx` L129-136, L228-243 |
| **Multi-vital tooltip** | Hovering shows all 6 vitals at that timestamp in a formatted tooltip card | `VitalChart.tsx` L138-164 |
| **Vital selector buttons** | Row of buttons to switch which vital is plotted; same as clicking a VitalCard | `VitalChart.tsx` L170-179 |
| **Fullscreen expand** | Expands the chart to fill the center panel | `VitalChart.tsx` L46, L210-215 |
| **Loading spinner** | Shown while fetching historical data from the REST API | `VitalChart.tsx` L247-251 |
| **Settings (gear) button** | Opens ThresholdsModal directly from the chart toolbar | `VitalChart.tsx` L180-187 |
| **View History button** | Opens HistoryModal directly from the chart toolbar | `VitalChart.tsx` L190-196 |

---

### 2.4 ECG Monitor Tab

| Feature | Description | Source File |
|---|---|---|
| **Real-time ECG waveform** | Canvas-based Lead II P-QRS-T waveform rendered at 60fps with scrolling sweep animation | `EcgWaveform.tsx` |
| **Plethysmography waveform** | Real-time SpO₂ pleth waveform (dicrotic notch included) | `EcgWaveform.tsx` L116-132 |
| **Respiratory waveform** | Real-time breathing sine wave | `EcgWaveform.tsx` L134-137 |
| **ECG parameter cards** | 6 glass-card tiles showing PR interval, QRS duration, QT interval, QTc (Bazett), ST offset | `EcgPanel.tsx` L20-26, L129-141 |
| **Rhythm display** | Current cardiac rhythm label (e.g., "Sinus Rhythm") prominently displayed | `EcgPanel.tsx` L123-128 |
| **ECG paper grid** | Authentic pink medical ECG grid (small 1mm, large 5mm squares at 25mm/s scale) | `EcgWaveform.tsx` L182-222 |
| **Calibration markers** | "25 mm/s · 10 mm/mV" standard calibration text at bottom right | `EcgWaveform.tsx` L344-349 |
| **Voltage markers** | "+1.0 mV / 0.0 mV / −1.0 mV" Y-axis labels on the ECG canvas | `EcgWaveform.tsx` L351-358 |
| **Waveform label pill** | White pill overlay on each waveform showing BPM/lead, SpO₂%, or breath rate | `EcgWaveform.tsx` L331-342 |
| **Erase bar** | Moving blank gap simulates a real bedside cardiac monitor sweep style | `EcgWaveform.tsx` L277-293 |
| **Expand to fullscreen** | ECG panel expands to cover the entire workspace; sidebars auto-collapse | `EcgPanel.tsx` L34-40, `Dashboard.tsx` L32-39 |
| **Expanded vital cards** | When expanded, shows all 6 vital cards above the ECG waveforms | `EcgPanel.tsx` L105-117 |
| **View History (expanded only)** | History button appears in the toolbar only when the ECG panel is expanded | `EcgPanel.tsx` L68-76 |
| **Alert Settings (expanded only)** | Gear icon settings button appears in the toolbar only when ECG panel is expanded | `EcgPanel.tsx` L76-84 |
| **Hi-DPI canvas** | Canvas rendering uses `devicePixelRatio` for sharp rendering on retina displays | `EcgWaveform.tsx` L161-164 |

---

### 2.5 Alerts Sidebar

| Feature | Description | Source File |
|---|---|---|
| **Real-time active alerts** | Lists all currently active alerts sorted critical-first, then by duration | `AlertsSidebar.tsx` L38-55 |
| **Patient-grouped alerts** | Alerts grouped by patient with a header showing name and patient ID | `AlertsSidebar.tsx` L82-93 |
| **Severity coloring** | Groups and items color-coded red (critical) or amber (warning) | `AlertsSidebar.tsx` L88-89, L105 |
| **Live duration timer** | Each alert shows how long it has been active, updating every second | `AlertsSidebar.tsx` L15-29, L117-119 |
| **Click to navigate** | Clicking an alert selects that patient and switches to the relevant vital in the Vitals tab | `AlertsSidebar.tsx` L106, `Dashboard.tsx` L26-30 |
| **Hover stats reveal** | Hovering over an alert card reveals Min/Max/Avg stats and last 5 recent values | `AlertsSidebar.tsx` L121-131 |
| **Auto-clear on recovery** | Alerts automatically disappear from the list when vitals return to normal range | `useWebSocket.ts` L62-78 |
| **Toggle button pulsing** | The collapse/expand chevron button pulses red or amber when alerts are active and the sidebar is hidden | `AlertsSidebar.tsx` L65, `AlertsSidebar.css` |
| **No-alerts empty state** | Shows "No active alerts." when the system is healthy | `AlertsSidebar.tsx` L78-80 |

---

### 2.6 History Modal

| Feature | Description | Source File |
|---|---|---|
| **Date + Hour picker** | Select any date (up to today) and any hour of the day to browse archived data | `HistoryModal.tsx` L108-126 |
| **1-minute resolution chart** | Historical data aggregated to 1-minute intervals, displayed as a line chart | `HistoryModal.tsx` L156-191 |
| **Vital selector toggle** | Switch between all 6 vitals within the modal | `HistoryModal.tsx` L129-142 |
| **Gap injection** | Breaks chart line on gaps > 65 seconds (missing historical records) | `HistoryModal.tsx` L50-69 |
| **Loading state** | Spinner + message while data is fetching from the API | `HistoryModal.tsx` L146-150 |
| **Keyboard: `Escape`** | Closes the modal | `HistoryModal.tsx` L82-88 |
| **Backdrop click-to-close** | (Implied by `.history-modal-backdrop`) | `HistoryModal.css` |
| **Fixed hour X-axis** | Always shows the full selected 1-hour window on the X-axis regardless of data density | `HistoryModal.tsx` L92-94 |

---

### 2.7 Thresholds Modal (Alert Settings)

| Feature | Description | Source File |
|---|---|---|
| **Per-patient alert thresholds** | Each patient can have custom Crit Low / Warn Low / Warn High / Crit High for all 6 vitals | `ThresholdsModal.tsx` L70-121 |
| **"Custom" badge** | Rows with patient-specific overrides show a "Custom" badge vs system defaults | `ThresholdsModal.tsx` L87 |
| **Inline editable inputs** | All 4 threshold values per vital are editable number inputs in a table | `ThresholdsModal.tsx` L90-116 |
| **Save / Cancel actions** | Footer with Save and Cancel buttons; shows "Saving..." during API call | `ThresholdsModal.tsx` L125-130 |
| **Keyboard: `Escape`** | Closes the modal | `ThresholdsModal.tsx` L31-37 |
| **Loading state** | Shows "Loading..." while fetching existing thresholds from the API | `ThresholdsModal.tsx` L67-68 |

---

### 2.8 Real-Time WebSocket Layer

| Feature | Description | Source File |
|---|---|---|
| **Auto-reconnect** | Reconnects every 3 seconds on WebSocket disconnect | `useWebSocket.ts` L10, L126 |
| **4 message types** | Handles `snapshot`, `vitals`, `alert`, and `ecg` message types from the backend | `useWebSocket.ts` L34-117 |
| **Full snapshot on connect** | On first connect, receives all current patient states in one message | `useWebSocket.ts` L34-36 |
| **Rolling HR buffer** | Keeps the last 30 heart-rate values per patient for the sparkline | `useWebSocket.ts` L39-40 |
| **Auto-alert clearing** | Clears alerts from the sidebar automatically when vitals normalize | `useWebSocket.ts` L62-78 |
| **Critical-first sorting** | Alert list is always sorted: critical alerts first, then by longest active | `useWebSocket.ts` L142-146 |

---

### 2.9 Animations & Micro-interactions

| Animation | Component | Library |
|---|---|---|
| Spring-animated active tab background (layoutId) | `CentralWorkspace.tsx` | Framer Motion |
| Spring-animated selected patient background (layoutId) | `PatientList.tsx` | Framer Motion |
| Tab content slide-up / slide-down on switch | `CentralWorkspace.tsx` | Framer Motion AnimatePresence |
| Vital card hover scale + tap scale | `VitalCard.tsx` | Framer Motion |
| Vital value update slide-in animation | `VitalCard.tsx` | Framer Motion |
| Empty state fade-in | `CentralWorkspace.tsx` | Framer Motion |
| Live WebSocket dot pulse glow | `Dashboard.css` | CSS box-shadow |
| Alert toggle button pulse (red/amber) | `AlertsSidebar.css` | CSS @keyframes |
| Patient sidebar slide-out | `PatientList.css` | CSS transition |
| Alerts sidebar slide-out | `AlertsSidebar.css` | CSS transition |
| ECG scrolling sweep at 60fps | `EcgWaveform.tsx` | Canvas / requestAnimationFrame |
| History modal loading spinner | `HistoryModal.css` | CSS @keyframes |

---

### 2.10 Design System & Styling

| Token | Value | Purpose |
|---|---|---|
| `--blue-600` | `#76ABAE` | Primary teal (interactive accent) |
| `--slate-900` | `#303841` | Dark charcoal header |
| `--slate-50` | `#F5F5F5` | Base light gray background |
| `--font-sans` | Poppins | Body text |
| `--font-mono` | Consolas | Monospace (timestamps, ECG labels) |
| `--glass-bg` | `rgba(245,245,245,0.55)` | Glass card background |
| `--glass-blur` | `blur(28px)` | Backdrop filter |
| `--shadow-card` | multi-layer inset+drop | Cards depth |
| Active tab color | `#FF5722` (Orange) | Strong contrast vs teal palette |
| Critical severity | CSS red (`#cf222e`) | Urgent alert color |
| Warning severity | CSS amber | Caution alert color |

---

## 3. UX Enhancements — Minimal Changes, Maximum Impact

The following improvements are small, targeted changes that don't require architectural redesign. Each item is rated by **impact** (user benefit) vs **effort** (lines of code / risk).

---

### 3.1 High Priority

#### 🔴 H1 — Sparkline hardcoded HR threshold in PatientList
**File:** [`PatientList.tsx` L44](../frontend/src/components/PatientList.tsx)

**Problem:** The sparkline color turns red if `latest > 100 || latest < 50`. These thresholds are hardcoded and don't respect per-patient custom thresholds configured in the Thresholds Modal.

**Fix:** Import `VITAL_CONFIGS` and `getVitalStatus`, then compute the status dynamically:
```diff
- const color = latest > 100 || latest < 50 ? "#cf222e" : "#0366d6";
+ const hrConfig = VITAL_CONFIGS.find(c => c.key === "heart_rate")!;
+ const status = getVitalStatus(hrConfig, latest);
+ const color = status === "critical" ? "#cf222e" : status === "warning" ? "#d97706" : "#0366d6";
```

---

#### 🔴 H2 — ThresholdsModal uses `alert()` for error feedback
**File:** [`ThresholdsModal.tsx` L52](../frontend/src/components/ThresholdsModal.tsx)

**Problem:** On save failure, a browser `alert()` pops up — inconsistent with the rest of the UI, looks unprofessional, and blocks the tab.

**Fix:** Add an inline error state displayed inside the modal footer:
```diff
- alert("Failed to save thresholds.");
+ setSaveError("Failed to save thresholds. Please try again.");
```
Then render `{saveError && <p className="modal__error">{saveError}</p>}` in the footer.

---

#### 🔴 H3 — History Modal not accessible from Vitals Tab (non-expanded state)
**File:** [`EcgPanel.tsx` L68](../frontend/src/components/EcgPanel.tsx)

**Problem:** "View History" and "Alert Settings" buttons in the ECG panel are only shown when the panel is expanded (`isExpanded && ...`). A user monitoring a patient on the Vitals tab has no shortcut to History from VitalsPanel — they must open the VitalChart toolbar.

**Fix:** Move those buttons to always be visible in the EcgPanel header (regardless of expand state), or ensure the VitalsPanel header also surfaces a History button alongside the patient name.

---

#### 🔴 H4 — No visual feedback when patient sidebar is collapsed
**File:** [`PatientList.tsx`](../frontend/src/components/PatientList.tsx)

**Problem:** When the patient sidebar is collapsed, there's no icon or badge to signal alerts or patient count to the user. They lose all context.

**Fix:** When `!isOpen`, render a narrow collapsed rail (~40px) showing:
- The count of patients
- A colored dot for the most critical patient's status
- A tooltip on hover

---

#### 🔴 H5 — `VitalChart` fullscreen does not escape via keyboard
**File:** [`VitalChart.tsx`](../frontend/src/components/VitalChart.tsx)

**Problem:** The VitalChart has an "Expand" fullscreen button (L210-215) but no `Escape` key handler to close it, unlike EcgPanel and both modals which correctly add `window.addEventListener("keydown", ...)`.

**Fix:**
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [isFullscreen]);
```

---

### 3.2 Medium Priority

#### 🟡 M1 — Alerts sidebar has no alert count badge on toggle button
**File:** [`AlertsSidebar.tsx` L64](../frontend/src/components/AlertsSidebar.tsx)

**Problem:** The toggle chevron button pulses when alerts are present but shows no count, so the user can't know how many patients are in distress at a glance.

**Fix:** Add a small count badge on the toggle button:
```tsx
{!isOpen && alerts.length > 0 && (
  <span className="alerts-sidebar__badge">{alerts.length}</span>
)}
```

---

#### 🟡 M2 — Patient list sorted alphabetically by ID, not by severity
**File:** [`PatientList.tsx` L61-63](../frontend/src/components/PatientList.tsx)

**Problem:** Critical patients appear wherever they fall alphabetically rather than at the top. In a clinical setting, critical patients should always be prominent.

**Fix:**
```diff
- const patientList = Object.values(patients).sort((a, b) =>
-   (a.id || "").localeCompare(b.id || "")
- );
+ const STATUS_ORDER = { critical: 0, warning: 1, normal: 2 };
+ const patientList = Object.values(patients).sort((a, b) => {
+   const sA = STATUS_ORDER[getPatientOverallStatus(a)];
+   const sB = STATUS_ORDER[getPatientOverallStatus(b)];
+   return sA !== sB ? sA - sB : (a.id || "").localeCompare(b.id || "");
+ });
```

---

#### 🟡 M3 — No indication of when WebSocket data was last received
**File:** [`Dashboard.tsx` L66-70](../frontend/src/pages/Dashboard.tsx)

**Problem:** The header timestamp shows the selected patient's `recorded_at`, but only when connected. If the backend silently stops sending data (connection stays open but no messages), the stale timestamp could mislead clinicians.

**Fix:** Track `lastMessageAt` in `useWebSocket.ts` and show a "Data stale" warning if it hasn't updated in > 10 seconds while `connected === true`.

---

#### 🟡 M4 — EcgWaveform renders identically for Pleth and Resp (same line color)
**File:** [`EcgWaveform.tsx` L238-266](../frontend/src/components/EcgWaveform.tsx)

**Problem:** All three waveform types (ECG, Pleth, Resp) use `#0f172a` (near-black) as the stroke color. On a real cardiac monitor, each channel has a distinct color (e.g., ECG=green, SpO₂=cyan, Resp=yellow) making them instantly distinguishable.

**Fix:**
```diff
- let strokeColor = "#0f172a";
+ let strokeColor = waveType === "ecg" ? "#00e676"    // medical green
+                 : waveType === "pleth" ? "#00b0ff"  // cyan
+                 : "#ffea00";                         // yellow
```

---

#### 🟡 M5 — ThresholdsModal has no input validation
**File:** [`ThresholdsModal.tsx` L39-43](../frontend/src/components/ThresholdsModal.tsx)

**Problem:** Users can enter nonsensical thresholds (e.g., `critLow > warnLow`, or negative SpO₂). No validation is performed before the API call.

**Fix:** Before saving, validate that `critLow ≤ warnLow ≤ warnHigh ≤ critHigh` for each vital. Show inline row-level error messages in the table.

---

#### 🟡 M6 — History Modal hour selector shows future hours
**File:** [`HistoryModal.tsx` L119-124](../frontend/src/components/HistoryModal.tsx)

**Problem:** If the user selects today's date, the hour dropdown still shows all 24 hours — including future hours. Selecting a future hour returns no data without explanation.

**Fix:** Filter the hour options based on whether the selected date is today:
```tsx
const maxHour = date === new Date().toISOString().split("T")[0]
  ? new Date().getHours()
  : 23;
// Only render options up to maxHour
```

---

#### 🟡 M7 — No tooltip on VitalCard showing thresholds
**File:** [`VitalCard.tsx`](../frontend/src/components/VitalCard.tsx)

**Problem:** VitalCards show current values with color but don't communicate _why_ a vital is warning/critical. The user must open ThresholdsModal to see the ranges.

**Fix:** Add a native `title` attribute showing the threshold ranges:
```tsx
<motion.div
  title={`Normal: ${config.warnLow ?? '—'} – ${config.warnHigh ?? '—'} ${config.unit}`}
  ...
>
```
Or use a styled tooltip on hover for richer display.

---

### 3.3 Low Priority (Polish)

#### 🟢 L1 — Dashboard header title says just "RPM System"
**File:** [`Dashboard.tsx` L63](../frontend/src/pages/Dashboard.tsx)

**Suggestion:** Rename to "Clinical RPM Monitor" or include institution name for a more professional feel. Also consider making the `<h1>` dynamic (e.g., appending the ward/unit name from config).

---

#### 🟢 L2 — Poppins font is referenced but not loaded from Google Fonts
**File:** [`index.css` L45](../frontend/src/index.css)

**Problem:** `--font-sans` references "Poppins" but there's no `@import url(...)` or `<link>` in `index.html`. The browser falls back to system fonts silently.

**Fix:** Add to `index.html` or `index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
```

---

#### 🟢 L3 — Active patient selection doesn't persist across page refresh
**Feature Gap:** `selectedId` is React state only. Refreshing the page deselects the patient.

**Fix:** Sync `selectedId` to `sessionStorage`:
```typescript
const [selectedId, setSelectedId] = useState<string | null>(
  () => sessionStorage.getItem("rpm_selected_patient")
);
// On change:
const handleSelect = (id: string) => {
  sessionStorage.setItem("rpm_selected_patient", id);
  setSelectedId(id);
};
```

---

#### 🟢 L4 — No sound/audio alert for critical severity
**Feature Gap:** All alerting is purely visual. A critical alarm (e.g., SpO₂ < 90%) would benefit from a non-intrusive audio tone using the Web Audio API.

**Suggestion:** Add an optional audio alert toggle in the header. On first critical alert, play a short 440Hz tone with a 2-second cooldown.

---

#### 🟢 L5 — ECG panel gear icon and "View History" only appear on expand
**File:** [`EcgPanel.tsx` L68-84](../frontend/src/components/EcgPanel.tsx)

**Problem:** This creates a discoverability issue — users must first expand the ECG panel to discover the History and Settings shortcuts.

**Fix:** Show these buttons always in the ECG panel header, but style them smaller or with lower visual weight when not expanded, or move them to a dropdown menu (`⋮`).

---

#### 🟢 L6 — No responsive / mobile layout
**Feature Gap:** The layout uses fixed `height: 100vh` and three-column flexbox. On tablet or small screens, panels overlap or become unusable.

**Suggestion:** Add a CSS media query breakpoint at 768px to stack panels vertically and convert the alerts sidebar to a collapsible bottom drawer.

---

#### 🟢 L7 — Dashboard.css uses inline styles for some buttons
**File:** [`Dashboard.tsx` L50](../frontend/src/pages/Dashboard.tsx), [`EcgPanel.tsx` L72, 79, 88](../frontend/src/components/EcgPanel.tsx)

**Problem:** The hamburger menu button and several EcgPanel buttons use `style={{ ... }}` inline styles instead of CSS classes. This reduces maintainability and makes overriding styles harder.

**Fix:** Move these inline styles to their respective `.css` files as BEM classes (e.g., `.dashboard__menu-btn`, `.ecg-panel__action-btn`).

---

## 4. Component-Level File Map

```
frontend/src/
├── api.ts                          ← REST API client (fetch vitals, history, thresholds)
├── types.ts                        ← TypeScript interfaces + VITAL_CONFIGS + getVitalStatus()
├── index.css                       ← Global design system (tokens, .glass-card, scrollbar)
├── App.tsx                         ← Root component (renders <Dashboard />)
├── main.tsx                        ← React entry point
│
├── hooks/
│   └── useWebSocket.ts             ← WebSocket connection, patient state, alert management
│
├── pages/
│   ├── Dashboard.tsx               ← Main layout + panel state management
│   └── Dashboard.css               ← Header, body, tabs, empty-state styles
│
└── components/
    ├── PatientList.tsx             ← Left sidebar: patient cards with sparklines
    ├── PatientList.css
    │
    ├── CentralWorkspace.tsx        ← Tab switcher + renders VitalsPanel/VitalChart or EcgPanel
    │
    ├── VitalsPanel.tsx             ← Grid of VitalCards + ThresholdsModal trigger
    ├── VitalsPanel.css
    │
    ├── VitalCard.tsx               ← Individual vital tile with Framer Motion
    ├── VitalCard.css
    │
    ├── VitalChart.tsx              ← Historical line chart (Recharts) with live update
    ├── VitalChart.css
    │
    ├── EcgPanel.tsx                ← ECG monitor with parameter cards + waveforms
    ├── EcgPanel.css
    │
    ├── EcgWaveform.tsx             ← Canvas 60fps waveform renderer (ECG/Pleth/Resp)
    ├── EcgWaveform.css
    │
    ├── AlertsSidebar.tsx           ← Right sidebar: live alert feed with severity sorting
    ├── AlertsSidebar.css
    │
    ├── HistoryModal.tsx            ← Historical browsing modal (date+hour picker)
    ├── HistoryModal.css
    │
    ├── ThresholdsModal.tsx         ← Alert threshold configuration modal
    └── ThresholdsModal.css
```

---

## 5. Architecture Notes

### Data Flow

```
Python Simulator (simulator/)
  └─► MQTT Broker (mosquitto)
        └─► Backend MQTT Consumer (backend/mqtt/)
              └─► SQLite Database (backend/vitals.db)
              └─► WebSocket Broadcaster (backend/main.py → /ws)
                    └─► React Frontend (useWebSocket.ts)
                          ├─► patients state (vitals updates)
                          ├─► alertsMap state (alert events)
                          └─► connected state (connection health)
```

### REST API Endpoints (used by frontend)

| Endpoint | Used In |
|---|---|
| `GET /api/patients/{id}/vitals?minutes=N` | `VitalChart.tsx` (history load on patient/range change) |
| `GET /api/patients/{id}/history?date=&hour=` | `HistoryModal.tsx` |
| `GET /api/patients/{id}/thresholds` | `ThresholdsModal.tsx` (load) |
| `PUT /api/patients/{id}/thresholds` | `ThresholdsModal.tsx` (save) |
| `GET /api/patients/{id}/alerts?limit=N` | `api.ts` (defined but not currently used in UI) |

### WebSocket Message Types

| Type | Trigger | Key Fields |
|---|---|---|
| `snapshot` | On connect | `data: Record<string, Patient>` |
| `vitals` | Every ~2s per patient | `patient_id`, 6 vital values, `recorded_at` |
| `alert` | When vital crosses threshold | `patient_id`, `vital_type`, `severity`, `message`, `value` |
| `ecg` | Every ~250ms per patient | `patient_id`, `pr_interval`, `qrs_duration`, `qt_interval`, `qtc_interval`, `st_offset`, `rhythm` |

---

*Generated by Antigravity AI — Clinical RPM System UX Analysis v1.0*
