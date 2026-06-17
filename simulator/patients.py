"""
Patient profiles for the vital signs simulator.
Each profile defines a patient's demographics, condition, and base state.
"""

SCENARIOS = {
    "Normal": {
        "stress": 0.2, "oxygenation": 0.98, "cardiac_output": 0.9, "perfusion": 0.95, "pain": 0.1
    },
    "Sepsis": {
        "stress": 0.8, "oxygenation": 0.85, "cardiac_output": 0.6, "perfusion": 0.5, "pain": 0.6
    },
    "Hypoxia / COPD Exacerbation": {
        "stress": 0.7, "oxygenation": 0.75, "cardiac_output": 0.85, "perfusion": 0.8, "pain": 0.4
    },
    "Hemorrhage": {
        "stress": 0.9, "oxygenation": 0.9, "cardiac_output": 0.4, "perfusion": 0.3, "pain": 0.7
    },
    "Pain Crisis": {
        "stress": 0.85, "oxygenation": 0.98, "cardiac_output": 0.95, "perfusion": 0.95, "pain": 0.95
    },
    "Dead": {
        "stress": 0.0, "oxygenation": 0.0, "cardiac_output": 0.0, "perfusion": 0.0, "pain": 0.0, "dead": 1.0
    }
}
