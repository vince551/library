import { useLibrary } from "../../store/LibraryProvider";
import { dateMillis, formatDate } from "../../lib/format";

const COLORS = ["#087f5b", "#3b82a0", "#8b76b5", "#d29a45", "#c66f79", "#71858d"];

function tally(items, keyOf) {
  const counts = {};
  items.forEach(item => {
    const key = String(keyOf(item) || "Unspecified");
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function BarChart({ entries }) {
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  return (
    <div className="insight-bars">
      {entries.length === 0 ? <p className="insight-empty">No records available yet.</p> : entries.map(([label, value], index) => (
        <div className="insight-bar-row" key={label}>
          <span className="insight-bar-label">{label}</span>
          <div className="insight-bar-track"><span style={{ width: (Math.max(0, Number(value) || 0) / max * 100) + "%", background: COLORS[index % COLORS.length] }} /></div>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ title, entries }) {
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  let cursor = 0;
  const stops = entries.map(([label, value], index) => {
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

export function StatisticsTab({ active }) {
  const { members, books, requests, loans, attendance, ebooks } = useLibrary();

  const pendingRequests = requests.filter(item => item.status === "Pending").length;
  const approvedRequests = requests.filter(item => item.status === "Approved").length;
  const declinedRequests = requests.filter(item => ["Declined", "Denied"].includes(item.status)).length;
  const activeLoans = loans.filter(item => item.status === "Borrowed").length;
  const totalCopies = books.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const availableCopies = books.reduce((sum, item) => sum + Number(item.available || 0), 0);
  const activeMembers = members.filter(item => String(item.status || "").toLowerCase() === "active").length;
  const pendingMembers = members.filter(item => String(item.status || "").toLowerCase() === "pending").length;
  const checkedOutCopies = Math.max(0, totalCopies - availableCopies);

  const summary = [
    ["Registered members", members.length, "Membership"],
    ["Pending approvals", pendingMembers, "Membership"],
    ["Physical titles", books.length, "Collection"],
    ["Digital titles", ebooks.length, "Collection"],
    ["Copies available", availableCopies, "Inventory"],
    ["Active loans", activeLoans, "Circulation"],
    ["Pending requests", pendingRequests, "Circulation"],
    ["Attendance records", attendance.length, "Visits"]
  ];

  const attendanceDays = Object.entries(attendance.reduce((days, record) => {
    const day = formatDate(record.checkInAt);
    if (day !== "—") days[day] = (days[day] || 0) + 1;
    return days;
  }, {})).sort((a, b) => dateMillis(a[0]) - dateMillis(b[0])).slice(-7);

  const requestMix = [
    ["Pending", pendingRequests],
    ["Approved", approvedRequests],
    ["Declined", declinedRequests],
    ["Other", Math.max(0, requests.length - pendingRequests - approvedRequests - declinedRequests)]
  ].filter(([, value]) => value > 0);

  const memberMix = [
    ["Active", activeMembers],
    ["Pending", pendingMembers],
    ["Other", Math.max(0, members.length - activeMembers - pendingMembers)]
  ].filter(([, value]) => value > 0);

  const inventoryMix = [
    ["Available", availableCopies],
    ["On loan / unavailable", checkedOutCopies]
  ].filter(([, value]) => value > 0);

  return (
    <div id="statisticsTab" className={"tab-content insight-dashboard" + (active ? " active" : "")}>
      <header className="insight-header">
        <div><span className="insight-kicker">AMG LIBRARY · OVERVIEW</span><h3>Library insights</h3><p>A practical snapshot of membership, collection health and daily activity.</p></div>
        <span className="insight-live"><i /> Based on current records</span>
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
          <div className="insight-panel-heading"><div><span className="insight-kicker">COLLECTION</span><h4>Popular book categories</h4></div></div>
          <BarChart entries={tally(books, item => item.category).slice(0, 6)} />
        </section>
      </div>

      <section className="insight-panel insight-wide-panel">
        <div className="insight-panel-heading"><div><span className="insight-kicker">RECENT ACTIVITY</span><h4>Attendance trend · latest seven recorded days</h4></div></div>
        <BarChart entries={attendanceDays} />
      </section>
      <p className="insight-footnote">These figures are operational estimates from the records currently available to the staff workspace. They are intended to support day-to-day planning, not audited reporting.</p>
    </div>
  );
}
