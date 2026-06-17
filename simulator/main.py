"""
Tkinter-based Vital Signs Simulator for Remote Patient Monitoring.
Sleek Dark Dashboard Edition powered by ttkbootstrap.
"""
import os
import sys
import time
import threading
import tkinter as tk
import ttkbootstrap as ttkb
from ttkbootstrap.constants import *
import json
from ttkbootstrap.tooltip import ToolTip

# ── Resolve imports ───────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simulator.patients import SCENARIOS
from simulator.engine import DiseaseEngine, PhysiologyEngine, VitalGenerator, NoiseGenerator, EcgGenerator
from simulator.mqtt_publisher import MQTTPublisher

SESSION_ID = os.environ.get("RPM_SESSION_ID", "acl-rpm")

# ── Color thresholds ─────────────────────────────────
def vital_status(key, value):
    thresholds = {
        "heart_rate":       (55, 45, 110, 130),
        "spo2":             (94, 90, 200, 200),
        "temperature":      (0, 0, 37.5, 38.5),
        "respiratory_rate": (10, 8, 22, 28),
        "systolic_bp":      (95, 80, 140, 170),
        "diastolic_bp":     (55, 45, 90, 100),
    }
    if key not in thresholds: return "normal"
    wl, cl, wh, ch = thresholds[key]
    if value < cl or value > ch: return "danger"
    if value < wl or value > wh: return "warning"
    return "success"

VITAL_LABELS = {
    "heart_rate":       ("Heart Rate", "bpm"),
    "spo2":             ("SpO₂",       "%"),
    "temperature":      ("Temp",       "°C"),
    "respiratory_rate": ("Resp Rate",  "br/m"),
    "systolic_bp":      ("Systolic",   "mmHg"),
    "diastolic_bp":     ("Diastolic",  "mmHg"),
}

SIMPLE_LABELS = {
    "stress": ("Anxiety & Stress", "Elevates heart rate and blood pressure."),
    "oxygenation": ("Lung Function", "Drives SpO2. Low function triggers breathing rate increases."),
    "cardiac_output": ("Heart Strength", "Drives blood pressure. Low strength triggers rapid, weak heartbeats."),
    "perfusion": ("Blood Circulation", "Peripheral blood flow. Affects SpO2 accuracy and diastolic pressure."),
    "pain": ("Pain Level", "Increases stress-related vitals (HR, BP).")
}

CONFIG_FILE = "simulator_config.json"

def load_bed_mapping():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading config: {e}")
    return {}

def save_bed_mapping(mapping):
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(mapping, f, indent=4)
    except Exception as e:
        print(f"Error saving config: {e}")

