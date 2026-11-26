const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/+$/, "");

export const apiUrl = path => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

function notifyInvalidSession(token, status, message) {
  const accountInactive = status === 403 && message === "This account is not active.";
  if (!token || (status !== 401 && !accountInactive) || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("amg:session-invalid", { detail: { token, message } }));
}

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

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
    throw requestError("Cannot reach the AMG Library server. Check that the API is running and the API URL is correct.", 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    notifyInvalidSession(token, response.status, data.message);
    throw requestError(data.message || `Request failed with status ${response.status}.`, response.status);
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
    throw requestError("Cannot reach the AMG Library server.", 0);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    notifyInvalidSession(token, response.status, data.message);
    throw requestError(data.message || `File request failed with status ${response.status}.`, response.status);
  }

  return response.blob();
}
