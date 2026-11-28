import { useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { useAuth } from "../store/AuthProvider";
import { useLibrary } from "../store/LibraryProvider";
import { useToast } from "../store/ToastProvider";
import { MemberCard } from "./MemberCard";
import { dateMillis, formatDate } from "../lib/format";

export function MemberProfile({ active }) {
  const { user, profile, updatePhoto } = useAuth();
  const { myRequests, myLoans, refreshMember } = useLibrary();
  const { showToast } = useToast();
  const cardRef = useRef(null);

  useEffect(() => {
    if (active) void refreshMember();
  }, [active, refreshMember]);

  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      // Wait for fonts and profile photos before taking the export snapshot.
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        [...cardRef.current.querySelectorAll("img")].map(image =>
          typeof image.decode === "function" ? image.decode().catch(() => {}) : Promise.resolve()
        )
      );

      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        windowWidth: 1200,
        windowHeight: 1000,
        scrollX: 0,
        scrollY: 0,
        onclone: clonedDocument => {
          // Render the card at its print width, independent of the phone's responsive layout.
          clonedDocument.documentElement.setAttribute("data-theme", "light");
          const exportStyles = clonedDocument.createElement("style");
          exportStyles.textContent = `
            .amg-card-pair {
              display: grid !important;
              grid-template-columns: minmax(0, 1fr) !important;
              gap: 18px !important;
              width: 860px !important;
              min-width: 860px !important;
              max-width: 860px !important;
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box !important;
              background: #ffffff !important;
            }
            .amg-card-pair .amg-id-card {
              display: grid !important;
              grid-template-columns: 34% minmax(0, 1fr) !important;
              width: 860px !important;
              min-width: 860px !important;
              max-width: 860px !important;
              height: 270px !important;
              min-height: 270px !important;
              max-height: 270px !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
              transform: none !important;
              break-inside: avoid !important;
            }
            .amg-card-pair .amg-id-brand-panel { min-width: 0 !important; box-sizing: border-box !important; }
            .amg-card-pair .amg-id-front-content {
              display: grid !important;
              grid-template-columns: minmax(0, 1fr) 112px !important;
              grid-template-rows: minmax(0, 1fr) auto !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
            }
            .amg-card-pair .amg-id-qr-block {
              grid-column: 2 !important;
              grid-row: 1 / 3 !important;
              width: 112px !important;
              min-width: 112px !important;
            }
            .amg-card-pair .amg-id-person { min-width: 0 !important; flex-wrap: nowrap !important; }
            .amg-card-pair .amg-id-details { min-width: 0 !important; overflow-wrap: anywhere !important; }
            .amg-card-pair .amg-id-front-barcode { grid-column: 1 / -1 !important; min-width: 0 !important; }
            .amg-card-pair .amg-id-back { display: block !important; }
            .amg-card-pair .amg-id-back-content {
              display: flex !important;
              flex-direction: row !important;
              justify-content: space-between !important;
              align-items: flex-start !important;
              gap: 18px !important;
              min-width: 0 !important;
            }
            .amg-card-pair .amg-id-back-content > section:first-child { flex: 1 1 auto !important; min-width: 0 !important; }
            .amg-card-pair .amg-id-back-code { flex: 0 0 190px !important; width: 190px !important; }
            .amg-card-pair .amg-id-back header,
            .amg-card-pair .amg-id-back footer { display: flex !important; flex-direction: row !important; justify-content: space-between !important; align-items: center !important; flex-wrap: nowrap !important; }
            .amg-card-pair * { animation: none !important; transition: none !important; }
          `;
          clonedDocument.head.appendChild(exportStyles);
        }
      });

      const link = document.createElement("a");
      link.download = "AMG-Library-" + (profile?.libraryNumber || "Member") + ".png";
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Member card export failed:", error);
      showToast("Could not download the card. Please try again after your profile photo has loaded.", "error");
    }
  };

  const items = [
    ...myRequests.map(item => ({ ...item, kind: "Request" })),
    ...myLoans.map(item => ({ ...item, kind: "Loan" }))
  ].sort((a, b) => dateMillis(b.created_at ?? b.createdAt) - dateMillis(a.created_at ?? a.createdAt));

  const stats = [
    ["Requests", myRequests.length],
    ["Approved", myRequests.filter(item => String(item.status).toLowerCase() === "approved").length],
    ["Active loans", myLoans.filter(item => ["active", "overdue"].includes(String(item.status).toLowerCase())).length],
    ["Returned", myLoans.filter(item => String(item.status).toLowerCase() === "returned").length]
  ];

  return (
    <section id="profileSection" className={"section" + (active ? " active" : "")}>
      <div className="section-header">
        <h2>My learner profile</h2>
        <p>Your membership information, card, requests and loan history.</p>
      </div>

      {user && profile && !profile.isApproved && profile.membershipStatus !== "rejected" ? (
        <div id="pendingApprovalNotice" className="notice notice-warning">
          Your registration is awaiting librarian approval. You can explore the catalogue while you wait.
        </div>
      ) : null}
      {user && profile?.membershipStatus === "rejected" ? (
        <div id="membershipDecisionNotice" className="notice notice-warning">
          Your membership application was denied. Please contact the librarian for assistance.
        </div>
      ) : null}

      <div className="profile-layout">
        <div className="card-preview-wrapper">
          <MemberCard ref={cardRef} profile={profile} />
          <div className="card-actions">
            <button className="btn btn-primary" type="button" onClick={downloadCard}>Download both sides</button>
            <label className="btn btn-outline upload-label">
              Update photo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void updatePhoto(file);
                }}
              />
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="notice notice-success">
            <strong>Your 3-digit login ID: {profile?.loginCode || "Loading…"}</strong>
            <p className="muted">Use this ID, your full name or your email with your password to sign in. This is separate from your library membership number.</p>
          </div>
          <h3>My requests and loans</h3>
          <div id="myLoansList" className="stack-list">
            {items.length === 0 ? (
              <p className="muted">No requests or loans yet.</p>
            ) : items.map(item => (
              <div key={item.id} className="stack-item">
                <h4>{item.book_title ?? item.bookTitle ?? "Library book"}</h4>
                <p>{item.kind} · {String(item.status || "pending").replace(/^./, value => value.toUpperCase())}</p>
                <small>{item.request_number || item.loan_number || "Reference pending"}</small>
                {(item.due_at ?? item.dueAt) ? <p>Due: {formatDate(item.due_at ?? item.dueAt)}</p> : null}
              </div>
            ))}
          </div>
          <div className="section-header top-gap"><h3>My library activity</h3></div>
          <div id="learnerStats" className="stats-grid">
            {stats.map(([label, value]) => (
              <div key={label} className="stat-card">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
