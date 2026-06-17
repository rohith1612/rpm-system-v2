import random
import math
import copy

class DiseaseEngine:
    """Calculates scenario matching and progression."""
    
    @staticmethod
    def step_towards_target(current_state: dict, scenario_target: dict, step_size: float = 0.05) -> dict:
        """Gradually interpolates current state towards the scenario target."""
        if not scenario_target:
            return current_state
            
        new_state = {}
        all_keys = set(current_state.keys()).union(set(scenario_target.keys()))
        for key in all_keys:
            current_val = current_state.get(key, 0.0)
            if key in scenario_target:
                target_val = scenario_target[key]
                diff = target_val - current_val
                
                # Move towards target by step_size, but don't overshoot
                if abs(diff) <= step_size:
                    new_state[key] = target_val
                else:
                    new_state[key] = current_val + math.copysign(step_size, diff)
            else:
                new_state[key] = current_val
        return new_state

    @staticmethod
    def calculate_progression(current_state: dict, scenario_target: dict) -> float:
        """Calculates how closely the current state matches the scenario target (0.0 to 1.0)."""
        if not scenario_target:
            return 0.0
            
        total_diff = 0.0
        keys = ["stress", "oxygenation", "cardiac_output", "perfusion", "pain", "dead"]
        for key in keys:
            current = current_state.get(key, 0.0)
            target = scenario_target.get(key, 0.0)
            total_diff += abs(current - target)
            
        # Max possible diff across 5 variables is 5.0
        # A perfectly matching state has 0 diff.
        match_score = 1.0 - (total_diff / len(keys))
        return max(0.0, match_score)

class PhysiologyEngine:
    """Converts a normalized patient state (0.0 to 1.0) into ideal baseline vitals."""
    
    # Base ideal human values
    BASE_HR = 70
    BASE_SPO2 = 98
    BASE_RR = 14
    BASE_SYS = 120
    BASE_DIA = 80
    BASE_TEMP = 36.8

    @classmethod
    def compute_vitals(cls, state: dict) -> dict:
        stress = state.get("stress", 0.0)
        oxy = state.get("oxygenation", 1.0)
        co = state.get("cardiac_output", 1.0)
        perf = state.get("perfusion", 1.0)
        pain = state.get("pain", 0.0)
        is_dead = state.get("dead", 0.0) >= 0.5

        if is_dead:
            return {
                "heart_rate": {"mean": 0, "std": 0},
                "spo2": {"mean": 0, "std": 0},
                "respiratory_rate": {"mean": 0, "std": 0},
                "systolic_bp": {"mean": 0, "std": 0},
                "diastolic_bp": {"mean": 0, "std": 0},
                "temperature": {"mean": 35.0, "std": 0},
            }

        # Heart Rate: Increases with stress, pain. Compensates for low oxygenation or low CO.
        hr = cls.BASE_HR + (stress * 40) + (pain * 20) + ((1.0 - oxy) * 30) + ((1.0 - co) * 20)
        
        # SpO2: Directly related to oxygenation and perfusion. Drops sharply if oxy is low.
        spo2 = cls.BASE_SPO2 - ((1.0 - oxy) * 25) - ((1.0 - perf) * 5)
        
        # Respiratory Rate: Increases with stress, pain, and hypoxia
        rr = cls.BASE_RR + (stress * 10) + (pain * 5) + ((1.0 - oxy) * 15)
        
        # Blood Pressure: 
        # Systolic increases with stress/pain, decreases with low CO/perfusion
        sys_bp = cls.BASE_SYS + (stress * 30) + (pain * 20) - ((1.0 - co) * 40)
        # Diastolic follows systolic loosely but tighter range
        dia_bp = cls.BASE_DIA + (stress * 15) + (pain * 10) - ((1.0 - co) * 20)
        
        # Temperature: Slight increase with stress/pain
        temp = cls.BASE_TEMP + (stress * 1.5)

        return {
            "heart_rate": {"mean": hr, "std": 3 + (stress * 5)},
            "spo2": {"mean": spo2, "std": 1 + ((1.0 - oxy) * 3)},
            "respiratory_rate": {"mean": rr, "std": 1 + (stress * 2)},
            "systolic_bp": {"mean": sys_bp, "std": 5 + (stress * 5)},
            "diastolic_bp": {"mean": dia_bp, "std": 3 + (stress * 3)},
            "temperature": {"mean": temp, "std": 0.1 + (stress * 0.2)},
        }

