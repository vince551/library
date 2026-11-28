import { memo, useCallback, useEffect, useState } from "react";
import { ToastProvider, useToast } from "./store/ToastProvider";
import { AuthProvider, useAuth } from "./store/AuthProvider";
import { LibraryProvider, useLibrary } from "./store/LibraryProvider";
import { Navbar } from "./components/Navbar";
import { Hero } from "./components/Hero";
import { LibShelf } from "./components/LibShelf";
import { MemberProfile } from "./components/MemberProfile";
import { NewsSection } from "./components/NewsSection";
import { AuthModal } from "./components/AuthModal";
import { Desk } from "./components/librarian/Desk";
import { FloatingThemeToggle } from "./components/FloatingThemeToggle";

// Capture and immediately remove password-reset credentials from the address bar.
// New reset links use the URL fragment; legacy query-string links are scrubbed too.
const INITIAL_RESET_TOKEN = (() => {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const queryToken = url.searchParams.get("resetToken") || "";
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hashToken = hashParams.get("resetToken") || "";
  const token = hashToken || queryToken;
  if (token) {
    url.searchParams.delete("resetToken");
    hashParams.delete("resetToken");
    url.hash = hashParams.toString() ? hashParams.toString() : "";
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
  return token;
})();

const MemoNavbar = memo(Navbar);
const MemoHero = memo(Hero);
const MemoLibShelf = memo(LibShelf);
const MemoMemberProfile = memo(MemberProfile);
const MemoNewsSection = memo(NewsSection);
const MemoDesk = memo(Desk);

const VALID_SECTIONS = new Set([
  "heroSection",
  "libShelfSection",
  "profileSection",
  "newsSection",
  "librarianSection"
]);

function getInitialSection() {
  try {
    const saved = sessionStorage.getItem("amg_current_section");
    return VALID_SECTIONS.has(saved) ? saved : "heroSection";
  } catch {
    return "heroSection";
  }
}

function Shell() {
  const { user, librarian, ready } = useAuth();
  const { books, ebooks, publicPosts } = useLibrary();
  const { showToast } = useToast();
  const [section, setSection] = useState(getInitialSection);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  useEffect(() => {
    if (INITIAL_RESET_TOKEN) {
      setAuthMode("login");
      setAuthOpen(true);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("amg_current_section", section);
    } catch {
      // Session storage may be unavailable in private browsing; navigation still works.
    }
  }, [section]);

  useEffect(() => {
    if (!ready) return;
    if (!user && (section === "profileSection" || section === "librarianSection")) {
      setSection("heroSection");
    } else if (user && section === "librarianSection" && !librarian) {
      setSection("profileSection");
    }
  }, [ready, user, librarian, section]);

  const showSection = useCallback((id) => {
    if (id === "profileSection" && !user) {
      setAuthMode("login");
      setAuthOpen(true);
      showToast("Log in to view your profile.", "error");
      return;
    }
    if (id === "librarianSection" && !librarian) {
      setAuthMode("login");
      setAuthOpen(true);
      showToast("Sign in with a librarian demo account to open the staff workspace.", "error");
      return;
    }
    setSection(id);
    window.scrollTo({ top:0, behavior:"smooth" });
  }, [user, librarian, showToast]);

  const openAuth = useCallback((mode) => {
    setAuthMode(mode || "login");
    setAuthOpen(true);
  }, []);

  return <>
    <MemoNavbar section={section} onNavigate={showSection} onOpenAuth={openAuth} />
    <main className="container">
      <MemoHero active={section === "heroSection"} onNavigate={showSection} onOpenAuth={openAuth} books={books} ebooks={ebooks} posts={publicPosts} />
      <MemoLibShelf active={section === "libShelfSection"} onOpenAuth={openAuth} />
      <MemoMemberProfile active={section === "profileSection"} />
      <MemoNewsSection active={section === "newsSection"} posts={publicPosts} />
      <MemoDesk active={section === "librarianSection" && librarian} />
    </main>
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} AMG Library</span>
      <span>Learn. Discover. Grow.</span>
    </footer>
    <AuthModal initialResetToken={INITIAL_RESET_TOKEN} open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} onModeChange={setAuthMode} />
    <FloatingThemeToggle />
  </>;
}

export default function App() {
  return <ToastProvider><AuthProvider><LibraryProvider><Shell /></LibraryProvider></AuthProvider></ToastProvider>;
}
