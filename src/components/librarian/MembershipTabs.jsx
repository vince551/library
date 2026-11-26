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
  const { requests, processRequest } = useLibrary();

  return (
    <div id="borrowRequestsTab" className={tabClass(active)}>
      <h3>Borrowing requests</h3>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr><th>Request #</th><th>Learner</th><th>Book</th><th>Category</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody id="borrowRequestsTable">
            {requests.length === 0 ? (
              <tr><td colSpan="6">No borrowing requests are available.</td></tr>
            ) : requests.map(request => {
              return (
                <tr key={request.id}>
                  <td data-label="Request #"><strong>{request.request_number || "—"}</strong></td>
                  <td data-label="Learner">{request.user_name ?? request.userName}</td>
                  <td data-label="Book">{request.book_title ?? request.bookTitle}</td>
                  <td data-label="Category">{request.book_category ?? request.bookCategory ?? "—"}</td>
                  <td data-label="Status">{request.status}</td>
                  <td data-label="Actions">
                    {String(request.status).toLowerCase() === "pending" ? (
                      <>
                        <button className="btn btn-sm btn-success" type="button" onClick={() => processRequest(request.id, "Approved")}>Accept</button>
                        <button className="btn btn-sm btn-danger" type="button" onClick={() => processRequest(request.id, "Declined")}>Decline</button>
                      </>
                    ) : String(request.status).toLowerCase() === "approved" ? (
                      <span>Approved · Awaiting physical issue</span>
                    ) : String(request.status).toLowerCase() === "fulfilled" ? (
                      <span>Issued</span>
                    ) : String(request.status).toLowerCase() === "declined" ? (
                      <span>Declined</span>
                    ) : (
                      <span>Processed</span>
                    )}
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
            <tr><th>Name</th><th>Email</th><th>Phone</th><th>School</th><th>Education level</th><th>Study level</th><th>Gender</th><th>Guardian</th><th>Guardian phone</th><th>Applied</th><th>Actions</th></tr>
          </thead>
          <tbody id="pendingLearnersTable">
            {pending.length === 0 ? (
              <tr><td colSpan="11">There are no pending membership applications.</td></tr>
            ) : pending.map(member => (
              <tr key={member.id}>
                <td data-label="Name">{member.full_name}</td>
                <td data-label="Email">{member.email}</td>
                <td data-label="Phone">{member.phone || "—"}</td>
                <td data-label="School">{member.school || "—"}</td>
                <td data-label="Education level">{member.edu_level || "—"}</td>
                <td data-label="Study level">{member.study_level || "—"}</td>
                <td data-label="Gender">{member.gender || "—"}</td>
                <td data-label="Guardian">{member.guardian_name ? `${member.guardian_name}${member.guardian_relation ? " · " + member.guardian_relation : ""}` : "—"}</td>
                <td data-label="Guardian phone">{member.guardian_phone || "—"}</td>
                <td data-label="Applied">{member.created_at ? new Date(member.created_at).toLocaleDateString("en-KE") : "—"}</td>
                <td data-label="Actions">
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
            <tr><th>Membership #</th><th>Name</th><th>Email</th><th>Phone</th><th>School</th><th>Education level</th><th>Study level</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody id="allLearnersTable">
            {members.length === 0 ? (
              <tr><td colSpan="9">No member accounts have been registered yet.</td></tr>
            ) : members.map(member => (
              <tr key={member.id}>
                <td data-label="Membership #">{member.membership_number || "Not issued"}</td>
                <td data-label="Name">{member.full_name}</td>
                <td data-label="Email">{member.email}</td>
                <td data-label="Phone">{member.phone || "—"}</td>
                <td data-label="School">{member.school || "—"}</td>
                <td data-label="Education level">{member.edu_level || "—"}</td>
                <td data-label="Study level">{member.study_level || "—"}</td>
                <td data-label="Status">{memberStatus(member)}</td>
                <td data-label="Actions">
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
