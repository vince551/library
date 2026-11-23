import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { useAuth } from "./AuthProvider";
import { apiRequest, apiFileRequest, apiUrl } from "../lib/api";

const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);

function fileToBase64(file) {
  return file.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  });
}


function mapPhysicalBook(book) {
  return { ...book,
    coverUrl: book.coverUrl ? (book.coverUrl.startsWith("http") ? book.coverUrl : apiUrl(book.coverUrl.replace(/^\/api(?=\/)/, ""))) : "",
    category: book.category || book.category_name || "General",
    createdAt: book.createdAt || book.created_at
  };
}

function mapPost(post) {
  const type = String(post.type || "announcement").toLowerCase();
  return { ...post, type, announcementKind: type === "event" ? "Event" : "Announcement", date: post.date || post.event_date || post.published_at || post.publishedAt || post.created_at || post.createdAt, createdAt: post.createdAt || post.created_at || post.published_at || post.publishedAt };
}

function mapEbook(book) {
  return {
    ...book,
    fileName: book.fileName || book.file_name || "E-book",
    fileSize: Number(book.fileSize ?? book.file_size ?? 0),
    fileType: book.fileType || book.file_mime_type || "",
    createdAt: book.createdAt || book.created_at,
    coverUrl: book.coverUrl ? (book.coverUrl.startsWith("http") ? book.coverUrl : apiUrl(book.coverUrl.replace(/^\/api(?=\/)/, ""))) : ""
  };
}

