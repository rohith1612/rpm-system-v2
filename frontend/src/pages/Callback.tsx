import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { exchangeCodeForToken } from "../utils/smartConfig";

export default function Callback() {
  const [status, setStatus] = useState("Processing authentication...");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    async function handleCallback() {
      if (processed.current) return;
      processed.current = true;

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const err = params.get("error");
      
      if (err) {
        setError(`OAuth Error: ${err}`);
        return;
      }
      
      if (!code) {
        setError("No authorization code found in URL.");
        return;
      }

      try {
        setStatus("Exchanging code for tokens...");
        const clientId = import.meta.env.VITE_CERNER_CLIENT_ID;
        const redirectUri = import.meta.env.VITE_CERNER_REDIRECT_URI;
        
        const authData = await exchangeCodeForToken(code, redirectUri, clientId);
        
        if (authData.session_id) {
          sessionStorage.setItem("smart_session_id", authData.session_id);
        }
        
        console.log("SMART Auth Success:", authData);
        
        setStatus("Authentication successful! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1000);
      } catch (e: any) {
        console.error("Token exchange failed:", e);
        setError(e.detail || e.message || "Token exchange failed");
      }
    }

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-10 rounded-3xl shadow-2xl max-w-lg w-full text-center text-white">
        {error ? (
          <div>
            <h2 className="text-2xl font-bold text-red-400 mb-4">Authentication Error</h2>
            <p className="text-slate-300 mb-8">{error}</p>
            <button 
              onClick={() => navigate("/launch")}
              className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-xl transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div>
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-xl font-medium">{status}</h2>
          </div>
        )}
      </div>
    </div>
  );
}
