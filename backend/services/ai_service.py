import os

from groq import Groq

# Use a current, supported Groq model
GROQ_MODEL = "llama-3.3-70b-versatile"


def generate_clinical_insight(patient_data: dict, vitals: list, alerts: list) -> str:
    """
    Generates a clinical insight using the Groq API (Llama 3).
    Formats data crisply to minimize token usage while retaining critical context.
    """
    client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

    if not client.api_key:
        return "⚠️ **Groq API Key missing.** Please set GROQ_API_KEY in the backend `.env` file to enable AI Insights."

    # Efficient Data Summarization
    demographics = f"Age: {patient_data.get('age', 'Unknown')} | Cond: {patient_data.get('condition', 'None')}"

    # Summarize vitals if available (latest snapshot is usually enough)
    vitals_summary = "No recent vitals."
    trend_summary = "No long-term trend data available."
    if vitals:
        # 1. Immediate Context: Latest 5 snapshots
        vitals_desc = sorted(vitals, key=lambda x: x["recorded_at"], reverse=True)
        recent = vitals_desc[:5]
        vitals_str = [
            f"[{v['recorded_at'][11:19]}] HR:{v['heart_rate']} SpO2:{v['spo2']} Temp:{v['temperature']} RR:{v['respiratory_rate']} BP:{v['systolic_bp']}/{v['diastolic_bp']}"
            for v in recent
        ]
        vitals_summary = "\n".join(vitals_str)

        # 2. Long-Term Context: 10-minute trend buckets
        import statistics
        from datetime import datetime, timedelta

        vitals_asc = list(reversed(vitals_desc))
        buckets = []
        current_bucket = []
        if vitals_asc:
            bucket_start = datetime.fromisoformat(vitals_asc[0]["recorded_at"])
            for v in vitals_asc:
                dt = datetime.fromisoformat(v["recorded_at"])
                if dt >= bucket_start + timedelta(minutes=10):
                    if current_bucket:
                        end_dt = datetime.fromisoformat(
                            current_bucket[-1]["recorded_at"]
                        )
                        buckets.append((bucket_start, end_dt, current_bucket))
                    bucket_start = dt
                    current_bucket = [v]
                else:
                    current_bucket.append(v)
            if current_bucket:
                end_dt = datetime.fromisoformat(current_bucket[-1]["recorded_at"])
                buckets.append((bucket_start, end_dt, current_bucket))

        trend_lines = []
        for start_dt, end_dt, b_vitals in buckets:

            def get_stats(key):
                vals = [v[key] for v in b_vitals if v.get(key) is not None]
                if not vals:
                    return "N/A"
                if all(isinstance(x, int) for x in vals) or key in (
                    "heart_rate",
                    "spo2",
                    "respiratory_rate",
                    "systolic_bp",
                    "diastolic_bp",
                ):
                    return f"{int(statistics.mean(vals))} ({int(min(vals))}-{int(max(vals))})"
                return f"{statistics.mean(vals):.1f} ({min(vals):.1f}-{max(vals):.1f})"

            hr = get_stats("heart_rate")
            spo2 = get_stats("spo2")
            rr = get_stats("respiratory_rate")
            sys = get_stats("systolic_bp")
            dia = get_stats("diastolic_bp")

            time_label = f"[{start_dt.strftime('%H:%M')}-{end_dt.strftime('%H:%M')}]"
            trend_lines.append(
                f"{time_label} HR: {hr} | SpO2: {spo2} | RR: {rr} | BP: {sys}/{dia}"
            )

        trend_summary = "\n".join(trend_lines)

    alerts_summary = "No recent alerts."
    if alerts:
        # Top 10 most recent alerts
        alerts_str = [
            f"[{a['created_at'][11:19]}] {a['severity'].upper()}: {a['vital_type']} = {a['value']} ({a['message']})"
            for a in alerts[:10]
        ]
        alerts_summary = "\n".join(alerts_str)

    prompt = f"""You are an expert clinical AI assistant monitoring a patient in real-time.
Review the following patient data and provide a highly structured, actionable clinical insight.

PATIENT: {demographics}

1-HOUR TREND (10-minute Avg with Min-Max range):
{trend_summary}

IMMEDIATE VITALS (Last 5 readings):
{vitals_summary}

RECENT ALERTS (Up to last 10):
{alerts_summary}

INSTRUCTIONS:
1. **Status Assessment**: Provide a comprehensive status overview using standard medical terminology. Explicitly mention the 1-hour trend if there is a gradual deterioration or improvement.
2. **Clinical Reasoning & Potential Causes**: Based strictly on the provided vitals and alerts, list the most likely clinical pathways or potential issues. You MUST explicitly state the *reasoning* for your predictions based on the data provided.
3. **Concerning Trends**: Highlight any critical deviations, active alerts, or dangerous long-term trajectories.
4. **Recommended Next Steps**: Suggest immediate clinical actions, monitoring requirements, or specific labs.
5. Format cleanly using Markdown headers (H3/H4), bullet points, and bold text for readability. Keep it concise but medically accurate to assist a remote doctor.
"""

    try:
        completion = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert clinical AI assistant. Provide highly structured medical insights in raw markdown format.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
        return completion.choices[0].message.content
    except Exception as e:
        return f"⚠️ **AI Generation Failed:** {str(e)}"