export function LibraryProvider({ children }) {
  const { showToast } = useToast();
  const { token } = useAuth();
  const [books, setBooks] = useState([]);
  const [members, setMembers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loans, setLoans] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [ebooks, setEbooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({ days: [], totalRecords: 0, currentlyInside: 0 });
  const [capacity, setCapacity] = useState(100);
  const [myRequests, setMyRequests] = useState([]);
  const [myLoans, setMyLoans] = useState([]);
  const [scanMemberCode, setScanMemberCode] = useState("");
  const [scanMemberId, setScanMemberId] = useState("");

  const refreshPublic = useCallback(async () => {
    const [bookResult, ebookResult, postResult] = await Promise.allSettled([
      apiRequest("/books"), apiRequest("/ebooks"), apiRequest("/content")
    ]);

    if (bookResult.status === "fulfilled") setBooks((bookResult.value.books || []).map(mapPhysicalBook));
    else showToast(bookResult.reason?.message || "Could not load the book catalogue.", "error");

    if (ebookResult.status === "fulfilled") setEbooks((ebookResult.value.ebooks || []).map(mapEbook));
    else showToast(ebookResult.reason?.message || "Could not load e-books.", "error");

    if (postResult.status === "fulfilled") setPosts((postResult.value.posts || []).map(mapPost));
    else showToast(postResult.reason?.message || "Could not load News & Events updates.", "error");

    return bookResult.status === "fulfilled" || ebookResult.status === "fulfilled" || postResult.status === "fulfilled";
  }, [showToast]);

  useEffect(() => {
    void refreshPublic();
  }, [refreshPublic]);

  const refreshMember = useCallback(async () => {
    if (!token) { setMyRequests([]); setMyLoans([]); return false; }
    const [requestResult, loanResult] = await Promise.allSettled([
      apiRequest("/requests/mine", { token }),
      apiRequest("/loans/mine", { token })
    ]);
    if (requestResult.status === "fulfilled") setMyRequests(requestResult.value.requests || []);
    else showToast(requestResult.reason?.message || "Could not load your borrowing requests.", "error");
    if (loanResult.status === "fulfilled") setMyLoans(loanResult.value.loans || []);
    else showToast(loanResult.reason?.message || "Could not load your loan history.", "error");
    return requestResult.status === "fulfilled" && loanResult.status === "fulfilled";
  }, [token, showToast]);

  const refreshAdmin = useCallback(async () => {
    if (!token) return false;

    const [memberResult, bookResult, loanResult, requestResult, attendanceResult, ebookResult, attendanceSummaryResult, settingsResult] = await Promise.allSettled([
      apiRequest("/members", { token }),
      apiRequest("/books/manage", { token }),
      apiRequest("/loans", { token }),
      apiRequest("/requests", { token }),
      apiRequest("/attendance", { token }), apiRequest("/ebooks/manage", { token }),
      apiRequest("/attendance/summary", { token }), apiRequest("/settings", { token })
    ]);

    if (memberResult.status === "fulfilled") setMembers(memberResult.value.members || []);
    else showToast(memberResult.reason?.message || "Could not load members.", "error");

    if (bookResult.status === "fulfilled") setBooks((bookResult.value.books || []).map(mapPhysicalBook));
    else showToast(bookResult.reason?.message || "Could not load the managed book catalogue.", "error");

    if (loanResult.status === "fulfilled") setLoans(loanResult.value.loans || []);
    else showToast(loanResult.reason?.message || "Could not load loans.", "error");

    if (requestResult.status === "fulfilled") setRequests(requestResult.value.requests || []);
    else showToast(requestResult.reason?.message || "Could not load borrowing requests.", "error");

    if (attendanceResult.status === "fulfilled") setAttendance(attendanceResult.value.attendance || []);
    else showToast(attendanceResult.reason?.message || "Could not load attendance records.", "error");

    if (ebookResult.status === "fulfilled") setEbooks((ebookResult.value.ebooks || []).map(mapEbook));
    else showToast(ebookResult.reason?.message || "Could not load managed e-books.", "error");

    if (attendanceSummaryResult.status === "fulfilled") setAttendanceSummary(attendanceSummaryResult.value.summary || { days: [], totalRecords: 0, currentlyInside: 0 });
    else showToast(attendanceSummaryResult.reason?.message || "Could not load attendance analytics.", "error");

    if (settingsResult.status === "fulfilled") setCapacity(Number(settingsResult.value.settings?.capacity) || 100);
    else showToast(settingsResult.reason?.message || "Could not load library settings.", "error");

    return [
      memberResult, bookResult, loanResult, requestResult,
      attendanceResult, ebookResult, attendanceSummaryResult, settingsResult
    ].every(result => result.status === "fulfilled");
  }, [token, showToast]);

  const resetScanMember = useCallback(() => { setScanMemberCode(""); setScanMemberId(""); }, []);

  const requestBook = useCallback(async (id) => {
    if (!token) { showToast("Sign in to request a physical book.", "error"); return false; }
    try {
      const result = await apiRequest("/requests", { token, method: "POST", body: { bookId: id } });
      await Promise.all([refreshMember(), refreshPublic()]);
      showToast(result.message || "Borrowing request submitted.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not submit this borrowing request.", "error");
      return false;
    }
  }, [token, refreshMember, refreshPublic, showToast]);

  const resolveEbookUrl = useCallback(async (book) => {
    if (!book?.id) {
      showToast("This e-book is missing its saved file record.", "error");
      return "";
    }
    try {
      const blob = await apiFileRequest(`/ebooks/${book.id}/file`, { token });
      return URL.createObjectURL(blob);
    } catch (error) {
      showToast(error.message || "Could not open this e-book.", "error");
      return "";
    }
  }, [token, showToast]);

  const registerBook = useCallback(async (data) => {
    if (!token) {
      showToast("Sign in with a librarian account to register physical books.", "error");
      return false;
    }
    try {
      const result = await apiRequest("/books/register", {
        token,
        method: "POST",
        body: {
          title: String(data.title || "").trim(),
          author: String(data.author || "").trim(),
          isbn: String(data.isbn || "").trim(),
          category: String(data.category || "").trim(),
          quantity: Math.max(1, Math.min(400, Number(data.quantity) || 1)),
          description: String(data.description || "").trim(),
          ...(data.coverFile ? { coverType: data.coverFile.type, coverData: await fileToBase64(data.coverFile) } : {})
        }
      });
      const saved = result.book;
      if (!result.success || !saved?.id || !Array.isArray(saved.copies) || saved.copies.length === 0) {
        throw new Error("The server did not confirm that the physical book and its copy labels were saved.");
      }
      const copies = saved.copies.map((copy, index) => ({
        ...copy,
        copyNumber: copy.copyNumber || index + 1
      }));
      if (copies.length !== Number(saved.quantity)) {
        throw new Error("The server saved the book but returned an incomplete copy-label list. Refresh the catalogue before trying again.");
      }
      const item = {
        ...saved,
        format: "Physical",
        type: "physical",
        category: saved.category || data.category,
        quantity: Number(saved.quantity ?? copies.length),
        available: Number(saved.available ?? copies.length),
        barcode: saved.barcode || copies[0]?.barcode || "",
        libraryNumber: saved.catalogue_number || saved.catalogueNumber || saved.libraryNumber || copies[0]?.barcode || "",
        copies,
        createdAt: saved.created_at || saved.createdAt
      };
      setBooks(current => [item, ...current.filter(book => book.id !== item.id)]);
      showToast(result.message || "Physical book and copy barcodes saved to the AMG Library database.");
      await refreshPublic();
      await refreshAdmin();
      return { title: item.title, catalogueNumber: item.catalogue_number || item.catalogueNumber || "", copies };
    } catch (error) {
      showToast(error.message || "Could not save the physical book.", "error");
      return false;
    }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const updateBook = useCallback(async (id, data) => {
    if (!token) { showToast("Sign in with a librarian account to edit books.", "error"); return false; }
    try {
      const body = {
        title: String(data.title || "").trim(), author: String(data.author || "").trim(),
        isbn: String(data.isbn || "").trim() || null, description: String(data.description || "").trim() || null,
        ...(data.coverFile ? { coverType: data.coverFile.type, coverData: await fileToBase64(data.coverFile) } : {})
      };
      const result = await apiRequest(`/books/${encodeURIComponent(id)}`, { token, method: "PATCH", body });
      await Promise.all([refreshPublic(), refreshAdmin()]);
      showToast(result.message || "Book updated successfully.");
      return true;
    } catch (error) { showToast(error.message || "Could not update this book.", "error"); return false; }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const getBookCopies = useCallback(async (bookId) => {
    try {
      const result = await apiRequest(`/copies/book/${encodeURIComponent(bookId)}`, { token });
      return result.copies || [];
    } catch (error) { showToast(error.message || "Could not load physical copies.", "error"); return null; }
  }, [token, showToast]);

  const addBookCopy = useCallback(async (bookId, shelfLocation = "") => {
    try {
      const result = await apiRequest("/copies", { token, method: "POST", body: { bookId, shelfLocation } });
      await Promise.all([refreshPublic(), refreshAdmin()]);
      showToast(result.message || "Physical copy added.");
      return result.copy || null;
    } catch (error) { showToast(error.message || "Could not add a copy.", "error"); return null; }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const updateBookCopy = useCallback(async (copyId, data) => {
    try {
      const result = await apiRequest(`/copies/${encodeURIComponent(copyId)}`, { token, method: "PATCH", body: data });
      await Promise.all([refreshPublic(), refreshAdmin()]);
      showToast(result.message || "Copy details updated.");
      return result.copy || null;
    } catch (error) { showToast(error.message || "Could not update this copy.", "error"); return null; }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const deleteBookCopy = useCallback(async (copyId) => {
    try {
      const result = await apiRequest(`/copies/${encodeURIComponent(copyId)}`, { token, method: "DELETE" });
      await Promise.all([refreshPublic(), refreshAdmin()]);
      showToast(result.message || "Copy removed.");
      return true;
    } catch (error) { showToast(error.message || "Could not remove this copy.", "error"); return false; }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const deleteBook = useCallback(async (book) => {
    if (!token) {
      showToast("Sign in with a librarian account to delete books.", "error");
      return false;
    }
    if (!book?.id) {
      showToast("This book is missing its database ID.", "error");
      return false;
    }

    try {
      const result = await apiRequest(`/books/${encodeURIComponent(book.id)}`, {
        token,
        method: "DELETE"
      });
      if (book.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(book.coverUrl);
      setBooks(current => current.filter(item => item.id !== book.id));
      await Promise.all([refreshPublic(), refreshAdmin()]);
      showToast(result.message || "Book deleted successfully.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not delete this book.", "error");
      return false;
    }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const processUnifiedCode = useCallback(async (rawCode, mode) => {
    const code = String(rawCode || "").trim();
    if (!code) return false;

    try {
      if (mode === "issue-book" && !scanMemberId) {
        const result = await apiRequest(`/loans/members/search?search=${encodeURIComponent(code)}`, { token });
        const member = (result.members || []).find(item =>
          String(item.membership_number || "").toUpperCase() === code.toUpperCase()
        );
        if (!member || member.status !== "active") {
          throw new Error("No active approved learner matches that membership barcode.");
        }
        setScanMemberId(member.id);
        setScanMemberCode(member.membership_number);
        showToast(`Verified ${member.full_name}. Now scan the book-copy barcode.`);
        return true;
      }

      if (mode === "issue-book") {
        const result = await apiRequest("/loans/issue", {
          token,
          method: "POST",
          body: { barcode: code, memberId: scanMemberId, dueDays: 14 }
        });
        resetScanMember();
        await refreshAdmin();
        showToast(result.message || "Book issued successfully.");
        return true;
      }

      if (mode === "return-book") {
        const lookup = await apiRequest(`/loans/copy/${encodeURIComponent(code)}/active`, { token });
        const result = await apiRequest("/loans/return", {
          token,
          method: "POST",
          body: { loanId: lookup.loan.loanId }
        });
        await refreshAdmin();
        showToast(result.message || "Book returned successfully.");
        return true;
      }

      const result = await apiRequest("/attendance/scan", {
        token, method: "POST", body: { code, action: mode }
      });
      const [recordsResult, summaryResult] = await Promise.allSettled([
        apiRequest("/attendance", { token }),
        apiRequest("/attendance/summary", { token })
      ]);
      if (recordsResult.status === "fulfilled") setAttendance(recordsResult.value.attendance || []);
      if (summaryResult.status === "fulfilled") setAttendanceSummary(summaryResult.value.summary || { days: [], totalRecords: 0, currentlyInside: 0 });
      showToast(result.message || "Attendance recorded.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not process this scan.", "error");
      return false;
    }
  }, [token, scanMemberId, resetScanMember, refreshAdmin, showToast]);

  const updateCapacity = useCallback(async (value) => {
    if (!token) { showToast("Sign in with a librarian account to update capacity.", "error"); return false; }
    try {
      const result = await apiRequest("/settings/capacity", { token, method: "PATCH", body: { capacity: Number(value) } });
      const savedCapacity = Number(result.settings?.capacity);
      if (!Number.isInteger(savedCapacity) || savedCapacity < 1) throw new Error("The server did not confirm the saved capacity.");
      setCapacity(savedCapacity);
      showToast(result.message || "Library capacity saved.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not save library capacity.", "error");
      return false;
    }
  }, [token, showToast]);

  const uploadEbook = useCallback(async ({ title, author, category, description, file, coverFile }) => {
    if (!file) {
      showToast("Choose a PDF or EPUB file first.", "error");
      return false;
    }
    const validType = file.type === "application/pdf" || file.type === "application/epub+zip" || /\.(pdf|epub)$/i.test(file.name);
    if (!validType) {
      showToast("Only PDF and EPUB files are supported.", "error");
      return false;
    }
    if (file.size > 30 * 1024 * 1024) {
      showToast("E-books are limited to 30 MB per file.", "error");
      return false;
    }
    if (coverFile && (coverFile.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(coverFile.type))) {
      showToast("Cover images must be JPEG, PNG or WebP and no larger than 5 MB.", "error");
      return false;
    }
    if (!String(author || "").trim()) {
      showToast("Enter the e-book author.", "error");
      return false;
    }
    if (!token) {
      showToast("Sign in with a librarian account to upload e-books.", "error");
      return false;
    }

    try {
      const [fileData, coverData] = await Promise.all([
        fileToBase64(file),
        coverFile ? fileToBase64(coverFile) : Promise.resolve("")
      ]);
      const result = await apiRequest("/ebooks", {
        token,
        method: "POST",
        body: {
          title: String(title || "").trim(),
          author: String(author || "").trim(),
          category: String(category || "").trim(),
          description: String(description || "").trim(),
          fileName: file.name,
          fileType: file.type || (/\.epub$/i.test(file.name) ? "application/epub+zip" : "application/pdf"),
          fileData,
          coverType: coverFile?.type || "",
          coverData
        }
      });
      const entry = mapEbook(result.ebook);
      setEbooks(current => [entry, ...current.filter(item => item.id !== entry.id)]);
      showToast(result.message || "E-book uploaded and saved.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not upload this e-book.", "error");
      return false;
    }
  }, [token, showToast]);

  const removeEbook = useCallback(async (book) => {
    try {
      await apiRequest(`/ebooks/${book.id}`, { token, method: "DELETE" });
      setEbooks(current => current.filter(item => item.id !== book.id));
      showToast("E-book permanently removed from the catalogue.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not remove this e-book.", "error");
      return false;
    }
  }, [token, showToast]);

  const publishNews = useCallback(async ({ type, title, body, date }) => {
    if (!token) { showToast("Sign in with a librarian account to publish updates.", "error"); return false; }
    try {
      const result = await apiRequest("/content", { token, method: "POST", body: { type, title: String(title || "").trim(), body: String(body || "").trim(), date: date || null } });
      if (!result.post?.id) throw new Error("The server did not confirm that the update was saved.");
      setPosts(current => [mapPost(result.post), ...current.filter(item => item.id !== result.post.id)]);
      showToast(result.message || "Update published.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not publish this update.", "error");
      return false;
    }
  }, [token, showToast]);

  const deletePost = useCallback(async (_type, id) => {
    if (!token) { showToast("Sign in with a librarian account to delete updates.", "error"); return false; }
    try {
      const result = await apiRequest("/content/" + encodeURIComponent(id), { token, method: "DELETE" });
      setPosts(current => current.filter(item => item.id !== id));
      showToast(result.message || "Update deleted.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not delete this update.", "error");
      return false;
    }
  }, [token, showToast]);

  const reviewLearner = useCallback(async (id, decision) => {
    try {
      const action = decision === "Approved" ? "approve" : "reject";
      const result = await apiRequest(`/members/${id}/${action}`, {
        token,
        method: "PATCH"
      });
      await refreshAdmin();
      showToast(result.message || "Membership updated successfully.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not update this membership.", "error");
      return false;
    }
  }, [token, refreshAdmin, showToast]);

  const changeMemberStatus = useCallback(async (member) => {
    const action = member.status === "suspended" ? "reactivate" : "suspend";

    try {
      const result = await apiRequest(`/members/${member.id}/${action}`, {
        token,
        method: "PATCH"
      });
      await refreshAdmin();
      showToast(result.message || "Member status updated.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not update member status.", "error");
      return false;
    }
  }, [token, refreshAdmin, showToast]);

  const processRequest = useCallback(async (id, status) => {
    const decision = String(status).toLowerCase() === "approved" ? "approved" : "declined";
    try {
      const result = await apiRequest("/requests/" + encodeURIComponent(id), { token, method: "PATCH", body: { decision } });
      await refreshAdmin();
      showToast(result.message || "Borrowing request updated.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not update this borrowing request.", "error");
      return false;
    }
  }, [token, refreshAdmin, showToast]);

  const returnLoan = useCallback(async (_requestId, id) => {
    try {
      const result = await apiRequest("/loans/return", { token, method: "POST", body: { loanId: id } });
      await Promise.all([refreshAdmin(), refreshMember(), refreshPublic()]);
      showToast(result.message || "Book returned successfully.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not return this book.", "error");
      return false;
    }
  }, [token, refreshAdmin, refreshMember, refreshPublic, showToast]);

  const publicPosts = useMemo(() => posts, [posts]);
  const announcements = useMemo(() => posts.filter(post => post.type === "announcement"), [posts]);
  const events = useMemo(() => posts.filter(post => post.type === "event"), [posts]);

  const value = useMemo(() => ({
    books, announcements, events, ebooks, members, requests, loans, attendance, attendanceSummary, capacity,
    myRequests, myLoans, publicPosts, scanMemberCode,
    refreshPublic, refreshMember, refreshAdmin, resetScanMember, requestBook,
    reviewLearner, changeMemberStatus, processRequest, returnLoan, registerBook, updateBook, getBookCopies, addBookCopy, updateBookCopy, deleteBookCopy, deleteBook,
    processUnifiedCode, updateCapacity, uploadEbook, removeEbook, resolveEbookUrl,
    publishNews, deletePost
  }), [
    books, announcements, events, ebooks, members, requests, loans, attendance, attendanceSummary, capacity,
    myRequests, myLoans, publicPosts, scanMemberCode,
    refreshPublic, refreshMember, refreshAdmin, resetScanMember, requestBook,
    reviewLearner, changeMemberStatus, processRequest, returnLoan, registerBook, updateBook, getBookCopies, addBookCopy, updateBookCopy, deleteBookCopy, deleteBook,
    processUnifiedCode, updateCapacity, uploadEbook, removeEbook, resolveEbookUrl,
    publishNews, deletePost
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
