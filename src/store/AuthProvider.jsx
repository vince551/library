import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { apiRequest } from "../lib/api";
import { avatarSeedUrl } from "../lib/format";

const AuthContext = createContext(null);

async function photoFileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
export const useAuth = () => useContext(AuthContext);

function toProfile(user) {
  if (!user) return null;

  return {
    fullName: user.full_name || user.fullName || "",
    role: user.role || "member",
    email: user.email || "",
    loginCode: user.login_code || user.loginCode || "",
    libraryNumber: user.membership_number || user.membershipNumber || "",
    eduLevel: user.edu_level || user.eduLevel || "Member",
    studyLevel: user.study_level || user.studyLevel || "Library member",
    school: user.school || "",
    phone: user.phone || "",
    gender: user.gender || "",
    guardianName: user.guardian_name || user.guardianName || "",
    guardianRelation: user.guardian_relation || user.guardianRelation || "",
    guardianPhone: user.guardian_phone || user.guardianPhone || "",
    photoURL: user.photoURL || user.photo_url || (user.avatar_choice ? avatarSeedUrl(user.avatar_choice) : ""),
    isApproved: user.status === "active",
    approvedAt: user.approved_at || user.approvedAt || null,
    membershipStatus: user.status || "pending"
  };
}

export function AuthProvider({ children }) {
  const { showToast } = useToast();
  const [token, setToken] = useState("cookie-session");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);

  const librarian = user?.role === "librarian" || user?.role === "admin";

  useEffect(() => {
    const handleInvalidSession = (event) => {
      if (event.detail?.status !== 401 && event.detail?.status !== 403) return;
      setToken("cookie-session");
      setUser(null);
      setProfile(null);
      setReady(true);
      showToast("Your session has expired or is no longer active. Please sign in again.", "error");
    };

    window.addEventListener("amg:session-invalid", handleInvalidSession);
    return () => window.removeEventListener("amg:session-invalid", handleInvalidSession);
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;

    // A 401 here simply means this browser has no active login yet. Keep the
    // sign-in screen quiet; only show expiry notices after an active session
    // makes a request and is rejected.
    apiRequest("/auth/me", { suppressSessionNotice: true })
      .then(data => {
        if (cancelled) return;
        const currentUser = data.user || data;
        setUser(currentUser);
        setProfile(toProfile(currentUser));
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status !== 401 && !(error.status === 403 && error.message === "This account is not active.")) {
          showToast("We could not verify your session because the server is unreachable. Check your connection and refresh.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [token, showToast]);

  const login = useCallback(async (identifier, password) => {
    if (!identifier || !password) {
      showToast("Enter your login ID, full name or email and password.", "error");
      return false;
    }

    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password }
      });

      if (!data.user) {
        throw new Error("The server returned an incomplete sign-in response.");
      }

      setToken("cookie-session");
      setUser(data.user);
      setProfile(toProfile(data.user));
      setReady(true);
      showToast("Welcome back, " + (data.user.full_name || "AMG Library member") + ".");
      return true;
    } catch (error) {
      showToast(error.message || "Unable to sign in.", "error");
      return false;
    }
  }, [showToast]);

  const register = useCallback(async (form) => {
    const fullName = String(form.get("fullName") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const dateOfBirth = String(form.get("dateOfBirth") || "");
    const password = String(form.get("password") || "");

    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: {
          fullName, email, dateOfBirth, password,
          gender: String(form.get("gender") || ""),
          school: String(form.get("school") || "").trim(),
          studyLevel: String(form.get("studyLevel") || "").trim(),
          eduLevel: String(form.get("eduLevel") || ""),
          guardianName: String(form.get("guardianName") || "").trim(),
          guardianRelation: String(form.get("guardianRelation") || ""),
          guardianPhone: String(form.get("guardianPhone") || "").trim(),
          avatarChoice: String(form.get("avatarChoice") || "scholar"),
          ...(form.get("photo") instanceof File && form.get("photo").size > 0 ? {
            photoType: form.get("photo").type,
            photoData: await photoFileToBase64(form.get("photo"))
          } : {})
        }
      });

      showToast(data.message || "Registration submitted. Your account is awaiting approval.");
      return { success: true, message: data.message || "Registration submitted.", loginCode: data.loginCode || "" };
    } catch (error) {
      showToast(error.message || "Unable to submit your registration.", "error");
      return false;
    }
  }, [showToast]);

  const logout = useCallback(async () => {
    let revocationConfirmed = false;
    try {
      await apiRequest("/auth/logout", { method: "POST" });
      revocationConfirmed = true;
    } catch {
      // Always clear the local UI, but do not claim that the server revoked the session.
    }
    setToken("cookie-session");
    setUser(null);
    setProfile(null);
    setReady(true);
    showToast(
      revocationConfirmed
        ? "You have been signed out."
        : "Signed out on this screen, but server-side session revocation could not be confirmed. Check your connection and sign in again."
    , revocationConfirmed ? "success" : "error");
  }, [showToast]);

  const resetPassword = useCallback(async (email) => {
    showToast(
      email
        ? "Password reset is not available yet. Please contact the library administrator."
        : "Enter your email address first.",
      "error"
    );
    return false;
  }, [showToast]);

  const updatePhoto = useCallback(async (file) => {
    if (!file) return false;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      showToast("Choose a JPEG, PNG or WebP photo up to 5 MB.", "error");
      return false;
    }
    try {
      const data = await apiRequest("/auth/photo", {
        method: "PATCH",
        body: { photoType: file.type, photoData: await photoFileToBase64(file) }
      });
      setProfile(current => ({ ...current, photoURL: data.photoURL || "" }));
      setUser(current => current ? { ...current, photoURL: data.photoURL || "" } : current);
      showToast(data.message || "Profile photo saved.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not save your profile photo.", "error");
      return false;
    }
  }, [showToast]);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;

    try {
      const data = await apiRequest("/auth/me");
      const currentUser = data.user || data;
      setUser(currentUser);
      const nextProfile = toProfile(currentUser);
      setProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      showToast(error.message || "Could not refresh your profile.", "error");
      return null;
    }
  }, [token, showToast]);

  const value = useMemo(() => ({
    user, profile, token, librarian, ready, login, register, logout,
    resetPassword, updatePhoto, refreshProfile, setProfile
  }), [
    user, profile, token, librarian, ready, login, register, logout,
    resetPassword, updatePhoto, refreshProfile
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
