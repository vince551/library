import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { apiRequest } from "../lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function toProfile(user) {
  if (!user) return null;

  return {
    fullName: user.full_name || user.fullName || "",
    role: user.role || "member",
    email: user.email || "",
    libraryNumber: user.membership_number || user.membershipNumber || "",
    eduLevel: user.edu_level || user.eduLevel || "Member",
    studyLevel: user.study_level || user.studyLevel || "Library member",
    school: user.school || "",
    phone: user.phone || "",
    gender: user.gender || "",
    guardianName: user.guardian_name || user.guardianName || "",
    guardianRelation: user.guardian_relation || user.guardianRelation || "",
    guardianPhone: user.guardian_phone || user.guardianPhone || "",
    isApproved: user.status === "active",
    approvedAt: user.approved_at || user.approvedAt || null,
    membershipStatus: user.status || "pending"
  };
}

export function AuthProvider({ children }) {
  const { showToast } = useToast();
  const [token, setToken] = useState(() => localStorage.getItem("amg_auth_token"));
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(() => !localStorage.getItem("amg_auth_token"));

  const librarian = user?.role === "librarian" || user?.role === "admin";

  useEffect(() => {
    if (!token) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;

    apiRequest("/auth/me", { token })
      .then(data => {
        if (cancelled) return;
        const currentUser = data.user || data;
        setUser(currentUser);
        setProfile(toProfile(currentUser));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("amg_auth_token");
        setToken(null);
        setUser(null);
        setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    if (!email || !password) {
      showToast("Enter your email and password.", "error");
      return false;
    }

    try {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password }
      });

      if (!data.token || !data.user) {
        throw new Error("The server returned an incomplete sign-in response.");
      }

      localStorage.setItem("amg_auth_token", data.token);
      setToken(data.token);
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
    const password = String(form.get("password") || "");

    try {
      const data = await apiRequest("/auth/register", {
        method: "POST",
        body: {
          fullName, email, password,
          gender: String(form.get("gender") || ""),
          school: String(form.get("school") || "").trim(),
          studyLevel: String(form.get("studyLevel") || "").trim(),
          eduLevel: String(form.get("eduLevel") || ""),
          guardianName: String(form.get("guardianName") || "").trim(),
          guardianRelation: String(form.get("guardianRelation") || ""),
          guardianPhone: String(form.get("guardianPhone") || "").trim()
        }
      });

      showToast(data.message || "Registration submitted. Your account is awaiting approval.");
      return true;
    } catch (error) {
      showToast(error.message || "Unable to submit your registration.", "error");
      return false;
    }
  }, [showToast]);

  const logout = useCallback(() => {
    localStorage.removeItem("amg_auth_token");
    setToken(null);
    setUser(null);
    setProfile(null);
    setReady(true);
    showToast("You have been signed out.");
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
    const photoURL = URL.createObjectURL(file);
    setProfile(current => ({ ...current, photoURL }));
    showToast("Photo preview updated for this session.");
    return true;
  }, [showToast]);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;

    try {
      const data = await apiRequest("/auth/me", { token });
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
