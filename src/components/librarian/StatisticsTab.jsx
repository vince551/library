import { useMemo, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";

const COLORS = ["#087f5b", "#3b82a0", "#8b76b5", "#d29a45", "#c66f79", "#71858d"];

function tally(items, keyOf) {
  const counts = {};
  items.forEach(item => {
    const key = String(keyOf(item) || "Unspecified");
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function shortDay(value) {
  return new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric" }).format(value);
}

function DonutChart({ title, entries }) {
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  let cursor = 0;
  const stops = entries.map(([, value], index) => {
    const start = cursor;
    cursor += total ? Math.max(0, Number(value) || 0) / total * 100 : 0;
    return COLORS[index % COLORS.length] + " " + start + "% " + cursor + "%";
  });
  return (
    <section className="insight-panel">
      <div className="insight-panel-heading"><div><span className="insight-kicker">DISTRIBUTION</span><h4>{title}</h4></div><span className="insight-total">{total}</span></div>
      <div className="insight-donut-layout">
        <div className="insight-donut" role="img" aria-label={title + ": " + entries.map(([label, value]) => label + " " + value).join(", ")} style={{ background: total ? "conic-gradient(" + stops.join(",") + ")" : "#e9efeb" }}>
          <div><strong>{total}</strong><small>Total</small></div>
        </div>
        <div className="insight-legend">
          {entries.length ? entries.map(([label, value], index) => (
            <div className="insight-legend-row" key={label}><i style={{ background: COLORS[index % COLORS.length] }} /><span>{label}</span><strong>{value}</strong></div>
          )) : <p className="insight-empty">No records yet.</p>}
        </div>
      </div>
    </section>
  );
}

function BarChart({ entries }) {
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  return (
    <div className="insight-bars">
      {entries.length === 0 ? <p className="insight-empty">No records available yet.</p> : entries.map(([label, value], index) => (
        <div className="insight-bar-row" key={label}>
          <span className="insight-bar-label" title={label}>{label}</span>
          <div className="insight-bar-track"><span style={{ width: (Math.max(0, Number(value) || 0) / max * 100) + "%", background: COLORS[index % COLORS.length] }} /></div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function csvCell(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

export function StatisticsTab({ active }) {
  const { members, books, requests, loans, attendance, attendanceSummary, ebooks } = useLibrary();
  const [period, setPeriod] = useState(30);
  const statusOf = item => String(item.status || "").trim().toLowerCase();
  const pendingRequests = requests.filter(item => statusOf(item) === "pending").length;
  const approvedRequests = requests.filter(item => statusOf(item) === "approved").length;
  const declinedRequests = requests.filter(item => ["declined", "denied"].includes(statusOf(item))).length;
  const fulfilledRequests = requests.filter(item => statusOf(item) === "fulfilled").length;
  const activeLoans = loans.filter(item => statusOf(item) === "active").length;
  const overdueLoans = loans.filter(item => statusOf(item) === "overdue").length;
  const totalCopies = books.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const availableCopies = books.reduce((sum, item) => sum + Number(item.available || 0), 0);
  const activeMembers = members.filter(item => statusOf(item) === "active").length;
  const pendingMembers = members.filter(item => statusOf(item) === "pending").length;
  const checkedOutCopies = Math.max(0, totalCopies - availableCopies);
  const inside = Number(attendanceSummary?.currentlyInside) || attendance.filter(item => statusOf(item) === "in library").length;
  const attendanceCount = Number(attendanceSummary?.totalRecords) || attendance.length;

  const summary = [
    ["Registered members", members.length, "Membership"],
    ["Active members", activeMembers, "Membership"],
    ["Pending approvals", pendingMembers, "Membership"],
    ["Physical titles", books.length, "Collection"],
    ["Digital titles", ebooks.length, "Collection"],
    ["Copies available", availableCopies, "Inventory"],
    ["Active loans", activeLoans, "Circulation"],
    ["Overdue loans", overdueLoans, "Circulation"],
    ["Pending requests", pendingRequests, "Circulation"],
    ["Currently in library", inside, "Visits"],
    ["Attendance scans", attendanceCount, "Visits"]
  ];

  const requestMix = [
    ["Pending", pendingRequests], ["Approved", approvedRequests],
    ["Declined", declinedRequests], ["Fulfilled", fulfilledRequests],
    ["Other", Math.max(0, requests.length - pendingRequests - approvedRequests - declinedRequests - fulfilledRequests)]
  ].filter(([, value]) => value > 0);
  const memberMix = [
    ["Active", activeMembers], ["Pending", pendingMembers],
    ["Other", Math.max(0, members.length - activeMembers - pendingMembers)]
  ].filter(([, value]) => value > 0);
  const inventoryMix = [
    ["Available", availableCopies],
    ["Unavailable / on loan", checkedOutCopies]
  ].filter(([, value]) => value > 0);

  const borrowingDays = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: period }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (period - index - 1));
      return { key: localDateKey(date), label: shortDay(date), count: 0 };
    });
    const byDate = new Map(days.map(day => [day.key, day]));
    loans.forEach(loan => {
      const day = byDate.get(localDateKey(loan.issued_at || loan.issuedAt));
      if (day) day.count += 1;
    });
    return days.map(day => [day.label, day.count]);
  }, [loans, period]);

  const topBooks = tally(loans, loan => loan.book_title || loan.bookTitle).slice(0, 6);
  const topBorrowers = tally(loans, loan => loan.member_name || loan.memberName).slice(0, 5);
  const stockAlerts = books
    .map(book => ({ ...book, stockAvailable: Number(book.available || 0), stockTotal: Number(book.quantity || 0) }))
    .filter(book => book.stockAvailable <= 1)
    .sort((a, b) => a.stockAvailable - b.stockAvailable || String(a.title).localeCompare(String(b.title)))
    .slice(0, 8);
  const overdueList = loans.filter(loan => statusOf(loan) === "overdue").slice(0, 8);

  const exportReport = () => {
    const rows = [
      ["AMG Library report", "Generated", new Date().toISOString()],
      [],
      ["Metric", "Value"],
      ...summary.map(([label, value]) => [label, value]),
      [],
      ["Loan number", "Book", "Member", "Membership number", "Issued", "Due", "Status"],
      ...loans.map(loan => [loan.loan_number || loan.loanNumber, loan.book_title || loan.bookTitle, loan.member_name || loan.memberName, loan.membership_number || loan.membershipNumber, loan.issued_at || loan.issuedAt, loan.due_at || loan.dueAt, loan.status])
    ];
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "amg-library-report-" + localDateKey(new Date()) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="statisticsTab" className={"tab-content insight-dashboard" + (active ? " active" : "")}>
      <header className="insight-header">
        <div><span className="insight-kicker">AMG LIBRARY · OVERVIEW</span><h3>Library insights</h3><p>Operational performance, borrowing activity and collection health.</p></div>
        <div className="insight-header-actions">
          <span className="insight-live"><i /> Live database snapshot</span>
          <button type="button" className="insight-export-button" onClick={exportReport}>Export report</button>
        </div>
      </header>
      <div className="insight-summary-grid">
        {summary.map(([label, value, group]) => (
          <article className="insight-summary-card" key={label}>
            <span>{group}</span><strong>{value}</strong><small>{label}</small>
          </article>
        ))}
      </div>
      <div className="insight-chart-grid">
        <DonutChart title="Membership status" entries={memberMix} />
        <DonutChart title="Borrow request status" entries={requestMix} />
        <DonutChart title="Physical copy availability" entries={inventoryMix} />
        <section className="insight-panel">
          <div className="insight-panel-heading"><div><span className="insight-kicker">COLLECTION</span><h4>Physical book categories</h4></div></div>
          <BarChart entries={tally(books, item => item.category).slice(0, 6)} />
        </section>
      </div>
      <section className="insight-panel insight-wide-panel">
        <div className="insight-panel-heading insight-period-heading">
          <div><span className="insight-kicker">CIRCULATION</span><h4>Borrowing activity</h4><p>New loans by issue date, based on the latest loan records loaded.</p></div>
          <div className="insight-period-switch" aria-label="Borrowing activity period">
            {[7, 30, 90].map(value => <button key={value} type="button" className={period === value ? "is-active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value} days</button>)}
          </div>
        </div>
        <BarChart entries={borrowingDays} />
      </section>
      <div className="insight-chart-grid insight-secondary-grid">
        <section className="insight-panel">
          <div className="insight-panel-heading"><div><span className="insight-kicker">POPULARITY</span><h4>Most borrowed titles</h4></div></div>
          <BarChart entries={topBooks} />
        </section>
        <section className="insight-panel">
          <div className="insight-panel-heading"><div><span className="insight-kicker">COMMUNITY</span><h4>Frequent borrowers</h4></div></div>
          <BarChart entries={topBorrowers} />
        </section>
      </div>
      <div className="insight-chart-grid insight-secondary-grid">
        <section className="insight-panel">
          <div className="insight-panel-heading"><div><span className="insight-kicker">INVENTORY ATTENTION</span><h4>Low-stock titles</h4></div><span className="insight-total">{stockAlerts.length}</span></div>
          {stockAlerts.length ? <div className="insight-alert-list">{stockAlerts.map(book => <div className="insight-alert-row" key={book.id}><span><strong>{book.title}</strong><small>{book.author || "Unknown author"}</small></span><b className={book.stockAvailable === 0 ? "is-empty" : ""}>{book.stockAvailable} / {book.stockTotal} available</b></div>)}</div> : <p className="insight-empty">No low-stock titles detected.</p>}
        </section>
        <section className="insight-panel">
          <div className="insight-panel-heading"><div><span className="insight-kicker">FOLLOW-UP</span><h4>Overdue loans</h4></div><span className="insight-total">{overdueLoans}</span></div>
          {overdueList.length ? <div className="insight-alert-list">{overdueList.map(loan => <div className="insight-alert-row" key={loan.id}><span><strong>{loan.book_title || "Book"}</strong><small>{loan.member_name || "Member"} · {loan.loan_number || "Loan record"}</small></span><b className="is-empty">{loan.due_at ? new Date(loan.due_at).toLocaleDateString("en-KE") : "Overdue"}</b></div>)}</div> : <p className="insight-empty">No overdue loans in the loaded records.</p>}
        </section>
      </div>
      <section className="insight-panel insight-wide-panel">
        <div className="insight-panel-heading"><div><span className="insight-kicker">VISITS</span><h4>Daily check-ins · last seven days</h4></div></div>
        <BarChart entries={(attendanceSummary?.days || []).map(day => [day.label, Number(day.visits) || 0])} />
      </section>
      <p className="insight-footnote">Figures are calculated from saved records currently loaded by the librarian workspace. Loan-based rankings and CSV exports reflect the latest 200 loan records returned by the API; attendance occupancy uses the database summary.</p>
    </div>
  );
}
