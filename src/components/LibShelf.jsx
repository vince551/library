import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../store/AuthProvider";
import { useLibrary } from "../store/LibraryProvider";
import { BOOK_CATEGORIES } from "../lib/format";

const starKey = uid => "amg_starred_" + (uid || "guest");
function readStars(uid) {
  try { return JSON.parse(localStorage.getItem(starKey(uid)) || "[]"); }
  catch (_) { return []; }
}
const formatSize = bytes => {
  if (!bytes) return "Digital resource";
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export function LibShelf({ active, onOpenAuth }) {
  const { user, profile } = useAuth();
  const { books, ebooks, requestBook, resolveEbookUrl, downloadEbook } = useLibrary();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [format, setFormat] = useState("All");
  const [stars, setStars] = useState(() => readStars(user?.uid));
  const [selected, setSelected] = useState(null);

  useEffect(() => setStars(readStars(user?.uid)), [user?.uid]);

  const toggleStar = id => setStars(current => {
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    try { localStorage.setItem(starKey(user?.uid), JSON.stringify(next)); } catch (_) {}
    return next;
  });

  const items = useMemo(() => [
    ...books.map(book => ({ ...book, catalogueType:"physical", formatLabel:"Physical book" })),
    ...ebooks.map(book => ({ ...book, catalogueType:"ebook", formatLabel:"E-book" }))
  ], [books, ebooks]);

  const categoryOptions = useMemo(() => [...new Set([...BOOK_CATEGORIES, ...items.map(item => item.category).filter(Boolean)])], [items]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      const text = [item.title, item.author, item.category, item.description, item.isbn].join(" ").toLowerCase();
      const matchesSearch = !needle || text.includes(needle);
      const matchesCategory = category === "All" || category === "Starred" || item.category === category;
      const matchesStar = category !== "Starred" || stars.includes(item.id);
      const matchesFormat = format === "All" || item.catalogueType === format;
      return matchesSearch && matchesCategory && matchesStar && matchesFormat;
    });
  }, [items, search, category, stars, format]);

  const isEpub = book => String(book?.fileType || "").toLowerCase().includes("epub") || /\.epub$/i.test(book?.fileName || "");

  const openEbook = async book => {
    if (!user) { onOpenAuth?.("login"); return; }
    if (isEpub(book)) {
      await downloadEbook(book);
      return;
    }
    const preview = window.open("about:blank", "_blank");
    if (!preview) return;
    const url = await resolveEbookUrl(book);
    if (url) preview.location.href = url;
    else preview.close();
  };

  const requestPhysical = book => {
    if (!user) { onOpenAuth?.("login"); return; }
    if (!(profile?.isApproved ?? profile?.is_approved)) {
      onOpenAuth?.("login");
      return;
    }
    void requestBook(book.id);
  };

  return (
    <section id="libShelfSection" className={"section" + (active ? " active" : "")}>
      <div className="section-header catalogue-heading">
        <p className="eyebrow">AMG LIBRARY CATALOGUE</p>
        <h2>Find Your Next Read</h2>
        <p>Explore physical books and digital reading resources curated by the AMG Library team.</p>
        <div className="catalogue-summary" aria-live="polite">
          <span><strong>{books.length}</strong> physical titles</span>
          <span><strong>{ebooks.length}</strong> e-books</span>
          <span><strong>{items.length}</strong> resources</span>
        </div>
      </div>

      <div className="catalogue-toolbar">
        <label className="catalogue-search">
          <span className="sr-only">Search the catalogue</span>
          <span aria-hidden="true">⌕</span>
          <input
            id="searchInput"
            type="search"
            placeholder="Search title, author, ISBN or topic…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <label className="catalogue-filter">
          <span className="sr-only">Filter by category</span>
          <select id="categoryFilter" value={category} onChange={event => setCategory(event.target.value)}>
            <option value="All">All categories</option>
            <option value="Starred">Saved favourites</option>
            {categoryOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div className="catalogue-format-filter" role="group" aria-label="Filter by format">
          {[
            ["All", "All resources"],
            ["physical", "Print books"],
            ["ebook", "E-books"]
          ].map(([value, label]) => (
            <button key={value} type="button" className={format === value ? "active" : ""} aria-pressed={format === value} onClick={() => setFormat(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="catalogue-results-line">
        <span>{visible.length} {visible.length === 1 ? "resource" : "resources"} found</span>
        {(search || category !== "All" || format !== "All") ? (
          <button type="button" onClick={() => { setSearch(""); setCategory("All"); setFormat("All"); }}>Clear filters</button>
        ) : <span>Updated by the librarian</span>}
      </div>

      <div id="bookGrid" className="book-grid catalogue-grid">
        {visible.length === 0 ? (
          <div className="catalogue-empty">
            <span className="catalogue-empty-mark" aria-hidden="true">AMG</span>
            <h3>{items.length ? "No matching resources" : "Your next read is on its way"}</h3>
            <p>{items.length ? "Try another title, author, category or format." : "The librarian has not published any books or e-books yet. Once resources are added to the catalogue, they will appear here."}</p>
            {(search || category !== "All" || format !== "All") ? <button className="btn btn-outline" type="button" onClick={() => { setSearch(""); setCategory("All"); setFormat("All"); }}>Reset filters</button> : null}
          </div>
        ) : visible.map(item => {
          const isEbook = item.catalogueType === "ebook";
          const available = Math.max(0, Number(item.available || 0));
          const starred = stars.includes(item.id);
          const approved = Boolean(profile?.isApproved ?? profile?.is_approved);
          return (
            <article key={item.id} className={"book-card catalogue-card" + (isEbook ? " is-ebook" : "")}>
              <div className="book-cover catalogue-cover">
                {item.coverUrl ? <img src={item.coverUrl} alt={"Cover of " + item.title} loading="lazy" /> : (
                  <span className="catalogue-cover-placeholder"><b>{isEbook ? "E-BOOK" : "AMG"}</b><small>{(item.title || "Library resource").slice(0, 42)}</small></span>
                )}
                <span className="catalogue-format-badge">{isEbook ? "DIGITAL" : "PRINT"}</span>
                <button className="star-btn" type="button" aria-label={starred ? "Remove favourite" : "Save to favourites"} aria-pressed={starred} onClick={() => toggleStar(item.id)}>{starred ? "★" : "☆"}</button>
              </div>
              <div className="book-details">
                <span className="book-category">{item.category || "General reading"}</span>
                <h3 className="book-title">{item.title}</h3>
                <p className="book-author">{isEbook ? "Digital edition" : "by " + (item.author || "Unknown author")}</p>
                <p className="book-description">{item.description || (isEbook ? "A digital reading resource from AMG Library." : "A physical title in the AMG Library collection.")}</p>
                <p className="book-stock">{isEbook ? "PDF / EPUB · " + formatSize(item.fileSize) : available + " of " + Number(item.quantity || 0) + " copies available"}</p>
                <div className="book-actions">
                  <button className="btn btn-primary" type="button" onClick={() => setSelected(item)}>Details</button>
                  {isEbook ? (
                    <button className="btn btn-outline" type="button" onClick={() => void openEbook(item)}>{user ? (isEpub(item) ? "Download EPUB" : "Read PDF") : "Sign in to read"}</button>
                  ) : (
                    <button className="btn btn-outline" type="button" disabled={available < 1 || (user && !approved)} title={!user ? "Sign in to request this book" : !approved ? "Await librarian approval" : available < 1 ? "No copies currently available" : "Request this book"} onClick={() => requestPhysical(item)}>Request book</button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selected ? (
        <div className="catalogue-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="catalogue-detail-modal" role="dialog" aria-modal="true" aria-labelledby="catalogueDetailTitle">
            <button className="catalogue-modal-close" type="button" aria-label="Close details" onClick={() => setSelected(null)}>×</button>
            <p className="eyebrow">{selected.catalogueType === "ebook" ? "DIGITAL RESOURCE" : "PHYSICAL COLLECTION"}</p>
            <h2 id="catalogueDetailTitle">{selected.title}</h2>
            <p className="catalogue-detail-author">{selected.author ? "by " + selected.author : selected.fileName || "AMG Library resource"}</p>
            <p>{selected.description || "A resource selected for the AMG Library community."}</p>
            <dl>
              <div><dt>Category</dt><dd>{selected.category || "General"}</dd></div>
              <div><dt>Format</dt><dd>{selected.catalogueType === "ebook" ? "E-book" : "Physical book"}</dd></div>
              {selected.isbn ? <div><dt>ISBN</dt><dd>{selected.isbn}</dd></div> : null}
              {selected.catalogueType === "physical" ? <div><dt>Available copies</dt><dd>{selected.available} / {selected.quantity}</dd></div> : <div><dt>File</dt><dd>{selected.fileName || "Digital resource"}</dd></div>}
            </dl>
            <div className="book-actions">
              {selected.catalogueType === "ebook" ? <button className="btn btn-primary" type="button" onClick={() => void openEbook(selected)}>{isEpub(selected) ? "Download EPUB" : "Read PDF"}</button> : <button className="btn btn-primary" type="button" disabled={Number(selected.available) < 1} onClick={() => requestPhysical(selected)}>Request book</button>}
              <button className="btn btn-outline" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}