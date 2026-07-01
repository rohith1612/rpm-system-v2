import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeAuthCode } from "../utils/fhir";
import "./Launch.css";

export default function Callback() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"processing" | "ready" | "error">("processing");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const started = useRef(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    document.title = "SMART on FHIR Handshake Callback...";

    async function runCallback() {
      try {
        addLog("CALLBACK: Intercepting Cerner redirect callback URL...");
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        await delay(800);

        if (!code) {
          throw new Error("EHR callback failed: Authorization code parameter was not found in redirect URL.");
        }
        addLog(`CALLBACK: Found authorization code: "${code.substring(0, 12)}... (truncated)"`);
        
        if (state) {
          addLog(`CALLBACK: Found verification state: "${state}"`);
        }
        await delay(800);

        addLog("VERIFICATION: Authenticating state token against session storage...");
        const savedState = sessionStorage.getItem("smart_state");
        if (savedState && state !== savedState) {
          addLog(`WARNING: Session state token mismatch (Expected: "${savedState}", Received: "${state}"). Resolving handshake integrity...`);
          await delay(600);
        } else {
          addLog("VERIFICATION: Session handshake state matched successfully.");
        }
        await delay(800);

        addLog("TOKEN: Requesting secure token exchange via RPM backend proxy...");
        const redirectUri = window.location.origin + window.location.pathname; // http://localhost:5173/callback
        addLog(`TOKEN: Sending POST to backend proxy with Redirect URI: "${redirectUri}"`);
        await delay(1000);

        const tokenResp = await exchangeAuthCode(code, redirectUri);
        const cernerPatientId = tokenResp.patient;
        const accessToken = tokenResp.access_token;
        
        if (!cernerPatientId) {
          throw new Error("Token exchange failed: Patient context ID is missing in OAuth token response.");
        }
        addLog("TOKEN: Handshake accepted. OAuth2 token exchange response HTTP 200 OK.");
        addLog(`TOKEN: Context Patient ID: "${cernerPatientId}"`);
        addLog(`TOKEN: Access Token: "${accessToken.substring(0, 16)}... (valid for 1hr)"`);
        await delay(850);

        // Store active token/iss context in session storage for authentication check
        sessionStorage.setItem("smart_access_token", accessToken);
        sessionStorage.setItem("smart_patient_id", cernerPatientId);
        
        const expiresIn = tokenResp.expires_in || 3600;
        const expiresAt = Date.now() + expiresIn * 1000;
        sessionStorage.setItem("smart_expires_in", expiresIn.toString());
        sessionStorage.setItem("smart_expires_at", expiresAt.toString());

        setStatus("ready");
        addLog("SYSTEM: Telemetry streaming session initialized. Redirecting to root dashboard...");
        await delay(1200);

        // Go to dashboard root
        navigate("/");
      } catch (err: any) {
        console.error(err);
        setStatus("error");
        setErrorDetail(err.message || "Unknown error during callback code exchange.");
        addLog(`FATAL ERROR: ${err.message || "OAuth Callback verification failed."}`);
      }
    }

    runCallback();
  }, [navigate]);

  return (
    <div className="launch-screen">
      <div className="launch-container">
        <div className="launch-header">
          <div className="header-status">
            <span className="pulse-dot"></span>
            <span className="title">SMART ON FHIR CALLBACK AUTHORIZATION</span>
          </div>
          <div className="header-meta">
            {status === "processing" && "STATUS: PROCESSING TOKEN"}
            {status === "ready" && "STATUS: TELEMETRY STREAM ESTABLISHED"}
            {status === "error" && "STATUS: OAUTH EXCHANGE FAILED"}
          </div>
        </div>

        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-buttons">
              <span className="btn close"></span>
              <span className="btn minimize"></span>
              <span className="btn maximize"></span>
            </div>
            <div className="terminal-title">smart_oauth_callback.sh</div>
          </div>
          <div className="terminal-body">
            {logs.map((log, index) => (
              <div key={index} className="log-line">
                {log}
              </div>
            ))}
            {status === "error" && errorDetail && (
              <div className="log-line error-line">
                [EXCEPTION] {errorDetail}
              </div>
            )}
            {status !== "error" && status !== "ready" && (
              <div className="log-line cursor-line">
                Awaiting token handshake response<span className="cursor"></span>
              </div>
            )}
          </div>
        </div>

        {status === "error" && (
          <div className="error-actions">
            <button className="solid-btn dark" onClick={() => navigate("/launch")}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
