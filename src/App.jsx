import { useCallback, useState } from "react";
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

function Shell() {
  const { user, librarian } = useAuth();
  const { books, ebooks, publicPosts } = useLibrary();
  const { showToast } = useToast();
  const [section, setSection] = useState("heroSection");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");

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
    <Navbar section={section} onNavigate={showSection} onOpenAuth={openAuth} />
    <main className="container">
      <Hero active={section === "heroSection"} onNavigate={showSection} onOpenAuth={openAuth} books={books} ebooks={ebooks} posts={publicPosts} />
      <LibShelf active={section === "libShelfSection"} onOpenAuth={openAuth} />
      <MemberProfile active={section === "profileSection"} />
      <NewsSection active={section === "newsSection"} posts={publicPosts} />
      <Desk active={section === "librarianSection" && librarian} />
    </main>
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} AMG Library</span>
      <span>Learn. Discover. Grow.</span>
    </footer>
    <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} onModeChange={setAuthMode} />
  </>;
}

export default function App() {
  return <ToastProvider><AuthProvider><LibraryProvider><Shell /></LibraryProvider></AuthProvider></ToastProvider>;
}