export function FeaturedBooks({ books = [], ebooks = [], onBrowse }) {
  const featured = [
    ...books.map(book => ({ ...book, catalogueType:"physical" })),
    ...ebooks.map(book => ({ ...book, catalogueType:"ebook" }))
  ].slice(0, 4);

  return (
    <div id="homeFeaturedBooks" className="featured-books-grid" aria-live="polite">
      {featured.length === 0 ? (
        <>
          <p className="featured-empty">The librarian's latest physical books and e-books will appear here when they are published to the catalogue.</p>
          <button className="btn btn-outline featured-empty-action" type="button" onClick={onBrowse}>Explore the catalogue →</button>
        </>
      ) : featured.map(item => {
        const isEbook = item.catalogueType === "ebook";
        const available = Math.max(0, Number(item.available || 0));
        return (
          <article key={item.id} className={"featured-book-card" + (isEbook ? " featured-ebook-card" : "")}>
            <div className="featured-book-cover">
              {item.coverUrl
                ? <img src={item.coverUrl} alt={"Cover of " + (item.title || "book")} loading="lazy" />
                : <span className="featured-cover-placeholder">{isEbook ? "E-BOOK" : (item.icon || "BOOK")}</span>}
              <span className="featured-format-tag">{isEbook ? "DIGITAL" : "PRINT"}</span>
            </div>
            <div className="featured-book-details">
              <span className="featured-book-category">{item.category || "Library collection"}</span>
              <h3>{item.title || "Untitled book"}</h3>
              <p className="featured-book-author">{isEbook ? "Digital reading resource" : "by " + (item.author || "Unknown author")}</p>
              <span className={"featured-availability" + (isEbook || available > 0 ? " is-available" : "")}>
                {isEbook ? "E-book available" : available > 0 ? "Available to request" : "Currently unavailable"}
              </span>
              <button className="featured-book-link" type="button" onClick={onBrowse}>View in catalogue →</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}