import { API_BASE_URL } from "../api";

export async function getSmartConfig(clientId: string, redirectUri: string, launch?: string | null, iss?: string | null) {
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("redirect_uri", redirectUri);
  if (launch) params.append("launch", launch);
  if (iss) params.append("iss", iss);
  
  const queryString = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/auth/smart-config${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch smart config: ${response.statusText}`);
  }
  return await response.json();
}

export async function exchangeCodeForToken(code: string, redirectUri: string, clientId: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      client_id: clientId
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }
  return await response.json();
}
