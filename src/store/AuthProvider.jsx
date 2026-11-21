import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const { showToast } = useToast();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const librarian = true;
  const ready = true;
  const login = useCallback(async (email, password) => {
    if (!email || !password) { showToast("Enter your email and password.", "error"); return false; }
    const isLibrarian = /librarian|admin/i.test(email);
    const nextUser = { uid: "demo-" + Date.now(), email, role: isLibrarian ? "librarian" : "member" };
    setUser(nextUser);
    setProfile({ fullName: isLibrarian ? "AMG Librarian" : email.split("@")[0], libraryNumber: "AMG-20481", eduLevel: "Member", studyLevel: "Library member", isApproved: true, approvedAt: new Date().toISOString(), email });
    showToast("Demo session started. No account was created.");
    return true;
  }, [showToast]);
  const register = useCallback(async (form) => {
    const fullName = String(form.get("fullName") || "New Member");
    const email = String(form.get("email") || "");
    setUser({ uid: "demo-" + Date.now(), email, role: "member" });
    setProfile({ fullName, email, libraryNumber: "AMG-" + String(Math.floor(10000 + Math.random() * 89999)), eduLevel: String(form.get("eduLevel") || "Learner"), studyLevel: String(form.get("studyLevel") || "Learner"), school: String(form.get("school") || ""), photoURL: "", isApproved: false, approvedAt: null });
    showToast("Demo registration saved in this browser session only.");
    return true;
  }, [showToast]);
  const logout = useCallback(() => { setUser(null); setProfile(null); showToast("Demo session ended."); }, [showToast]);
  const resetPassword = useCallback(async (email) => { showToast(email ? "Password reset is unavailable in frontend-only demo mode." : "Enter your email address first.", "error"); return false; }, [showToast]);
  const updatePhoto = useCallback(async (file) => {
    if (!file) return false;
    const photoURL = URL.createObjectURL(file);
    setProfile(current => ({ ...current, photoURL }));
    showToast("Photo preview updated for this session.");
    return true;
  }, [showToast]);
  const refreshProfile = useCallback(async () => profile, [profile]);
  const value = useMemo(() => ({ user, profile, librarian, ready, login, register, logout, resetPassword, updatePhoto, refreshProfile, setProfile }), [user, profile, login, register, logout, resetPassword, updatePhoto, refreshProfile]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}