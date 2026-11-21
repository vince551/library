import { useRef, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";
import { MAX_EBOOK_BYTES } from "../../lib/format";
import { dateMillis, formatDate } from "../../lib/format";

const prettySize = bytes => bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";

export function EbooksTab({ active }) {
  const { ebooks, uploadEbook, removeEbook, resolveEbookUrl } = useLibrary();
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > MAX_EBOOK_BYTES) {
      window.alert("Choose an e-book smaller than 30 MB for this frontend preview.");
      return;
    }
    setBusy(true);
    const ok = await uploadEbook({
      title:String(form.get("title") || "").trim(),
      category:String(form.get("category") || "").trim(),
      description:String(form.get("description") || "").trim(),
      file
    });
    setBusy(false);
    if (ok) {
      formRef.current?.reset();
      setFileName("");
    }
  };

  const remove = book => {
    if (window.confirm("Remove “" + book.title + "” from the demo catalogue?")) void removeEbook(book);
  };

  const open = async book => {
    const url = await resolveEbookUrl(book);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div id="ebooksTab" className={"tab-content" + (active ? " active" : "")}>
      <h3>Add an e-book</h3>
      <p className="muted">Publish PDF and EPUB reading resources for members. E-books appear automatically in Find Your Next Read.</p>
      <div className="notice notice-info">Frontend preview only: selected files stay in this browser session. The Express API and Cloudflare R2 will handle permanent uploads when the backend is built.</div>
      <form id="ebookForm" ref={formRef} className="form-grid" onSubmit={submit}>
        <label>Book title<input name="title" required maxLength="160" placeholder="Enter the e-book title" /></label>
        <label>Category<input name="category" required maxLength="80" placeholder="e.g. Primary, Science, Fiction" /></label>
        <label className="full-span">Description (optional)<textarea name="description" rows="3" maxLength="500" placeholder="A short description for readers" /></label>
        <label className="full-span ebook-file-picker">
          <span>PDF or EPUB file</span>
          <input name="file" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" required onChange={event => setFileName(event.target.files?.[0]?.name || "")} />
          <small>{fileName ? "Selected: " + fileName : "Maximum 30 MB · PDF or EPUB"}</small>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Adding e-book…" : "Add e-book to catalogue"}</button>
      </form>

      <div id="ebooksList" className="stack-list top-gap">
        <h3>Published e-books <span className="muted">({ebooks.length})</span></h3>
        {ebooks.length === 0 ? <p className="muted">No e-books yet. Add the first digital title above.</p> : null}
        {ebooks.map(book => (
          <article key={book.id} className="stack-item ebook-admin-item">
            <div>
              <h4>{book.title}</h4>
              <p>{(book.category || "General") + " · " + (book.fileName || "E-book") + " · " + prettySize(book.fileSize || 0)}</p>
              {book.description ? <p>{book.description}</p> : null}
              <small>Added {formatDate(book.createdAt)}</small>
            </div>
            <div className="book-actions">
              <button className="btn btn-sm btn-outline" type="button" onClick={() => void open(book)}>Preview file</button>
              <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(book)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function NewsAdminTab({ active }) {
  const { announcements, events, publishNews, deletePost } = useLibrary();
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const posts = [
    ...announcements.map(item => ({ ...item, source:"announcements" })),
    ...events.map(item => ({ ...item, source:"events" }))
  ].sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const ok = await publishNews({
      type:String(form.get("type") || "announcement"),
      title:String(form.get("title") || "").trim(),
      body:String(form.get("body") || "").trim(),
      date:String(form.get("date") || "")
    });
    setBusy(false);
    if (ok) formRef.current?.reset();
  };

  const remove = post => {
    if (!window.confirm("Delete this post?")) return;
    void deletePost(post.source, post.id);
  };

  return (
    <div id="newsAdminTab" className={"tab-content" + (active ? " active" : "")}>
      <h3>Publish news or an event</h3>
      <form id="newsForm" ref={formRef} className="form-grid" onSubmit={submit}>
        <label>Type<select name="type" defaultValue="announcement"><option value="announcement">News / Announcement</option><option value="event">Event</option></select></label>
        <label>Title<input name="title" required maxLength="160" /></label>
        <label>Event date (optional)<input name="date" type="date" /></label>
        <label className="full-span">Message<textarea name="body" rows="4" required maxLength="3000"></textarea></label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish update"}</button>
      </form>
      <div id="adminNewsList" className="stack-list top-gap">
        {posts.map(post => (
          <div key={post.source + "-" + post.id} className="stack-item">
            <h4>{post.title}</h4>
            <p>{post.source === "events" ? "Event" : "Announcement"}{post.date ? " · " + formatDate(post.date) : ""}</p>
            <button className="btn btn-sm btn-danger top-gap" type="button" onClick={() => remove(post)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}