"""
Realistic vital sign generator with smooth trends, occasional acute events,
and recovery patterns — modelled per-patient profile.
"""
import random
import math


class VitalGenerator:
    """
    Generates a continuous stream of physiologically plausible vital signs
    for a single patient, based on their profile baselines.
    """

    def __init__(self, baselines: dict):
        self._baselines = baselines
        # Current values start at mean
        self._current = {
            key: cfg["mean"] for key, cfg in baselines.items()
        }
        # Trend momentum (-1 to 1) for smoother transitions
        self._momentum = {key: 0.0 for key in baselines}
        # Ticks since start (for circadian-like drift)
        self._tick = 0
        # Active acute event countdown per vital (0 = none)
        self._event_remaining = {key: 0 for key in baselines}
        self._event_direction = {key: 0 for key in baselines}

    def next(self) -> dict:
        """Generate the next set of vital readings."""
        self._tick += 1
        result = {}

        for key, cfg in self._baselines.items():
            value = self._current[key]
            mean = cfg["mean"]
            std = cfg["std"]
            vmin = cfg["min"]
            vmax = cfg["max"]

            # ── Acute event handling ──────────────────
            if self._event_remaining[key] > 0:
                # During event: push value in event direction
                push = self._event_direction[key] * std * 0.6
                value += push
                self._event_remaining[key] -= 1
            else:
                # ── Chance to trigger an acute event (3%) ─
                if random.random() < 0.03:
                    self._event_remaining[key] = random.randint(5, 15)
                    self._event_direction[key] = random.choice([-1, 1])

                # ── Normal fluctuation ────────────────────
                # Mean-reverting random walk
                reversion = (mean - value) * 0.05
                noise = random.gauss(0, std * 0.3)
                momentum_contrib = self._momentum[key] * std * 0.15

                value += reversion + noise + momentum_contrib

                # Update momentum with decay
                self._momentum[key] = (
                    self._momentum[key] * 0.7
                    + (noise / (std * 0.3 + 0.001)) * 0.3
                )

            # ── Recovery pressure at extremes ─────────
            if value > mean + 2 * std:
                value -= random.uniform(0, std * 0.3)
            elif value < mean - 2 * std:
                value += random.uniform(0, std * 0.3)

            # ── Clamp to physiological bounds ─────────
            value = max(vmin, min(vmax, value))

            # ── Round appropriately ───────────────────
            if key == "temperature":
                value = round(value, 1)
            elif key in ("spo2",):
                value = round(min(100, value))  # SpO2 can't exceed 100
            else:
                value = round(value)

            self._current[key] = value
            result[key] = value

        return result
