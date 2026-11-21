import { useLibrary } from "../../store/LibraryProvider";

const tabClass = (active) => "tab-content" + (active ? " active" : "");

const memberStatus = (member) => {
  const status = String(member.status || member.membershipStatus || "").toLowerCase();
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  if (status === "rejected") return "Rejected";
  if (status === "pending") return "Pending";
  return "Unknown";
};

export function BorrowRequestsTab({ active }) {
  const { requests, loans, processRequest, returnLoan } = useLibrary();

  return (
    <div id="borrowRequestsTab" className={tabClass(active)}>
      <h3>Borrowing requests</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr><th>Learner</th><th>Book</th><th>Category</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody id="borrowRequestsTable">
            {requests.length === 0 ? (
              <tr><td colSpan="5">No borrowing requests are available.</td></tr>
            ) : requests.map(request => {
              const loanId = request.loan_id ?? request.loanId;
              const loan = loanId ? loans.find(item => item.id === loanId) : null;
              return (
                <tr key={request.id}>
                  <td>{request.user_name ?? request.userName}</td>
                  <td>{request.book_title ?? request.bookTitle}</td>
                  <td>{request.book_category ?? request.bookCategory ?? "—"}</td>
                  <td>{request.status}</td>
                  <td>
                    {request.status === "Pending" ? (
                      <>
                        <button className="btn btn-sm btn-success" type="button" onClick={() => processRequest(request.id, "Approved")}>Accept</button>
                        <button className="btn btn-sm btn-danger" type="button" onClick={() => processRequest(request.id, "Declined")}>Decline</button>
                      </>
                    ) : request.status === "Approved" && loan && loan.status === "Borrowed" ? (
                      <button className="btn btn-sm btn-outline" type="button" onClick={() => returnLoan(request.id, loanId)}>Return book</button>
                    ) : "Processed"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PendingLearnersTab({ active }) {
  const { members, reviewLearner } = useLibrary();
  const pending = members.filter(member => member.status === "pending");

  const decide = (member, decision) => {
    const name = member.full_name || "this member";
    const action = decision === "Approved" ? "approve" : "reject";
    if (!window.confirm(`Are you sure you want to ${action} ${name}'s membership?`)) return;
    void reviewLearner(member.id, decision);
  };

  return (
    <div id="pendingLearnersTab" className={tabClass(active)}>
      <h3>Membership applications awaiting approval</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>Applied</th><th>Actions</th></tr>
          </thead>
          <tbody id="pendingLearnersTable">
            {pending.length === 0 ? (
              <tr><td colSpan="5">There are no pending membership applications.</td></tr>
            ) : pending.map(member => (
              <tr key={member.id}>
                <td>{member.full_name}</td>
                <td>{member.email}</td>
                <td>{member.phone || "—"}</td>
                <td>{member.created_at ? new Date(member.created_at).toLocaleDateString("en-KE") : "—"}</td>
                <td>
                  <button className="btn btn-sm btn-success" type="button" onClick={() => decide(member, "Approved")}>Approve</button>
                  <button className="btn btn-sm btn-danger" type="button" onClick={() => decide(member, "Denied")}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AllLearnersTab({ active, onViewCard }) {
  const { members, changeMemberStatus } = useLibrary();

  const updateStatus = (member) => {
    const action = member.status === "suspended" ? "reactivate" : "suspend";
    if (!window.confirm(`Are you sure you want to ${action} ${member.full_name}'s account?`)) return;
    void changeMemberStatus(member);
  };

  return (
    <div id="allLearnersTab" className={tabClass(active)}>
      <h3>Registered members</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr><th>Membership #</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody id="allLearnersTable">
            {members.length === 0 ? (
              <tr><td colSpan="6">No member accounts have been registered yet.</td></tr>
            ) : members.map(member => (
              <tr key={member.id}>
                <td>{member.membership_number || "Not issued"}</td>
                <td>{member.full_name}</td>
                <td>{member.email}</td>
                <td>{member.phone || "—"}</td>
                <td>{memberStatus(member)}</td>
                <td>
                  {member.status === "active" ? (
                    <>
                      <button className="btn btn-sm btn-outline" type="button" onClick={() => onViewCard(member)}>View card</button>
                      <button className="btn btn-sm btn-danger" type="button" onClick={() => updateStatus(member)}>Suspend</button>
                    </>
                  ) : member.status === "suspended" ? (
                    <button className="btn btn-sm btn-success" type="button" onClick={() => updateStatus(member)}>Reactivate</button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
