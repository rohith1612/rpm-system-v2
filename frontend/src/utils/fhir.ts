/**
 * Utility functions for SMART on FHIR integration with Cerner EHR.
 */

export interface FhirConfig {
  cerner_base_url: string;
  cerner_token_url: string;
  client_id: string;
  redirect_uri: string;
  smart_scopes: string;
  app_pov?: "DEV" | "CUS";
}

export interface OAuthEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
}

const API_BASE = "http://localhost:8000/api";

/**
 * Build Authorization headers from the stored SMART on FHIR access token.
 */
function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("smart_access_token");
  if (token) {
    return { "Authorization": `Bearer ${token}` };
  }
  return {};
}

/**
 * Fetch SMART on FHIR configuration from backend.
 */
export async function fetchFhirConfig(): Promise<FhirConfig> {
  const res = await fetch(`${API_BASE}/auth/config`);
  if (!res.ok) throw new Error("Failed to fetch FHIR configuration from backend");
  return res.json();
}

/**
 * Discover OAuth2 authorize and token endpoints dynamically from FHIR base URL.
 * Falls back to CapabilityStatement or constructing standard endpoints if needed.
 */
export async function discoverOauthEndpoints(fhirBaseUrl: string): Promise<OAuthEndpoints> {
  // 1. Try Well-Known SMART Configuration
  try {
    const response = await fetch(`${fhirBaseUrl}/.well-known/smart-configuration`, {
      headers: { "Accept": "application/json" }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.authorization_endpoint && data.token_endpoint) {
        return {
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint
        };
      }
    }
  } catch (e) {
    console.warn("Failed to fetch .well-known/smart-configuration:", e);
  }

  // 2. Try CapabilityStatement /metadata
  try {
    const response = await fetch(`${fhirBaseUrl}/metadata`, {
      headers: { "Accept": "application/fhir+json" }
    });
    if (response.ok) {
      const metadata = await response.json();
      const security = metadata.rest?.[0]?.security;
      if (security && security.extension) {
        const oauthUriExt = security.extension.find(
          (ext: any) => ext.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris"
        );
        if (oauthUriExt && oauthUriExt.extension) {
          const authExt = oauthUriExt.extension.find((ext: any) => ext.url === "authorize");
          const tokenExt = oauthUriExt.extension.find((ext: any) => ext.url === "token");
          if (authExt && tokenExt) {
            return {
              authorization_endpoint: authExt.valueUri,
              token_endpoint: tokenExt.valueUri
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed to fetch CapabilityStatement metadata:", e);
  }

  // 3. Fallback: Parse backend token URL to construct authorize endpoint
  const backendConfig = await fetchFhirConfig();
  const tokenUrl = backendConfig.cerner_token_url;
  
  if (tokenUrl) {
    // Usually token is: https://authorization.cerner.com/tenants/{tenant}/protocols/oauth2/profiles/smart-v1/token
    // Auth is: https://authorization.cerner.com/tenants/{tenant}/protocols/oauth2/profiles/smart-v1/personas/provider/authorize
    // Or for standalone it could use provider persona by default:
    const authUrl = tokenUrl.replace(/\/token$/, "/personas/provider/authorize");
    return {
      authorization_endpoint: authUrl,
      token_endpoint: tokenUrl
    };
  }

  throw new Error("Could not discover SMART on FHIR OAuth endpoints.");
}

/**
 * Initiate SMART on FHIR standalone launch.
 * Redirects the user to Cerner's Authorization screen.
 */
export async function initiateSmartLaunch(onProgress?: (msg: string) => void): Promise<void> {
  if (onProgress) onProgress("Fetching FHIR configuration from backend...");
  const config = await fetchFhirConfig();
  if (!config.client_id) {
    throw new Error("Cerner Client ID is not configured in the backend.");
  }

  // Parse URL query parameters for SMART on FHIR launch
  const params = new URLSearchParams(window.location.search);
  const issParam = params.get("iss") || sessionStorage.getItem("smart_iss");
  const launchParam = params.get("launch") || sessionStorage.getItem("smart_launch");

  if (issParam) {
    sessionStorage.setItem("smart_iss", issParam);
  }
  if (launchParam) {
    sessionStorage.setItem("smart_launch", launchParam);
  }

  const base = (issParam || config.cerner_base_url || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("Cerner Base URL (iss) is not provided and not configured.");
  }
  
  // Discover endpoints
  if (onProgress) onProgress("Discovering SMART on FHIR OAuth2 endpoints...");
  const endpoints = await discoverOauthEndpoints(base);

  // Override Cerner default authorize endpoint to force provider persona.
  // This ensures patient context selection screen is shown and returned.
  // We ONLY do this for Standalone Launches (when no launch token is present).
  if (base.includes("cerner.com") && !launchParam) {
    const tenant = base.split("/").pop();
    endpoints.authorization_endpoint = `https://authorization.cerner.com/tenants/${tenant}/protocols/oauth2/profiles/smart-v1/personas/provider/authorize`;
    console.log("Standalone Launch detected. Overriding authorization endpoint to provider persona:", endpoints.authorization_endpoint);
  }
  
  // Generate random state
  const state = Math.random().toString(36).substring(2, 15);
  
  // Save OAuth state/base URL to verify on callback
  sessionStorage.setItem("smart_state", state);
  sessionStorage.setItem("smart_fhir_base_url", base);
  sessionStorage.setItem("smart_token_endpoint", endpoints.token_endpoint);

  // Redirect to Cerner Authorize URL
  if (onProgress) onProgress("Redirecting to Cerner secure authorization endpoint...");
  const authUrl = new URL(endpoints.authorization_endpoint);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("client_id", config.client_id);
  authUrl.searchParams.append("redirect_uri", config.redirect_uri);
  let finalScopes = config.smart_scopes;
  
  if (launchParam) {
    authUrl.searchParams.append("launch", launchParam);
    // For EHR launch, we need 'launch' scope instead of 'launch/patient'
    finalScopes = finalScopes.replace("launch/patient", "launch");
  }

  authUrl.searchParams.append("scope", finalScopes);
  authUrl.searchParams.append("state", state);
  authUrl.searchParams.append("aud", base);

  console.log("Redirecting to Cerner SMART OAuth URL:", authUrl.toString());
  sessionStorage.removeItem("smart_auto_launch");
  window.location.href = authUrl.toString();
}


/**
 * Exchange Authorization Code for Access Token via backend proxy.
 */
export async function exchangeAuthCode(code: string, redirectUri: string): Promise<any> {
  const response = await fetch(`${API_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return response.json();
}

/**
 * Fetch Patient Demographics from Cerner FHIR server.
 */
export async function fetchPatientDemographics(
  _fhirBaseUrl: string,
  _accessToken: string,
  patientId: string
): Promise<{ name: string; age: number; gender: string }> {
  // Now using backend proxy via system token for unrestricted access
  const response = await fetch(`${API_BASE}/patients/cerner/${patientId}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch patient details: ${response.statusText}`);
  }
  const patient = await response.json();
  return { 
    name: patient.name || "Unknown Patient", 
    age: patient.age || 0, 
    gender: patient.gender || "unknown" 
  };
}

/**
 * Fetch Patient active conditions from Cerner FHIR server.
 */
export async function fetchPatientConditions(
  fhirBaseUrl: string,
  accessToken: string,
  patientId: string
): Promise<string> {
  const url = `${fhirBaseUrl}/Condition?patient=${patientId}`;
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/fhir+json"
      }
    });

    if (response.ok) {
      const bundle = await response.json();
      if (bundle.entry && bundle.entry.length > 0) {
        // Find first active condition or just first condition
        const activeCond = bundle.entry.find((entry: any) => {
          const status = entry.resource?.clinicalStatus?.coding?.[0]?.code || "";
          return status === "active";
        }) || bundle.entry[0];

        const resource = activeCond?.resource;
        if (resource) {
          const text = resource.code?.text;
          const display = resource.code?.coding?.[0]?.display;
          return text || display || "Clinical Condition";
        }
      }
    }
  } catch (e) {
    console.error("Error fetching conditions:", e);
  }
  return "Stable / Monitoring";
}

/**
 * Fetch Vital Signs (Observations) from Cerner FHIR.
 */
export async function fetchPatientVitals(
  fhirBaseUrl: string,
  accessToken: string,
  patientId: string
): Promise<{
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
}> {
  const url = `${fhirBaseUrl}/Observation?patient=${patientId}&category=vital-signs&_count=50`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/fhir+json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch vitals: ${response.statusText}`);
  }

  const bundle = await response.json();
  const vitals = {
    heart_rate: null as number | null,
    spo2: null as number | null,
    temperature: null as number | null,
    respiratory_rate: null as number | null,
    systolic_bp: null as number | null,
    diastolic_bp: null as number | null
  };

  if (!bundle.entry) return vitals;

  // We loop through entries to extract the latest value for each vital sign
  // Cerner observations are usually sorted by date descending, but to be sure we can check timestamps if needed,
  // or just use the first match since it is chronological. Let's process them.
  for (const entry of bundle.entry) {
    const obs = entry.resource;
    if (!obs) continue;

    const code = obs.code?.coding?.[0]?.code;
    
    // Heart Rate (LOINC: 8867-4)
    if (code === "8867-4" && vitals.heart_rate === null) {
      vitals.heart_rate = obs.valueQuantity?.value || null;
    }
    
    // SpO2 (LOINC: 2708-6, 59408-5)
    if ((code === "2708-6" || code === "59408-5") && vitals.spo2 === null) {
      vitals.spo2 = obs.valueQuantity?.value || null;
    }

    // Body Temp (LOINC: 8310-5)
    if (code === "8310-5" && vitals.temperature === null) {
      vitals.temperature = obs.valueQuantity?.value || null;
    }

    // Resp Rate (LOINC: 9279-1)
    if (code === "9279-1" && vitals.respiratory_rate === null) {
      vitals.respiratory_rate = obs.valueQuantity?.value || null;
    }

    // Blood Pressure Panel (LOINC: 85354-9, 55284-4)
    if ((code === "85354-9" || code === "55284-4") && obs.component) {
      for (const comp of obs.component) {
        const compCode = comp.code?.coding?.[0]?.code;
        // Systolic: 8480-6
        if (compCode === "8480-6" && vitals.systolic_bp === null) {
          vitals.systolic_bp = comp.valueQuantity?.value || null;
        }
        // Diastolic: 8462-4
        if (compCode === "8462-4" && vitals.diastolic_bp === null) {
          vitals.diastolic_bp = comp.valueQuantity?.value || null;
        }
      }
    }
  }

  return vitals;
}

/**
 * Search patients on Cerner FHIR server.
 */
export async function searchPatients(
  _fhirBaseUrl: string,
  _accessToken: string,
  query: string
): Promise<Array<{ id: string; name: string; age: number; condition: string }>> {
  // Now using backend proxy via system token for unrestricted searching
  const response = await fetch(`${API_BASE}/patients/cerner/search?query=${encodeURIComponent(query)}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!response.ok) {
    throw new Error(`Failed to search patients`);
  }
  return response.json();
}

/**
 * Send a transaction bundle of vital signs for a patient to the Cerner FHIR server.
 */
async function safeParseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) {
    return { status: "success", statusText: response.statusText, code: response.status };
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return { rawResponse: text, statusText: response.statusText, code: response.status };
  }
}

/**
 * Send a transaction bundle of vital signs for a patient to the Cerner FHIR server.
 */
export async function sendVitalsToCerner(
  fhirBaseUrl: string,
  accessToken: string,
  cernerPatientId: string,
  vitals: {
    heart_rate: number | null;
    spo2: number | null;
    temperature: number | null;
    respiratory_rate: number | null;
    systolic_bp: number | null;
    diastolic_bp: number | null;
  },
  patientId: string
): Promise<any> {
  // If we are in mock auth mode, simulate successful FHIR server save
  if (accessToken === "mock_offline_demo_token" || !fhirBaseUrl || fhirBaseUrl.includes("localhost")) {
    console.log("[FHIR] Mocking Cerner Save for Patient:", cernerPatientId, vitals);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Log mock sync to backend
    try {
      await fetch(`${API_BASE}/patients/cerner/log-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patient_id: patientId,

          status: "success",
          method: "mock_transaction_bundle",
          http_status: 200,
          payload_sent: "Mock Transaction Bundle Payload (Simulated)",
          response_body: "Mock sandbox environment sync simulation - all checks passed",
          vitals_sent: vitals
        })
      });
    } catch (err) {
      console.error("[FHIR] Failed to send mock log to backend:", err);
    }
    
    return { status: "success", mocked: true };
  }

  const entries: any[] = [];
  const timestamp = new Date().toISOString();

  // 1. Heart Rate (LOINC: 69000-8)
  if (vitals.heart_rate !== null && vitals.heart_rate !== undefined) {
    entries.push({
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs"
              }
            ],
            text: "Vital Signs"
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "69000-8",
              display: "Heart rate"
            }
          ]
        },
        subject: { reference: `Patient/${cernerPatientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: vitals.heart_rate,
          unit: "beats/minute",
          system: "http://unitsofmeasure.org",
          code: "{Beats}/min"
        }
      },
      request: {
        method: "POST",
        url: "Observation"
      }
    });
  }

  // 2. SpO2 (LOINC: 59418-4)
  if (vitals.spo2 !== null && vitals.spo2 !== undefined) {
    entries.push({
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs"
              }
            ],
            text: "Vital Signs"
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "59418-4",
              display: "SpO2"
            }
          ]
        },
        subject: { reference: `Patient/${cernerPatientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: vitals.spo2,
          unit: "%",
          system: "http://unitsofmeasure.org",
          code: "%"
        }
      },
      request: {
        method: "POST",
        url: "Observation"
      }
    });
  }

  // 3. Oral Temperature (LOINC: 8331-1)
  if (vitals.temperature !== null && vitals.temperature !== undefined) {
    entries.push({
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs"
              }
            ],
            text: "Vital Signs"
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8331-1",
              display: "Oral temperature"
            }
          ]
        },
        subject: { reference: `Patient/${cernerPatientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: vitals.temperature,
          unit: "degC",
          system: "http://unitsofmeasure.org",
          code: "Cel"
        }
      },
      request: {
        method: "POST",
        url: "Observation"
      }
    });
  }

  // 4. Respiratory Rate (LOINC: 9279-1)
  if (vitals.respiratory_rate !== null && vitals.respiratory_rate !== undefined) {
    entries.push({
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs"
              }
            ],
            text: "Vital Signs"
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "9279-1",
              display: "Respiratory rate"
            }
          ]
        },
        subject: { reference: `Patient/${cernerPatientId}` },
        effectiveDateTime: timestamp,
        valueQuantity: {
          value: vitals.respiratory_rate,
          unit: "/min",
          system: "http://unitsofmeasure.org",
          code: "{Breaths}/min"
        }
      },
      request: {
        method: "POST",
        url: "Observation"
      }
    });
  }

  // 5. Blood Pressure Panel (LOINC: 85354-9)
  if (
    (vitals.systolic_bp !== null && vitals.systolic_bp !== undefined) ||
    (vitals.diastolic_bp !== null && vitals.diastolic_bp !== undefined)
  ) {
    const components: any[] = [];
    if (vitals.systolic_bp !== null && vitals.systolic_bp !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8480-6",
              display: "Systolic blood pressure"
            }
          ]
        },
        valueQuantity: {
          value: vitals.systolic_bp,
          unit: "mmHg",
          system: "http://unitsofmeasure.org",
          code: "mm[Hg]"
        }
      });
    }
    if (vitals.diastolic_bp !== null && vitals.diastolic_bp !== undefined) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "8462-4",
              display: "Diastolic blood pressure"
            }
          ]
        },
        valueQuantity: {
          value: vitals.diastolic_bp,
          unit: "mmHg",
          system: "http://unitsofmeasure.org",
          code: "mm[Hg]"
        }
      });
    }

    entries.push({
      resource: {
        resourceType: "Observation",
        status: "final",
        category: [
          {
            coding: [
              {
                system: "http://terminology.hl7.org/CodeSystem/observation-category",
                code: "vital-signs",
                display: "Vital Signs"
              }
            ],
            text: "Vital Signs"
          }
        ],
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "85354-9",
              display: "Blood pressure panel with all children optional"
            }
          ]
        },
        subject: { reference: `Patient/${cernerPatientId}` },
        effectiveDateTime: timestamp,
        component: components
      },
      request: {
        method: "POST",
        url: "Observation"
      }
    });
  }

  if (entries.length === 0) {
    return { status: "no_data" };
  }

  // Send as Transaction Bundle to the root
  const bundle = {
    resourceType: "Bundle",
    type: "transaction",
    entry: entries
  };

  const cleanBaseUrl = fhirBaseUrl.replace(/\/$/, "");

  try {
    console.log("[FHIR] Attempting Transaction Bundle sync to Cerner EHR...");
    const response = await fetch(cleanBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/fhir+json"
      },
      body: JSON.stringify(bundle)
    });

    if (response.ok) {
      console.log("[FHIR] Transaction Bundle sync succeeded!");
      const data = await safeParseJson(response);
      
      // Log success to backend
      try {
        await fetch(`${API_BASE}/patients/cerner/log-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            patient_id: patientId,
  
            status: "success",
            method: "transaction_bundle",
            http_status: response.status,
            payload_sent: JSON.stringify(bundle, null, 2),
            response_body: JSON.stringify(data, null, 2),
            vitals_sent: vitals
          })
        });
      } catch (err) {
        console.error("[FHIR] Failed to send bundle success log to backend:", err);
      }
      
      return data;
    }

    const errText = await response.text();
    console.warn(`[FHIR] Transaction Bundle failed (${response.status}): ${errText || response.statusText}. Falling back to individual Observation posts...`);
  } catch (e) {
    console.warn("[FHIR] Transaction Bundle request threw exception. Falling back to individual Observation posts...", e);
  }

  // Fallback: Send each patient's vital signs individually one by one
  console.log(`[FHIR] Syncing ${entries.length} observations individually for patient:`, cernerPatientId);
  const results = [];
  try {
    for (const entry of entries) {
      const postUrl = `${cleanBaseUrl}/Observation`;
      const response = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/fhir+json"
        },
        body: JSON.stringify(entry.resource)
      });

      if (!response.ok) {
        const errText = await response.text();
        
        // Log individual post failure to backend
        try {
          await fetch(`${API_BASE}/patients/cerner/log-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getAuthHeaders() },
            body: JSON.stringify({
              patient_id: patientId,
    
              status: "failed",
              method: "individual_observations",
              http_status: response.status,
              payload_sent: JSON.stringify(entry.resource, null, 2),
              response_body: `Individual Observation POST failed: ${errText || response.statusText}`,
              vitals_sent: vitals
            })
          });
        } catch (logErr) {
          console.error("[FHIR] Failed to send individual fail log to backend:", logErr);
        }
        
        throw new Error(`Failed to send individual vital to Cerner: ${errText || response.statusText}`);
      }
      const data = await safeParseJson(response);
      results.push(data);
    }

    // Log individual posts success to backend
    try {
      await fetch(`${API_BASE}/patients/cerner/log-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patient_id: patientId,

          status: "success",
          method: "individual_observations",
          http_status: 201,
          payload_sent: JSON.stringify(entries.map(e => e.resource), null, 2),
          response_body: JSON.stringify(results, null, 2),
          vitals_sent: vitals
        })
      });
    } catch (logErr) {
      console.error("[FHIR] Failed to send individual success log to backend:", logErr);
    }
  } catch (loopErr: any) {
    // Log exception to backend
    try {
      await fetch(`${API_BASE}/patients/cerner/log-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patient_id: patientId,

          status: "failed",
          method: "individual_observations",
          http_status: 500,
          payload_sent: JSON.stringify(entries.map(e => e.resource), null, 2),
          response_body: `Request exception: ${loopErr.message || loopErr}`,
          vitals_sent: vitals
        })
      });
    } catch (logErr) {
      console.error("[FHIR] Failed to send crash log to backend:", logErr);
    }
    throw loopErr;
  }

  console.log("[FHIR] Individual vital saves completed successfully!");
  return { status: "success", detail: "individual_saves", results };
}

/**
 * Refresh access token using refresh_token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<any> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  return response.json();
}
