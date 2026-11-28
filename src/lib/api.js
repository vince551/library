// In production, route through Vercel so the API cookie remains first-party.
// Local development can still target the Express server directly.
const API_BASE_URL = (import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api")
  : "/api").replace(/\/+$/, "");

export const apiUrl = path => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

function notifyInvalidSession(token, status, message, suppressSessionNotice = false) {
  const accountInactive = status === 403 && message === "This account is not active.";
  if (suppressSessionNotice || (status !== 401 && !accountInactive) || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("amg:session-invalid", { detail: { token, status, message } }));
}

function requestError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function apiRequest(path, { token, method = "GET", body, headers = {}, suppressSessionNotice = false } = {}) {
  let response;

  try {
    response = await fetch(apiUrl(path), {
      method,
      headers: {
        Accept: "application/json",
        "X-AMG-Request": "1",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers
      },
      credentials: "include",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw requestError("Cannot reach the AMG Library server. Check that the API is running and the API URL is correct.", 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    notifyInvalidSession(token, response.status, data.message, suppressSessionNotice);
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
        "X-AMG-Request": "1"
      },
      credentials: "include"
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