class VitalGenerator:
    """Generates continuous vital signs with physiological momentum."""
    
    def __init__(self):
        self._current = {}
        self._momentum = {}

    def next(self, ideal_baselines: dict) -> dict:
        result = {}
        for key, cfg in ideal_baselines.items():
            mean = cfg["mean"]
            std = cfg["std"]

            if key not in self._current:
                self._current[key] = mean
                self._momentum[key] = 0.0

            value = self._current[key]

            # Mean-reverting random walk
            reversion = (mean - value) * 0.1  # Pull towards mean
            noise = random.gauss(0, std * 0.4)
            momentum_contrib = self._momentum[key] * std * 0.2

            value += reversion + noise + momentum_contrib

            # Update momentum
            self._momentum[key] = self._momentum[key] * 0.6 + (noise / (std * 0.4 + 0.001)) * 0.4

            # Ensure physiologic bounds
            if key == "spo2":
                value = min(100.0, max(0.0, value))
            if key == "heart_rate":
                if mean <= 0:
                    value = 0.0
                else:
                    value = max(20.0, value)

            self._current[key] = value
            result[key] = value

        return result

class NoiseGenerator:
    """Simulates sensor noise and artifacts."""
    
    @staticmethod
    def apply_noise(vitals: dict) -> dict:
        noisy = {}
        for key, val in vitals.items():
            if val <= 0 and key != "temperature":
                noisy[key] = 0
                continue
            if key == "temperature":
                noisy[key] = round(val + random.uniform(-0.1, 0.1), 1)
            elif key == "spo2":
                # Smooth, small SpO2 sensor noise — no aggressive dropouts
                noisy[key] = round(max(0, min(100, val + random.uniform(-0.5, 0.5))))
            else:
                noisy[key] = round(val + random.uniform(-0.5, 0.5))
        return noisy


class EcgGenerator:
    """Generates medically modeled ECG interval parameters.
    
    Based on standard cardiology:
    - RR interval = 60 / HR
    - PR interval: ~120-200ms, slightly inversely proportional to HR
    - QRS duration: ~80-100ms, widens with low cardiac output
    - QT interval: Inversely proportional to HR (Bazett's)
    - QTc: Bazett's corrected QT = QT / sqrt(RR)
    - ST offset: Normally 0, elevated in ischemia
    """

    def __init__(self):
        self._pr_jitter = 0.0
        self._qrs_jitter = 0.0

    def generate(self, heart_rate: float, patient_state: dict) -> dict:
        """Produce one set of ECG parameters from the current HR and patient state."""
        is_dead = patient_state.get("dead", 0.0) >= 0.5
        if is_dead or heart_rate <= 0:
            return {
                "heart_rate": 0,
                "pr_interval": 0,
                "qrs_duration": 0,
                "qt_interval": 0,
                "qtc_interval": 0,
                "st_offset": 0,
                "rhythm": "Asystole",
            }
            
        hr = max(30, min(220, heart_rate))  # clamp to physiologic range
        rr_sec = 60.0 / hr

        stress = patient_state.get("stress", 0.0)
        oxy = patient_state.get("oxygenation", 1.0)
        co = patient_state.get("cardiac_output", 1.0)
        pain = patient_state.get("pain", 0.0)

        # PR interval (seconds): baseline ~0.16s, faster HR → slightly shorter
        pr_base = 0.16 - (hr - 70) * 0.0003
        pr_base = max(0.12, min(0.20, pr_base))
        self._pr_jitter = self._pr_jitter * 0.7 + random.gauss(0, 0.003) * 0.3
        pr_interval = round(pr_base + self._pr_jitter, 3)

        # QRS duration (seconds): baseline ~0.09s, widens if CO is very low
        qrs_base = 0.09 + (1.0 - co) * 0.03
        qrs_base = max(0.06, min(0.12, qrs_base))
        self._qrs_jitter = self._qrs_jitter * 0.7 + random.gauss(0, 0.002) * 0.3
        qrs_duration = round(qrs_base + self._qrs_jitter, 3)

        # QT interval (seconds): Bazett baseline ≈ 0.37 * sqrt(RR)
        qt_base = 0.37 * math.sqrt(rr_sec)
        qt_variation = random.gauss(0, 0.005)
        qt_interval = round(max(0.30, min(0.50, qt_base + qt_variation)), 3)

        # QTc (Bazett's formula): QTc = QT / sqrt(RR)
        qtc_interval = round(qt_interval / math.sqrt(rr_sec), 3) if rr_sec > 0 else qt_interval

        # ST offset (mV): normally ~0, elevated with low oxygenation (ischemia)
        st_base = (1.0 - oxy) * 0.25 + stress * 0.05
        st_offset = round(st_base + random.gauss(0, 0.02), 2)

        # Rhythm classification
        if hr < 60:
            rhythm = "Sinus Bradycardia"
        elif hr > 100:
            rhythm = "Sinus Tachycardia"
        else:
            rhythm = "Normal Sinus Rhythm"

        return {
            "heart_rate": round(hr),
            "pr_interval": pr_interval,
            "qrs_duration": qrs_duration,
            "qt_interval": qt_interval,
            "qtc_interval": qtc_interval,
            "st_offset": st_offset,
            "rhythm": rhythm,
        }
