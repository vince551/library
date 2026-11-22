import { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthProvider";
import { useLibrary } from "../../store/LibraryProvider";
import { CardModal } from "../CardModal";
import { AllLearnersTab, BorrowRequestsTab, PendingLearnersTab } from "./MembershipTabs";
import { BooksTab } from "./BooksTab";
import { AttendanceTab } from "./AttendanceTab";
import { EbooksTab, NewsAdminTab } from "./ContentTabs";
import { StatisticsTab } from "./StatisticsTab";

const MODULES = [
  { id: "borrowRequestsTab", title: "Circulation desk", description: "Review requests and manage book returns.", icon: "↗", tone: "blue", countKey: "requests" },
  { id: "pendingLearnersTab", title: "Member approvals", description: "Review new membership applications.", icon: "✓", tone: "green", countKey: "pendingMembers" },
  { id: "allLearnersTab", title: "Members & cards", description: "View member records and library cards.", icon: "◎", tone: "violet", countKey: "members" },
  { id: "booksAdminTab", title: "Book inventory", description: "Register print books and manage copies.", icon: "▤", tone: "amber", countKey: "books" },
  { id: "attendanceTab", title: "Attendance", description: "Check learners in and monitor occupancy.", icon: "⌁", tone: "rose", countKey: "inside" },
  { id: "ebooksTab", title: "Digital library", description: "Publish and manage PDF reading resources.", icon: "▧", tone: "violet", countKey: "ebooks" },
  { id: "newsAdminTab", title: "News & events", description: "Keep the library community informed.", icon: "✳", tone: "slate", countKey: null },
  { id: "statisticsTab", title: "Library insights", description: "Explore circulation, membership and usage.", icon: "▥", tone: "green", countKey: null }
];

const MODULE_TITLES = Object.fromEntries(MODULES.map(item => [item.id, item.title]));

const formatToday = () => new Intl.DateTimeFormat("en-KE", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
}).format(new Date());

export function Desk({ active }) {
  const { profile, user } = useAuth();
  const { members, books, ebooks, requests, loans, attendance, refreshAdmin } = useLibrary();
  const [tab, setTab] = useState(null);
  const [cardMember, setCardMember] = useState(null);

  useEffect(() => {
    if (active) void refreshAdmin();
  }, [active, refreshAdmin]);

  const pendingRequests = requests.filter(request => request.status === "Pending").length;
  const pendingMembers = members.filter(member => member.status === "pending").length;
  const inside = attendance.filter(record => record.status === "In library").length;
  const availableCopies = books.reduce((total, book) => total + Number(book.available || 0), 0);
  const staffName = profile?.fullName || user?.email || "Librarian";
  const moduleCounts = {
    requests: pendingRequests,
    pendingMembers,
    members: members.length,
    books: books.length,
    inside,
    ebooks: ebooks.length
  };

  const openModule = (id) => setTab(id);
  const returnHome = () => setTab(null);

  return (
    <section id="librarianSection" className={"section" + (active ? " active" : "")}>
      {tab === null ? (
        <div className="workspace-home">
          <header className="workspace-hero">
            <div className="workspace-hero-copy">
              <span className="workspace-eyebrow">AMG LIBRARY · STAFF WORKSPACE</span>
              <h2>Good work starts with a well-run library.</h2>
              <p>Welcome back, {staffName}. Your workspace brings the essential library operations together in one calm, focused place.</p>
            </div>
            <div className="workspace-hero-meta">
              <span>YOUR WORKSPACE</span>
              <strong>{formatToday()}</strong>
            </div>
          </header>

          <div className="workspace-metrics" aria-label="Library overview">
            <div className="workspace-metric"><strong>{members.length}</strong><span>Registered members</span></div>
            <div className="workspace-metric"><strong>{books.length}</strong><span>Physical book titles</span></div>
            <div className="workspace-metric"><strong>{pendingRequests}</strong><span>Requests to review</span></div>
            <div className="workspace-metric"><strong>{availableCopies}</strong><span>Available copies</span></div>
          </div>

          <div className="workspace-section-heading">
            <div><span className="eyebrow">WORKSPACE</span><h3>What would you like to manage?</h3></div>
            <p>Choose a workspace to get started.</p>
          </div>

          <div className="workspace-module-grid" aria-label="Librarian workspaces">
            {MODULES.map(item => (
              <button
                key={item.id}
                className={"workspace-module workspace-module--" + item.tone}
                type="button"
                onClick={() => openModule(item.id)}
                aria-label={"Open " + item.title}
              >
                <span className="workspace-module-top">
                  <span className="workspace-module-icon" aria-hidden="true">{item.icon}</span>
                  {item.countKey ? <span className="workspace-module-count">{moduleCounts[item.countKey]}</span> : null}
                </span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
                <span className="workspace-module-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="workspace-panel">
          <div className="workspace-panel-heading">
            <button className="workspace-back" type="button" onClick={returnHome}>
              <span aria-hidden="true">←</span> Overview
            </button>
            <div>
              <h2>{MODULE_TITLES[tab]}</h2>
              <p>AMG Library staff workspace</p>
            </div>
          </div>

          <BorrowRequestsTab active={tab === "borrowRequestsTab"} />
          <PendingLearnersTab active={tab === "pendingLearnersTab"} />
          <AllLearnersTab active={tab === "allLearnersTab"} onViewCard={setCardMember} />
          <BooksTab active={tab === "booksAdminTab"} />
          <AttendanceTab active={tab === "attendanceTab"} />
          <EbooksTab active={tab === "ebooksTab"} />
          <NewsAdminTab active={tab === "newsAdminTab"} />
          <StatisticsTab active={tab === "statisticsTab"} />
        </div>
      )}

      <CardModal member={cardMember} onClose={() => setCardMember(null)} />
    </section>
  );
}
