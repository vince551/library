import { useEffect, useRef, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";
import { useToast } from "../../store/ToastProvider";
import { Barcode, QrCode } from "../Barcode";
import { BOOK_CATEGORIES, MAX_IMAGE_BYTES } from "../../lib/format";

const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function BooksTab({ active }) {
  const { books, registerBook, updateBook, deleteBook, getBookCopies, addBookCopy, updateBookCopy, deleteBookCopy } = useLibrary();
  const { showToast } = useToast();
  const formRef = useRef(null);
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const editGalleryRef = useRef(null);
  const editCameraRef = useRef(null);
  const [cover, setCover] = useState({ file: null, url: "", name: "" });
  const [labels, setLabels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editCover, setEditCover] = useState(null);
  const [copiesBook, setCopiesBook] = useState(null);
  const [copies, setCopies] = useState([]);
  const [copiesBusy, setCopiesBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!copiesBook) { setCopies([]); return undefined; }
    setCopiesBusy(true);
    getBookCopies(copiesBook.id).then(result => {
      if (mounted && result) setCopies(result);
      if (mounted) setCopiesBusy(false);
    });
    return () => { mounted = false; };
  }, [copiesBook, getBookCopies]);

  const clearCover = () => {
    setCover(current => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { file: null, url: "", name: "" };
    });
    if (galleryRef.current) galleryRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const pickCover = (event, editingMode = false) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!COVER_TYPES.includes(file.type)) {
      input.value = "";
      showToast("Choose a JPEG, PNG or WebP image for the book cover.", "error");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      input.value = "";
      showToast("Book cover images must be 5 MB or smaller.", "error");
      return;
    }
    if (editingMode) {
      input.value = "";
      if (input === editGalleryRef.current && editCameraRef.current) editCameraRef.current.value = "";
      if (input === editCameraRef.current && editGalleryRef.current) editGalleryRef.current.value = "";
      setEditCover(current => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { file, url: URL.createObjectURL(file), name: file.name || "Camera photo" };
      });
      return;
    }
    if (input === galleryRef.current && cameraRef.current) cameraRef.current.value = "";
    if (input === cameraRef.current && galleryRef.current) galleryRef.current.value = "";
    setCover(current => {
      if (current.url) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file), name: file.name || "Camera photo" };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await registerBook({
      title: String(form.get("title") || "").trim(),
      author: String(form.get("author") || "").trim(),
      isbn: String(form.get("isbn") || "").trim(),
      category: String(form.get("category") || ""),
      quantity: Number(form.get("quantity")),
      description: String(form.get("description") || "").trim(),
      coverFile: cover.file
    });
    setBusy(false);
    if (!result) return;
    formRef.current?.reset();
    clearCover();
    setLabels(result);
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (busy || !editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const ok = await updateBook(editing.id, {
      title: String(form.get("title") || "").trim(),
      author: String(form.get("author") || "").trim(),
      isbn: String(form.get("isbn") || "").trim(),
      category: String(form.get("category") || ""),
      quantity: Number(form.get("quantity")),
      description: String(form.get("description") || "").trim(),
      coverFile: editCover?.file || null
    });
    setBusy(false);
    if (ok) {
      if (editCover?.url) URL.revokeObjectURL(editCover.url);
      setEditCover(null);
      setEditing(null);
    }
  };

  const remove = (book) => {
    if (!window.confirm("Permanently delete “" + book.title + "” and its unused copies? Books with any borrowing requests or loan history are protected.")) return;
    void deleteBook(book);
  };

  const manageCopies = (book) => {
    setEditing(null);
    setCopiesBook(current => current?.id === book.id ? null : book);
  };

  const addCopy = async () => {
    if (!copiesBook) return;
    const shelfLocation = window.prompt("Shelf location (optional):", "");
    if (shelfLocation === null) return;
    setCopiesBusy(true);
    const result = await addBookCopy(copiesBook.id, shelfLocation.trim());
    if (result) setCopies(current => [result, ...current]);
    setCopiesBusy(false);
  };

  const editCopy = async (copy) => {
    const shelfLocation = window.prompt("Shelf location:", copy.shelf_location || "");
    if (shelfLocation === null) return;
    const condition = window.prompt("Condition: new, good, worn or damaged", copy.condition || "good");
    if (condition === null) return;
    if (!["new", "good", "worn", "damaged"].includes(condition.trim().toLowerCase())) {
      showToast("Choose new, good, worn or damaged.", "error");
      return;
    }
    const updated = await updateBookCopy(copy.id, { shelfLocation: shelfLocation.trim() || null, condition: condition.trim().toLowerCase() });
    if (updated) setCopies(current => current.map(item => item.id === updated.id ? updated : item));
  };

  const removeCopy = async (copy) => {
    if (!window.confirm("Remove copy " + copy.barcode + "? Copies with circulation history or an active loan cannot be removed.")) return;
    if (await deleteBookCopy(copy.id)) setCopies(current => current.filter(item => item.id !== copy.id));
  };

  return (
    <div id="booksAdminTab" className={"tab-content" + (active ? " active" : "")}>
      <section className="book-registration-panel">
        <div className="book-registration-heading">
          <span className="book-form-kicker">INVENTORY MANAGEMENT</span>
          <h3>Add a physical book</h3>
          <p className="muted">Create a catalogue record, add the number of copies, and generate a barcode label for each copy.</p>
        </div>
        <div className="notice notice-success">Book details, cover images and copy barcodes are saved to the AMG Library database.</div>
      <form id="bookForm" ref={formRef} className="form-grid book-registration-form" onSubmit={submit}>
        <label>Book title<input name="title" required maxLength="160" /></label>
        <label>Author<input name="author" required maxLength="120" /></label>
        <label>ISBN (optional)<input name="isbn" maxLength="32" placeholder="ISBN-13 or ISBN-10" /></label>
        <label>Category<select name="category" required defaultValue={BOOK_CATEGORIES[0]}>{BOOK_CATEGORIES.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Physical copies<input name="quantity" type="number" min="1" max="400" defaultValue="1" required /></label>
        <div className="book-cover-field full-span">
          <span className="book-cover-label">Book cover image <small>Optional · JPEG, PNG or WebP · up to 5 MB</small></span>
          <div className="book-cover-actions">
            <label className="btn btn-outline" htmlFor="bookCoverGalleryInput">Choose from device</label>
            <input id="bookCoverGalleryInput" ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickCover} />
            <label className="btn btn-outline" htmlFor="bookCoverCameraInput">Take cover photo</label>
            <input id="bookCoverCameraInput" ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={pickCover} />
          </div>
          {cover.url ? <div className="book-cover-preview"><img src={cover.url} alt="Selected book cover preview" /><div><strong>{cover.name}</strong><small>Preview before registering</small><button className="btn btn-sm btn-outline" type="button" onClick={clearCover}>Remove image</button></div></div> : null}
        </div>
        <label>Short description (optional)<input name="description" maxLength="500" /></label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving book…" : "Add book & generate copy labels"}</button>
      </form>
      </section>

      {labels ? <div id="copyLabelsPanel" className="copy-labels-panel">
        <h4>Copy labels — {labels.title}</h4>
        {labels.catalogueNumber ? <p className="muted">Book number: <strong>{labels.catalogueNumber}</strong></p> : null}
        <p className="muted">Print and attach one label to each physical copy.</p>
        <button className="btn btn-outline top-gap" type="button" onClick={() => window.print()}>Print copy labels</button>
        <div className="copy-label-grid">{labels.copies.map(copy => <article key={copy.barcode} className="copy-label"><strong>Copy {copy.copyNumber}</strong><Barcode value={copy.barcode} height={42} width={1.4} /><small>{copy.barcode}</small><QrCode value={copy.barcode} size={88} className="copy-label-qr" /></article>)}</div>
      </div> : null}

      <h3 className="top-gap">Published physical books</h3>
      <div className="table-responsive physical-inventory-wrap">
        <table className="data-table physical-inventory-table">
          <thead><tr><th className="physical-col-id">Book number / First copy</th><th className="physical-col-book">Book details</th><th className="physical-col-category">Category</th><th className="physical-col-stock">Available / Total</th><th className="physical-col-actions">Actions</th></tr></thead>
          <tbody id="inventoryTable">
            {books.map(book => <tr key={book.id}>
              <td className="physical-id-cell" data-label="Book number / First copy"><strong className="physical-catalogue-number">{book.catalogue_number || book.libraryNumber || "—"}</strong><small className="muted physical-copy-number">Copy: {book.barcode || "—"}</small><div className="physical-barcode"><Barcode value={book.barcode || book.libraryNumber} height={30} width={1} /></div></td>
              <td className="physical-book-cell" data-label="Book details"><div className="book-inventory-title">{book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" /> : null}<span><strong>{book.title || "Untitled book"}</strong><small>{book.author || "Unknown author"}</small></span></div></td>
              <td className="physical-category-cell" data-label="Category"><span className="physical-category-pill">{book.category || "Uncategorised"}</span></td>
              <td className="physical-stock-cell" data-label="Available / Total"><strong>{Number(book.available || 0)} <small>available</small></strong><span>{Number(book.quantity || 0)} total</span></td>
              <td className="physical-actions-cell" data-label="Actions"><div className="book-admin-actions">
                <button className="btn btn-sm btn-outline physical-action-btn physical-action-edit" type="button" onClick={() => { setCopiesBook(null); setEditCover(null); setEditing(book); }}>Edit book</button>
                <button className="btn btn-sm btn-outline physical-action-btn physical-action-copies" type="button" onClick={() => manageCopies(book)}>Manage copies</button>
                <button className="btn btn-sm btn-danger physical-action-btn physical-action-remove" type="button" onClick={() => remove(book)}>Remove</button>
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {editing ? <div
        role="presentation"
        onMouseDown={event => { if (event.target === event.currentTarget) { if (editCover?.url) URL.revokeObjectURL(editCover.url); setEditCover(null); setEditing(null); } }}
        style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(5, 12, 10, 0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", overflowY: "auto" }}
      >
        <section className="card book-edit-card" role="dialog" aria-modal="true" aria-label="Edit physical book" style={{ width: "min(100%, 680px)", maxHeight: "min(90vh, 850px)", overflowY: "auto", margin: "auto", padding: "clamp(16px, 4vw, 28px)", background: "var(--surface, #fff)", color: "var(--text, #17211d)", boxShadow: "0 24px 80px rgba(0,0,0,.4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div><h3 style={{ margin: 0 }}>Edit book details</h3><p className="muted" style={{ margin: "6px 0 0" }}>Update the published book record.</p></div>
            <button className="btn btn-outline" type="button" onClick={() => { if (editCover?.url) URL.revokeObjectURL(editCover.url); setEditCover(null); setEditing(null); }}>Close</button>
          </div>
          <form className="form-grid book-editor-form" key={editing.id} onSubmit={submitEdit}>
            <label>Book title<input name="title" defaultValue={editing.title || ""} required maxLength="255" /></label>
            <label>Author<input name="author" defaultValue={editing.author || ""} required maxLength="255" /></label>
            <label>ISBN<input name="isbn" defaultValue={editing.isbn || ""} maxLength="32" /></label>
            <label>Category<select name="category" defaultValue={editing.category || BOOK_CATEGORIES[0]}>{BOOK_CATEGORIES.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label>Total physical copies<input name="quantity" type="number" min="1" max="400" step="1" defaultValue={Number(editing.quantity || 1)} required /><small>Increasing adds new copies and barcodes. Reducing only removes unused available copies.</small></label>
            <label className="full-span">Description<input name="description" defaultValue={editing.description || ""} maxLength="10000" /></label>
            <div className="book-cover-field full-span">
              <span className="book-cover-label">Replace cover image <small>Take a new photo or choose an image · JPEG, PNG or WebP · up to 5 MB</small></span>
              {editing.coverUrl && !editCover ? <div className="book-cover-preview"><img src={editing.coverUrl} alt="Current book cover" /><div><strong>Current cover</strong><small>Choose a new photo or upload a replacement</small></div></div> : null}
              <div className="book-cover-actions">
                <label className="btn btn-outline" htmlFor="editBookCoverGalleryInput">Choose from device</label>
                <input id="editBookCoverGalleryInput" ref={editGalleryRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => pickCover(event, true)} />
                <label className="btn btn-outline" htmlFor="editBookCoverCameraInput">Take cover photo</label>
                <input id="editBookCoverCameraInput" ref={editCameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event => pickCover(event, true)} />
              </div>
              {editCover ? <div className="book-cover-preview"><img src={editCover.url} alt="New cover preview" /><div><strong>{editCover.name}</strong><small>New cover preview</small><button type="button" className="btn btn-sm btn-outline" onClick={() => { URL.revokeObjectURL(editCover.url); setEditCover(null); }}>Cancel replacement</button></div></div> : null}
            </div>
            <div className="full-span" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
              <button className="btn btn-outline" type="button" onClick={() => { if (editCover?.url) URL.revokeObjectURL(editCover.url); setEditCover(null); setEditing(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      </div> : null}

      {copiesBook ? <section className="card top-gap" aria-label="Manage physical copies">
        <div className="book-copy-heading"><div><h3>Physical copies</h3><p className="muted">{copiesBook.title} · Barcodes remain unchanged.</p></div><button className="btn btn-outline" type="button" onClick={() => setCopiesBook(null)}>Close</button></div>
        <button className="btn btn-primary" type="button" onClick={addCopy} disabled={copiesBusy}>Add another copy</button>
        {copiesBusy ? <p className="muted">Loading inventory…</p> : <div className="table-responsive"><table className="data-table"><thead><tr><th>Barcode</th><th>Status</th><th>Shelf</th><th>Condition</th><th>Actions</th></tr></thead><tbody>
          {copies.map(copy => <tr key={copy.id}><td data-label="Barcode"><strong>{copy.barcode}</strong></td><td data-label="Status">{copy.status}</td><td data-label="Shelf">{copy.shelf_location || "—"}</td><td data-label="Condition">{copy.condition}</td><td data-label="Actions"><button className="btn btn-sm btn-outline" type="button" onClick={() => editCopy(copy)}>Edit</button> <button className="btn btn-sm btn-danger" type="button" onClick={() => removeCopy(copy)}>Remove</button></td></tr>)}
          {!copies.length ? <tr><td colSpan="5">No physical copies found.</td></tr> : null}
        </tbody></table></div>}
      </section> : null}
    </div>
  );
}
