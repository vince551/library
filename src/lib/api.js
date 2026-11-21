const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/+$/, "");

export const apiUrl = path => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export async function apiRequest(path, { token, method = "GET", body, headers = {} } = {}) {
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new Error("Cannot reach the AMG Library server. Check that the API is running and the API URL is correct.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

export async function apiFileRequest(path, { token } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      headers: {
        Accept: "application/pdf, application/epub+zip, application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error("Cannot reach the AMG Library server.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `File request failed with status ${response.status}.`);
  }

  return response.blob();
}
