import { useEffect, useState, useRef } from "react";
import { fetchFhirConfig, discoverOauthEndpoints } from "../utils/fhir";
import "./Launch.css";

export default function Launch() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"initializing" | "discovering" | "ready" | "error">("initializing");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [appPov, setAppPov] = useState<"DEV" | "CUS" | null>(null);
  
  const started = useRef(false);
  const appPovRef = useRef<"DEV" | "CUS" | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, appPovRef.current === "CUS" ? 150 : ms));

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    document.title = "Cerner-RPM-app | Handshake...";

    async function runLaunch() {
      try {
        addLog("SYSTEM: Booting SMART on FHIR authorization client...");
        
        // Fetch config immediately to check POV mode
        const config = await fetchFhirConfig();
        const currentPov = config.app_pov || "DEV";
        setAppPov(currentPov);
        appPovRef.current = currentPov;
        
        await delay(800);

        addLog("PARAMS: Extracting EHR query parameters from URL...");
        const params = new URLSearchParams(window.location.search);
        const issParam = params.get("iss");
        const launchParam = params.get("launch");
        await delay(800);

        const activeIss = issParam || sessionStorage.getItem("smart_iss");
        const activeLaunch = launchParam || sessionStorage.getItem("smart_launch");

        if (issParam) {
          sessionStorage.setItem("smart_iss", issParam);
          addLog(`PARAMS: FHIR Base Server URL detected: "${issParam}"`);
        } else if (activeIss) {
          addLog(`PARAMS: Fallback to cached FHIR Base URL: "${activeIss}"`);
        } else {
          addLog("PARAMS: No 'iss' parameter supplied. Standardizing on default Cerner Sandbox configuration...");
        }

        if (launchParam) {
          sessionStorage.setItem("smart_launch", launchParam);
          addLog(`PARAMS: Launch Context token cached: "${launchParam.substring(0, 15)}..."`);
        } else if (activeLaunch) {
          addLog(`PARAMS: Fallback to cached Launch Context token: "${activeLaunch.substring(0, 15)}..."`);
        } else {
          addLog("PARAMS: Standalone Launch context detected (no EHR launch token).");
        }
        await delay(800);

        addLog("CONFIG: Loading client application registration from RPM backend...");
        if (!config.client_id) {
          throw new Error("Client registration check failed: Client ID is missing in backend .env");
        }
        addLog(`CONFIG: Registered Client ID: "${config.client_id}"`);
        addLog(`CONFIG: Configured Scopes: "${config.smart_scopes}"`);
        await delay(800);

        const base = (activeIss || config.cerner_base_url || "").replace(/\/$/, "");
        if (!base) {
          throw new Error("EHR URL check failed: Base URL (iss) was not provided and is not configured in backend");
        }

        setStatus("discovering");
        addLog(`DISCOVERY: Initiating discovery handshake with FHIR server at: "${base}"`);
        addLog("DISCOVERY: Querying SMART metadata well-known endpoints...");
        await delay(1000);

        const endpoints = await discoverOauthEndpoints(base);
        addLog(`DISCOVERY: Authorization Endpoint: "${endpoints.authorization_endpoint}"`);
        addLog(`DISCOVERY: Token Endpoint: "${endpoints.token_endpoint}"`);
        await delay(800);

        addLog("SESSION: Preserving security parameters for state validation...");
        const state = Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem("smart_state", state);
        sessionStorage.setItem("smart_fhir_base_url", base);
        sessionStorage.setItem("smart_token_endpoint", endpoints.token_endpoint);
        addLog(`SESSION: Generated Secure State token: "${state}"`);
        await delay(800);

        // Standalone Launch Override (forcing provider persona context chooser)
        let authEndpoint = endpoints.authorization_endpoint;
        if (base.includes("cerner.com") && !activeLaunch) {
          const tenant = base.split("/").pop();
          authEndpoint = `https://authorization.cerner.com/tenants/${tenant}/protocols/oauth2/profiles/smart-v1/personas/provider/authorize`;
          addLog("SESSION: Standalone Launch: Overriding to force EHR Provider Persona select screen...");
          await delay(600);
        }

        addLog("SYSTEM: Handshake completed. Formatting authorization redirect payload...");
        const authUrl = new URL(authEndpoint);
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append("client_id", config.client_id);
        authUrl.searchParams.append("redirect_uri", config.redirect_uri);
        
        let finalScopes = config.smart_scopes;
        if (activeLaunch) {
          authUrl.searchParams.append("launch", activeLaunch);
          finalScopes = finalScopes.replace("launch/patient", "launch");
        }
        authUrl.searchParams.append("scope", finalScopes);
        authUrl.searchParams.append("state", state);
        authUrl.searchParams.append("aud", base);
        await delay(1000);

        setStatus("ready");
        addLog("SYSTEM: Redirecting browser to EHR login & patient authorization screen...");
        await delay(1200);

        sessionStorage.removeItem("smart_auto_launch");
        window.location.href = authUrl.toString();
      } catch (err: any) {
        console.error(err);
        setAppPov(appPovRef.current || "DEV");
        setStatus("error");
        setErrorDetail(err.message || "Unknown error during SMART Launch sequence.");
        addLog(`FATAL ERROR: ${err.message || "SMART Launch failed."}`);
      }
    }

    runLaunch();
  }, []);

  if (appPov === null) {
    return <div className="launch-screen"></div>;
  }

  return (
    <div className="launch-screen">
      {appPov === "CUS" ? (
        status !== "error" ? (
          <div className="minimal-launch-container">
            <div className="spinner-container">
              <div className="minimal-spinner"></div>
              <div className="spinner-glow"></div>
            </div>
            <div className="minimal-status-text">
              {status === "initializing" && "Connecting to Cerner EHR Sandbox..."}
              {status === "discovering" && "Authenticating secure session..."}
              {status === "ready" && "Redirecting to EHR dashboard..."}
            </div>
          </div>
        ) : (
          <div className="minimal-error-container">
            <svg viewBox="0 0 24 24" className="error-icon" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2>Launch Failed</h2>
            <p>{errorDetail}</p>
            <button className="solid-btn dark" onClick={() => window.location.href = "/"}>
              Return to ICU Floor
            </button>
          </div>
        )
      ) : (
        <div className="launch-container">
          <div className="launch-header">
            <div className="header-status">
              <span className="pulse-dot"></span>
              <span className="title">SMART ON FHIR HANDSHAKE IN PROGRESS</span>
            </div>
            <div className="header-meta">
              {status === "initializing" && "STATUS: INITIALIZING CLIENT"}
              {status === "discovering" && "STATUS: DISCOVERING ENDPOINTS"}
              {status === "ready" && "STATUS: ESTABLISHING REDIRECT"}
              {status === "error" && "STATUS: HANDSHAKE FAIL"}
            </div>
          </div>

          <div className="terminal-window">
            <div className="terminal-header">
              <div className="terminal-buttons">
                <span className="btn close"></span>
                <span className="btn minimize"></span>
                <span className="btn maximize"></span>
              </div>
              <div className="terminal-title">smart_handshake_client.sh</div>
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
                  Awaiting next step<span className="cursor"></span>
                </div>
              )}
            </div>
          </div>

          {status === "error" && (
            <div className="error-actions">
              <button className="solid-btn dark" onClick={() => window.location.href = "/"}>
                Return to ICU Floor
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
