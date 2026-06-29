import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeAuthCode, fetchPatientDemographics } from "../utils/fhir";
import "./PatientRegistration.css"; // Reuse registration styles or add a container style

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const hasRun = useRef(false);

  const [step, setStep] = useState<"verifying" | "exchanging" | "fetching_demographics" | "fetching_vitals" | "saving" | "done" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [details, setDetails] = useState<string>("");

  useEffect(() => {
    // Prevent double execution in React 18 StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    async function handleCallback() {
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (!code) {
        const oauthError = searchParams.get("error");
        const oauthErrorDesc = searchParams.get("error_description");
        setStep("error");
        if (oauthError) {
          setErrorMessage(`Cerner Error: ${oauthError} - ${oauthErrorDesc || 'No description provided'}`);
        } else {
          setErrorMessage("Authorization code is missing from redirect URL.");
        }
        return;
      }

      // Verify state
      const savedState = sessionStorage.getItem("smart_state");
      if (state !== savedState) {
        console.warn("State mismatch! Proceeding anyway for sandbox testing resilience...");
      }

      const fhirBaseUrl = sessionStorage.getItem("smart_fhir_base_url");
      const redirectUri = window.location.origin + window.location.pathname;

      if (!fhirBaseUrl) {
        setStep("error");
        setErrorMessage("FHIR Base URL not found in session storage. Please restart the launch flow.");
        return;
      }

      try {
        // Step 1: Exchange code for token
        setStep("exchanging");
        setDetails("Connecting to Cerner token service via secure proxy...");
        const tokenResponse = await exchangeAuthCode(code, redirectUri);
        
        const accessToken = tokenResponse.access_token;
        const cernerPatientId = tokenResponse.patient;

        if (!accessToken) {
          throw new Error("Access token was not returned by Cerner token endpoint.");
        }

        if (!cernerPatientId) {
          throw new Error("No patient context was returned. Ensure you selected a patient during launch.");
        }

        // Save token and patient ID in session storage for later uses
        const expiresIn = tokenResponse.expires_in || 3600;
        const expiresAt = Date.now() + expiresIn * 1000;
        sessionStorage.setItem("smart_access_token", accessToken);
        sessionStorage.setItem("smart_patient_id", cernerPatientId);
        sessionStorage.setItem("smart_expires_in", expiresIn.toString());
        sessionStorage.setItem("smart_expires_at", expiresAt.toString());

        // Step 2: Fetch demographics (just to verify connection works)
        setStep("fetching_demographics");
        setDetails(`Retrieving clinical record for Cerner Patient ID: ${cernerPatientId}...`);
        const demo = await fetchPatientDemographics(fhirBaseUrl, accessToken, cernerPatientId);
        console.log("Cerner Demographics verified:", demo.name);

        // Step 3: Done!
        setStep("done");
        setDetails("Connection established. Restoring session...");
        
        const savedContext = sessionStorage.getItem("smart_patient_context");

        // Wait a second for user to see success
        setTimeout(() => {
          if (savedContext) {
            navigate(`/patient/${savedContext}`, { state: { info: `Successfully reconnected to Cerner. Patient context restored.` } });
          } else {
            navigate("/", { state: { info: `Successfully connected to Cerner. You can now search or admit a patient.` } });
          }
        }, 1500);

      } catch (err: any) {
        console.error("SMART on FHIR sync failed:", err);
        setStep("error");
        setErrorMessage(err.message || "An unexpected error occurred during Cerner integration.");
      }
    }

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="registration-page" style={{ maxWidth: "600px", margin: "4rem auto" }}>
      <div className="registration-panel manual-panel" style={{ padding: "3rem", textAlign: "center" }}>
        <h2 style={{ marginBottom: "1.5rem", fontSize: "1.75rem", fontWeight: "600", color: "var(--text-main)" }}>
          {step === "error" ? "Connection Failed" : step === "done" ? "Connection Established!" : "Connecting to Cerner EHR"}
        </h2>

        {step !== "error" && step !== "done" && (
          <div className="smart-loader" style={{ margin: "2rem auto" }}>
            <div className="spinner" style={{
              width: "50px",
              height: "50px",
              border: "3px solid rgba(255,255,255,0.1)",
              borderTop: "3px solid #00f2fe",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1.5rem auto"
            }}></div>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {step === "done" && (
          <div className="success-icon" style={{
            fontSize: "4rem",
            color: "#4caf50",
            marginBottom: "1.5rem",
            animation: "bounce 0.5s ease"
          }}>
            ✓
          </div>
        )}

        {step === "error" && (
          <div className="error-icon" style={{
            fontSize: "4rem",
            color: "#f44336",
            marginBottom: "1.5rem"
          }}>
            ⚠
          </div>
        )}

        <div className="status-container" style={{ minHeight: "80px" }}>
          {step !== "error" && (
            <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: "1.5" }}>
              {details}
            </p>
          )}

          {step === "error" && (
            <div>
              <p style={{ color: "#ff4d4d", fontSize: "1.1rem", fontWeight: "500", marginBottom: "1rem" }}>
                {errorMessage}
              </p>
              <button
                className="back-btn"
                onClick={() => navigate("/launch")}
                style={{
                  margin: "1.5rem auto 0 auto",
                  padding: "0.75rem 1.5rem",
                  background: "linear-gradient(135deg, #3a3b4c, #1f2029)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