class SimulatorApp:
    def __init__(self, root: ttkb.Window):
        self.root = root
        self.root.title("RPM Advanced Simulator")
        self.root.geometry("1400x900")
        
        # ── State ─────────────────────────────────────
        self.publisher = None
        self.threads = {}
        self.vital_widgets = {}
        self.progression_meters = {}
        
        # State management
        self.active_state = {}
        self.active_scenario = {}
        self.running = {}
        self.custom_pid_vars = {}
        self.bed_mapping = load_bed_mapping()
        
        self.vital_generators = {}
        self.ecg_generators = {}
        
        self.custom_pid_var = tk.StringVar(value="PD_XXXXX")
        
        self._build_ui()
        self._connect_mqtt()

    def _build_ui(self):
        # ── Sidebar ──
        sidebar = ttkb.Frame(self.root, width=250, bootstyle="dark", padding=15)
        sidebar.pack(side="left", fill="y")
        
        ttkb.Label(sidebar, text="🏥 RPM Simulator", font=("Segoe UI", 16, "bold"), bootstyle="inverse-dark").pack(pady=(0, 20))
        
        self.status_label = ttkb.Label(sidebar, text="● Connecting...", font=("Segoe UI", 10, "bold"), bootstyle="warning")
        self.status_label.pack(anchor="w", padx=20, pady=10)
        
        ttkb.Button(sidebar, text="⏹ STOP ALL", bootstyle="danger", command=self._stop_all).pack(fill=tk.X, padx=20, pady=10, ipady=5)

        # ── Main Content Area ──
        main_area = ttkb.Frame(self.root)
        main_area.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        canvas = tk.Canvas(main_area, bg=self.root.style.colors.bg, highlightthickness=0)
        scrollbar = ttkb.Scrollbar(main_area, orient="vertical", command=canvas.yview)
        
        self.scrollable_frame = ttkb.Frame(canvas)
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw", width=canvas.winfo_reqwidth())
        
        def _configure_canvas_width(event):
            canvas.itemconfig(canvas.find_withtag("all")[0], width=event.width)
        canvas.bind("<Configure>", _configure_canvas_width)

        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True, padx=20, pady=20)
        scrollbar.pack(side="right", fill="y")
        
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1*(event.delta/120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)

        for i in range(1, 6):
            pid = f"bed_{i}"
            self.active_state[pid] = SCENARIOS["Normal"].copy()
            self.active_scenario[pid] = "Normal"
            self.vital_generators[pid] = VitalGenerator()
            self.ecg_generators[pid] = EcgGenerator()
            self._build_patient_card(pid, {
                "name": f"Bed {i}", 
                "age": "--", 
                "condition": "Select Patient ID",
                "base_state": SCENARIOS["Normal"].copy()
            })

    def _build_patient_card(self, pid: str, patient: dict):
        # Card container
        card = ttkb.Frame(self.scrollable_frame, bootstyle="secondary")
        card.pack(fill=tk.X, pady=(0, 20), ipadx=2, ipady=2) # subtle border effect
        
        inner_card = ttkb.Frame(card, padding=20)
        inner_card.pack(fill=tk.BOTH, expand=True)

        # ── Header ──
        header = ttkb.Frame(inner_card)
        header.pack(fill=tk.X, pady=(0, 15))
        
        ttkb.Label(header, text=patient["name"], font=("Segoe UI", 14, "bold"), bootstyle="primary").pack(side=tk.LEFT, padx=(0, 20))
        ttkb.Label(header, text="Target Patient ID:", font=("Segoe UI", 12, "bold")).pack(side=tk.LEFT)
        
        saved_pid = self.bed_mapping.get(pid, "")
        pid_var = tk.StringVar(value=saved_pid)
        self.custom_pid_vars[pid] = pid_var
        
        def on_pid_change(*args):
            self.bed_mapping[pid] = pid_var.get().strip()
            save_bed_mapping(self.bed_mapping)
            
        pid_var.trace_add("write", on_pid_change)
        
        entry = ttkb.Entry(header, textvariable=pid_var, font=("Consolas", 14, "bold"), width=15)
        entry.pack(side=tk.LEFT, padx=10)
        
        ttkb.Button(header, text="▶ Start", bootstyle="outline-success", command=lambda p=pid: self._start_patient(p)).pack(side=tk.RIGHT, padx=5)
        ttkb.Button(header, text="⏹ Stop", bootstyle="outline-danger", command=lambda p=pid: self._stop_patient(p)).pack(side=tk.RIGHT, padx=5)

        # ── 3-Column Grid Layout ──
        grid_frame = ttkb.Frame(inner_card)
        grid_frame.pack(fill=tk.X)
        grid_frame.columnconfigure(0, weight=1)
        grid_frame.columnconfigure(1, weight=3)
        grid_frame.columnconfigure(2, weight=2)
        
        # == Left: Cause (Scenario) ==
        left_pane = ttkb.Frame(grid_frame)
        left_pane.grid(row=0, column=0, sticky="nsew", padx=(0, 20))
        
        ttkb.Label(left_pane, text="CLINICAL SCENARIO", font=("Segoe UI", 9, "bold"), bootstyle="secondary").pack(anchor="w", pady=(0, 5))
        
        scen_var = tk.StringVar(value=self.active_scenario[pid])
        cb = ttkb.Combobox(left_pane, textvariable=scen_var, values=list(SCENARIOS.keys()), state="readonly")
        cb.pack(fill=tk.X, pady=(0, 15))
        
        def on_scenario_change(event, p=pid, var=scen_var):
            self.active_scenario[p] = var.get()

        cb.bind("<<ComboboxSelected>>", on_scenario_change)
        
        meter = ttkb.Meter(left_pane, metersize=130, padding=5, amounttotal=100, 
                           amountused=100, metertype="full", 
                           subtext="Progression", interactive=False, bootstyle="info")
        meter.pack(pady=5)
        self.progression_meters[pid] = meter

        # == Center: Effect (State Sliders) ==
        center_pane = ttkb.Frame(grid_frame)
        center_pane.grid(row=0, column=1, sticky="nsew", padx=(0, 20))
        
        state_vars = ["stress", "oxygenation", "cardiac_output", "perfusion", "pain"]
        self.active_state[pid]["_tk_vars"] = {}
        
        for i, var_name in enumerate(state_vars):
            sf = ttkb.Frame(center_pane)
            sf.pack(fill=tk.X, pady=4)
            
            friendly_name, tip_text = SIMPLE_LABELS.get(var_name, (var_name, ""))
            
            lbl = ttkb.Label(sf, text=friendly_name.upper(), font=("Segoe UI", 9, "bold"), bootstyle="secondary", width=20)
            lbl.pack(side=tk.LEFT)
            ToolTip(lbl, text=tip_text, bootstyle="info")
            
            tk_val = tk.DoubleVar(value=patient["base_state"].get(var_name, 0.0))
            self.active_state[pid]["_tk_vars"][var_name] = tk_val
            
            def update_lbl(val, v=var_name, p=pid):
                self.active_state[p][v] = float(val)
                self._update_progression(p)

            scale = ttkb.Scale(sf, from_=0.0, to=1.0, orient="horizontal", variable=tk_val, bootstyle="info", command=update_lbl)
            scale.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=10)
            
            val_lbl = ttkb.Label(sf, textvariable=tk_val, width=4)
            val_lbl.pack(side=tk.RIGHT)

        # == Right: Result (Vitals) ==
        right_pane = ttkb.Frame(grid_frame)
        right_pane.grid(row=0, column=2, sticky="nsew")
        
        self.vital_widgets[pid] = {}
        
        for idx, (key, (label, unit)) in enumerate(VITAL_LABELS.items()):
            r = idx // 2
            c = idx % 2
            
            vf = ttkb.Frame(right_pane, padding=5)
            vf.grid(row=r, column=c, sticky="nsew", padx=5, pady=5)
            right_pane.columnconfigure(c, weight=1)
            
            top_vf = ttkb.Frame(vf)
            top_vf.pack(fill=tk.X)
            
            indicator = tk.Canvas(top_vf, width=12, height=12, bg=self.root.style.colors.bg, highlightthickness=0)
            indicator.create_oval(1, 1, 11, 11, fill=self.root.style.colors.secondary, outline="")
            indicator.pack(side=tk.LEFT, pady=(2,0))
            
            ttkb.Label(top_vf, text=label, font=("Segoe UI", 10), bootstyle="secondary").pack(side=tk.LEFT, padx=(5,0))
            
            val_frame = ttkb.Frame(vf)
            val_frame.pack(anchor="w")
            
            value_label = ttkb.Label(val_frame, text="--", font=("Consolas", 24, "bold"))
            value_label.pack(side=tk.LEFT)
            
            ttkb.Label(val_frame, text=unit, font=("Segoe UI", 9), bootstyle="secondary").pack(side=tk.BOTTOM, padx=(5,0), pady=(0, 4))
            
            self.vital_widgets[pid][key] = (value_label, indicator)
            
        self.running[pid] = False

    def _update_progression(self, pid: str):
        target = SCENARIOS.get(self.active_scenario[pid], {})
        match = DiseaseEngine.calculate_progression(self.active_state[pid], target)
        pct = int(match * 100)
        self.progression_meters[pid].configure(amountused=pct)
        
        if pct >= 95:
            self.progression_meters[pid].configure(bootstyle="danger")
        elif pct > 50:
            self.progression_meters[pid].configure(bootstyle="warning")
        else:
            self.progression_meters[pid].configure(bootstyle="info")

    def _connect_mqtt(self):
        self.publisher = MQTTPublisher(SESSION_ID)
        self.publisher.connect()
        self.root.after(1000, self._check_mqtt_status)

    def _check_mqtt_status(self):
        if self.publisher and self.publisher.is_connected:
            self.status_label.config(text="● CONNECTED", bootstyle="success")
        else:
            self.status_label.config(text="● DISCONNECTED", bootstyle="danger")
        self.root.after(3000, self._check_mqtt_status)

    def _start_patient(self, pid: str):
        target_pid = self.custom_pid_vars[pid].get().strip()
        if not target_pid:
            print(f"Please enter a Target Patient ID for {pid}!")
            return
            
        if self.running.get(pid): return
        self.running[pid] = True
        t = threading.Thread(target=self._simulation_loop, args=(pid,), daemon=True)
        self.threads[pid] = t
        t.start()

    def _stop_patient(self, pid: str):
        self.running[pid] = False

    def _stop_all(self):
        for pid in list(self.running.keys()):
            self._stop_patient(pid)

    def _simulation_loop(self, pid: str):
        vital_gen = self.vital_generators[pid]
        ecg_gen = self.ecg_generators[pid]
        
        while self.running.get(pid, False):
            current = {k: v for k, v in self.active_state[pid].items() if k != "_tk_vars"}
            target = SCENARIOS.get(self.active_scenario[pid], {})
            
            new_state = DiseaseEngine.step_towards_target(current, target, step_size=0.05)
            
            def update_sliders():
                for k, v in new_state.items():
                    self.active_state[pid][k] = v
                    if k in self.active_state[pid]["_tk_vars"]:
                        self.active_state[pid]["_tk_vars"][k].set(round(v, 2))
                self._update_progression(pid)
            self.root.after(0, update_sliders)

            ideal_vitals = PhysiologyEngine.compute_vitals(new_state)
            raw_vitals = vital_gen.next(ideal_vitals)
            final_vitals = NoiseGenerator.apply_noise(raw_vitals)

            ecg_data = ecg_gen.generate(final_vitals.get("heart_rate", 70), new_state)

            if self.publisher and self.publisher.is_connected:
                target_pid = self.custom_pid_vars[pid].get().strip()
                self.publisher.publish_vitals(target_pid, final_vitals)
                self.publisher.publish_ecg(target_pid, ecg_data)

            self.root.after(0, self._update_ui, pid, final_vitals)
            time.sleep(2)

    def _update_ui(self, pid: str, vitals: dict):
        if pid not in self.vital_widgets: return
        for key, value in vitals.items():
            if key not in self.vital_widgets[pid]: continue
            value_label, indicator = self.vital_widgets[pid][key]

            if key == "temperature":
                value_label.config(text=f"{value:.1f}")
            else:
                value_label.config(text=str(value))

            status = vital_status(key, value)
            # Fetch the actual hex color from the active theme
            color_hex = self.root.style.colors.get(status)
            if not color_hex:
                color_hex = "#ffffff"
            indicator.delete("all")
            indicator.create_oval(1, 1, 11, 11, fill=color_hex, outline="")

    def on_close(self):
        self._stop_all()
        if self.publisher: self.publisher.disconnect()
        self.root.destroy()

def main():
    # Apply cyborg theme for a sleek, dark, high-contrast look
    app_window = ttkb.Window(themename="cyborg")
    app = SimulatorApp(app_window)
    app_window.protocol("WM_DELETE_WINDOW", app.on_close)
    app_window.mainloop()

if __name__ == "__main__":
    main()
