import { useEffect, useState } from "react";
import { initiateSmartLaunch } from "../utils/fhir";

export default function Launch() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressMsg, setProgressMsg] = useState("Connecting securely to the Cerner EHR Sandbox...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const iss = params.get("iss") || sessionStorage.getItem("smart_iss");
    const launch = params.get("launch") || sessionStorage.getItem("smart_launch");
    const autoLaunch = sessionStorage.getItem("smart_auto_launch") === "true";

    // If we have EHR launch parameters, OR if we have autoLaunch flag set
    if ((iss && launch) || autoLaunch) {
      setError(null);
      setLoading(true);
      initiateSmartLaunch((msg) => setProgressMsg(msg)).catch((err: any) => {
        console.error("SMART launch redirect failed:", err);
        setError(err.message || "Failed to initiate SMART on FHIR launch.");
        setLoading(false);
      });
    } else {
      // Otherwise, stop loading and show the premium manual launch card
      setLoading(false);
    }
  }, []);

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try {
      await initiateSmartLaunch((msg) => setProgressMsg(msg));
    } catch (err: any) {
      console.error("SMART launch redirect failed:", err);
      setError(err.message || "Failed to initiate SMART on FHIR launch.");
      setLoading(false);
    }
  };

  const handleDemoLaunch = () => {
    setLoading(true);
    setError(null);
    try {
      const mockExpiresIn = 3600;
      const mockExpiresAt = Date.now() + mockExpiresIn * 1000;
      
      sessionStorage.setItem("smart_access_token", "mock_offline_demo_token");
      sessionStorage.setItem("smart_patient_id", "12724066");
      sessionStorage.setItem("smart_fhir_base_url", "https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d");
      sessionStorage.setItem("smart_expires_in", mockExpiresIn.toString());
      sessionStorage.setItem("smart_expires_at", mockExpiresAt.toString());
      
      // Clear any auto-launch reconnect flags
      sessionStorage.removeItem("smart_auto_launch");
      
      // Navigate to root Bed Dashboard
      window.location.href = "/";
    } catch (err: any) {
      console.error("Demo launch failed:", err);
      setError(err.message || "Failed to initiate Demo context.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
        fontFamily: "var(--font-sans)"
      }}>
        <div style={{
          width: "50px",
          height: "50px",
          border: "3px solid rgba(118, 171, 174, 0.1)",
          borderTop: "3px solid var(--blue-600)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          marginBottom: "1.5rem"
        }}></div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: "600", color: "var(--blue-900)", marginBottom: "0.5rem" }}>
          Initiating SMART Launch...
        </h2>
        <p style={{ color: "var(--slate-500)", fontSize: "0.95rem" }}>
          {progressMsg}
        </p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }


  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "linear-gradient(135deg, #eef2f6 0%, #e2e8f0 100%)",
      fontFamily: "var(--font-sans)",
      padding: "20px"
    }}>
      <div className="glass-card" style={{
        maxWidth: "500px",
        width: "100%",
        padding: "2.5rem",
        borderRadius: "var(--radius-md)",
        textAlign: "center",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--glass-border)"
      }}>
        <div style={{
          background: "rgba(118, 171, 174, 0.1)",
          color: "var(--blue-600)",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem auto",
          fontSize: "1.75rem",
          fontWeight: "bold"
        }}>
          C
        </div>
        <h2 style={{ fontSize: "1.75rem", fontWeight: "600", color: "var(--blue-900)", marginBottom: "0.75rem" }}>
          Cerner SMART on FHIR
        </h2>
        <p style={{ color: "var(--slate-500)", fontSize: "0.95rem", marginBottom: "2rem", lineHeight: "1.6" }}>
          Welcome to the Remote Patient Monitoring System. Connect securely to the Cerner EHR Sandbox to access your workspace.
        </p>

        {error && (
          <div style={{
            background: "#fdf2f2",
            border: "1px solid #fde8e8",
            borderRadius: "var(--radius-sm)",
            padding: "1rem",
            color: "#9b1c1c",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
            textAlign: "left"
          }}>
            <strong>Launch Error:</strong> {error}
          </div>
        )}

        <button
          onClick={handleLaunch}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, var(--blue-600) 0%, var(--blue-700) 100%)",
            border: "none",
            color: "#fff",
            fontWeight: "600",
            padding: "0.85rem",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(118, 171, 174, 0.3)",
            transition: "transform 0.2s, box-shadow 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(118, 171, 174, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 15px rgba(118, 171, 174, 0.3)";
          }}
        >
          Connect to Cerner Sandbox
        </button>

        <button
          onClick={handleDemoLaunch}
          style={{
            width: "100%",
            background: "linear-gradient(135deg, var(--slate-700) 0%, var(--slate-800) 100%)",
            border: "none",
            color: "#fff",
            fontWeight: "600",
            padding: "0.85rem",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            marginTop: "12px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            transition: "transform 0.2s, box-shadow 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 6px 15px rgba(0, 0, 0, 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
          }}
        >
          Launch Offline Demo (Bypass Cerner)
        </button>
      </div>
    </div>
  );
}
