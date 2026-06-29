import { useState, useEffect } from "react";
import { getSmartConfig } from "../utils/smartConfig";
import { motion } from "framer-motion";

export default function Launch() {
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);

  // You can auto-launch or require a button click. Let's require a click for demo purposes.
  const startLaunch = async () => {
    setIsLaunching(true);
    setError(null);
    try {
      const clientId = import.meta.env.VITE_CERNER_CLIENT_ID;
      const redirectUri = import.meta.env.VITE_CERNER_REDIRECT_URI;
      
      const params = new URLSearchParams(window.location.search);
      const launch = params.get("launch");
      const iss = params.get("iss");
      
      const config = await getSmartConfig(clientId, redirectUri, launch, iss);
      
      // Redirect to Cerner's authorize endpoint
      window.location.href = config.authorize_url;
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to start SMART launch");
      setIsLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <motion.div 
        className="bg-white/10 backdrop-blur-xl border border-white/20 p-10 rounded-3xl shadow-2xl max-w-lg w-full text-center text-white"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-3xl font-bold mb-2">Cerner SMART on FHIR</h1>
        <p className="text-slate-300 mb-8">Clinical RPM Integration</p>
        
        <div className="bg-slate-800/50 rounded-2xl p-6 text-left text-sm text-slate-300 mb-8 border border-white/10">
          <h3 className="font-bold text-white mb-2">How OAuth 2.0 Works Here</h3>
          <ol className="list-decimal pl-5 space-y-2">
            <li>When you click Connect, you will be securely redirected to Cerner.</li>
            <li>You will authenticate as a simulated provider and select a sandbox patient.</li>
            <li>Cerner will redirect you back with a temporary Authorization Code.</li>
            <li>This app exchanges that code for an Access Token to read/write FHIR data.</li>
          </ol>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-xl mb-6">
            <strong>Launch Error:</strong> {error}
          </div>
        )}

        <button 
          onClick={startLaunch} 
          disabled={isLaunching}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-xl transition-colors disabled:opacity-50"
        >
          {isLaunching ? "Connecting..." : "Connect to Cerner Millennium"}
        </button>
      </motion.div>
    </div>
  );
}
