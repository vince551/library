import { useRef, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";
import { MAX_EBOOK_BYTES, MAX_IMAGE_BYTES } from "../../lib/format";
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
      window.alert("Choose an e-book no larger than 30 MB.");
      return;
    }
    const coverFile = form.get("cover");
    if (coverFile instanceof File && coverFile.size) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(coverFile.type) || coverFile.size > MAX_IMAGE_BYTES) {
        window.alert("Cover images must be JPEG, PNG or WebP and no larger than 5 MB.");
        return;
      }
    }
    setBusy(true);
    const ok = await uploadEbook({
      title:String(form.get("title") || "").trim(),
      author:String(form.get("author") || "").trim(),
      category:String(form.get("category") || "").trim(),
      description:String(form.get("description") || "").trim(),
      coverFile:coverFile instanceof File && coverFile.size ? coverFile : null,
      file
    });
    setBusy(false);
    if (ok) {
      formRef.current?.reset();
      setFileName("");
    }
  };

  const remove = book => {
    if (window.confirm("Permanently remove “" + book.title + "” from the AMG Library catalogue?")) void removeEbook(book);
  };

  const open = async book => {
    const preview = window.open("about:blank", "_blank");
    const url = await resolveEbookUrl(book);
    if (url && preview) preview.location.href = url;
    else if (preview) preview.close();
  };

  return (
    <div id="ebooksTab" className={"tab-content" + (active ? " active" : "")}>
      <h3>Add an e-book</h3>
      <p className="muted">Publish PDF and EPUB reading resources for members. Files are stored privately in Supabase Storage; catalogue details remain in Neon.</p>
      <div className="notice notice-success">E-book files and optional covers are stored in the private AMG Library bucket. Secure, temporary links are generated when a reader opens a file.</div>
      <form id="ebookForm" ref={formRef} className="form-grid" onSubmit={submit}>
        <label>Book title<input name="title" required maxLength="160" placeholder="Enter the e-book title" /></label>
        <label>Author<input name="author" required maxLength="255" placeholder="Enter the author's name" /></label>
        <label>Category<input name="category" required maxLength="80" placeholder="e.g. Primary, Science, Fiction" /></label>
        <label className="full-span">Description (optional)<textarea name="description" rows="3" maxLength="500" placeholder="A short description for readers" /></label>
        <label className="full-span ebook-file-picker">
          <span>PDF or EPUB file</span>
          <input name="file" type="file" accept=".pdf,.epub,application/pdf,application/epub+zip" required onChange={event => setFileName(event.target.files?.[0]?.name || "")} />
          <small>{fileName ? "Selected: " + fileName : "Maximum 30 MB · PDF or EPUB"}</small>
        </label>
        <label className="full-span ebook-file-picker">
          <span>Cover image (optional)</span>
          <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" />
          <small>JPEG, PNG or WebP · maximum 5 MB</small>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Uploading to library…" : "Upload e-book"}</button>
      </form>

      <div id="ebooksList" className="stack-list top-gap">
        <h3>Published e-books <span className="muted">({ebooks.length})</span></h3>
        {ebooks.length === 0 ? <p className="muted">No e-books yet. Add the first digital title above.</p> : null}
        {ebooks.map(book => (
          <article key={book.id} className="stack-item ebook-admin-item">
            <div>
              <h4>{book.title}</h4>
              <p>{(book.author || "Unknown author") + " · " + (book.category || "General") + " · " + (book.fileName || "E-book") + " · " + prettySize(book.fileSize || 0)}</p>
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
