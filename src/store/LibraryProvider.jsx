import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { useAuth } from "./AuthProvider";
import { apiRequest, apiFileRequest, apiUrl } from "../lib/api";

const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);

const initialPosts = [
  { id:"n-01", type:"announcement", announcementKind:"Announcement", title:"Welcome to the AMG Library digital portal", body:"Explore the catalogue, discover learning resources and stay connected with library activities.", date:new Date().toISOString(), createdAt:new Date().toISOString() },
  { id:"n-02", type:"event", announcementKind:"Event", title:"Reading and discovery day", body:"Join fellow learners for a day of reading, shared stories and activities that celebrate curiosity.", date:new Date(Date.now()+86400000*10).toISOString(), createdAt:new Date().toISOString() }
];

const makeId = (prefix) => prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);

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

function mapEbook(book) {
  return {
    ...book,
    fileName: book.fileName || book.file_name || "E-book",
    fileSize: Number(book.fileSize ?? book.file_size ?? 0),
    fileType: book.fileType || book.file_mime_type || "",
    createdAt: book.createdAt || book.created_at,
    coverUrl: book.coverUrl ? (book.coverUrl.startsWith("http") ? book.coverUrl : apiUrl(book.coverUrl)) : ""
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
  const [posts, setPosts] = useState(initialPosts);
  const [capacity, setCapacity] = useState(100);
  const [myRequests, setMyRequests] = useState([]);
  const [myLoans, setMyLoans] = useState([]);
  const [scanMemberCode, setScanMemberCode] = useState("");
  const [scanMemberId, setScanMemberId] = useState("");

  const refreshPublic = useCallback(async () => {
    const [bookResult, ebookResult] = await Promise.allSettled([
      apiRequest("/books"),
      apiRequest("/ebooks")
    ]);

    if (bookResult.status === "fulfilled") setBooks(bookResult.value.books || []);
    else showToast(bookResult.reason?.message || "Could not load the book catalogue.", "error");

    if (ebookResult.status === "fulfilled") setEbooks((ebookResult.value.ebooks || []).map(mapEbook));
    else showToast(ebookResult.reason?.message || "Could not load e-books.", "error");

    return bookResult.status === "fulfilled" || ebookResult.status === "fulfilled";
  }, [showToast]);

  useEffect(() => {
    void refreshPublic();
  }, [refreshPublic]);

  const refreshMember = useCallback(async () => true, []);

  const refreshAdmin = useCallback(async () => {
    if (!token) return false;

    const [memberResult, bookResult, loanResult, attendanceResult, ebookResult] = await Promise.allSettled([
      apiRequest("/members", { token }),
      apiRequest("/books/manage", { token }),
      apiRequest("/loans", { token }),
      apiRequest("/attendance", { token }),
      apiRequest("/ebooks/manage", { token })
    ]);

    if (memberResult.status === "fulfilled") setMembers(memberResult.value.members || []);
    else showToast(memberResult.reason?.message || "Could not load members.", "error");

    if (bookResult.status === "fulfilled") setBooks(bookResult.value.books || []);
    if (loanResult.status === "fulfilled") setLoans(loanResult.value.loans || []);
    if (attendanceResult.status === "fulfilled") setAttendance(attendanceResult.value.attendance || []);
    if (ebookResult.status === "fulfilled") setEbooks((ebookResult.value.ebooks || []).map(mapEbook));

    return memberResult.status === "fulfilled";
  }, [token, showToast]);

  const resetScanMember = useCallback(() => { setScanMemberCode(""); setScanMemberId(""); }, []);

  const requestBook = useCallback(async (id) => {
    const book = books.find(item => String(item.id) === String(id));
    if (!book || Number(book.available) < 1) {
      showToast("This title is not currently available.", "error");
      return false;
    }
    const request = { id:makeId("request"), bookId:book.id, bookTitle:book.title, book_title:book.title, status:"Pending", createdAt:new Date().toISOString(), created_at:new Date().toISOString() };
    setMyRequests(current => [request, ...current]);
    setRequests(current => [request, ...current]);
    showToast("Borrow request added to this demo session.");
    return true;
  }, [books, showToast]);

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
          description: String(data.description || "").trim()
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
        libraryNumber: saved.libraryNumber || copies[0]?.barcode || "",
        copies,
        createdAt: saved.created_at || saved.createdAt
      };
      setBooks(current => [item, ...current.filter(book => book.id !== item.id)]);
      showToast(result.message || "Physical book and copy barcodes saved to the AMG Library database.");
      await refreshPublic();
      await refreshAdmin();
      return { title: item.title, copies };
    } catch (error) {
      showToast(error.message || "Could not save the physical book.", "error");
      return false;
    }
  }, [token, refreshPublic, refreshAdmin, showToast]);

  const deleteBook = useCallback(async (book) => {
    if (book?.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(book.coverUrl);
    setBooks(current => current.filter(item => item.id !== book.id));
    showToast("Book removed from this demo catalogue.");
    return true;
  }, [showToast]);

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
        token,
        method: "POST",
        body: { code, action: mode }
      });
      setAttendance(current => [result.attendance, ...current.filter(item => item.id !== result.attendance.id)]);
      showToast(result.message || "Attendance recorded.");
      return true;
    } catch (error) {
      showToast(error.message || "Could not process this scan.", "error");
      return false;
    }
  }, [token, scanMemberId, resetScanMember, refreshAdmin, showToast]);

  const updateCapacity = useCallback(async (value) => {
    setCapacity(Math.max(1, Number(value) || 1));
    showToast("Demo library capacity updated.");
    return true;
  }, [showToast]);

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
    setPosts(current => [{ id:makeId("post"), type, announcementKind:type === "event" ? "Event" : "Announcement", title, body, date:date || new Date().toISOString(), createdAt:new Date().toISOString() }, ...current]);
    showToast("Update published in this demo session.");
    return true;
  }, [showToast]);

  const deletePost = useCallback(async (_type, id) => {
    setPosts(current => current.filter(item => item.id !== id));
    showToast("Demo update removed.");
  }, [showToast]);

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
    setRequests(current => current.map(request => request.id === id ? { ...request, status } : request));
    showToast("Demo request " + status.toLowerCase() + ".");
  }, [showToast]);

  const returnLoan = useCallback(async (_requestId, id) => {
    setLoans(current => current.map(loan => loan.id === id ? { ...loan, status:"Returned" } : loan));
    showToast("Demo return recorded.");
  }, [showToast]);

  const publicPosts = useMemo(() => posts, [posts]);
  const announcements = useMemo(() => posts.filter(post => post.type === "announcement"), [posts]);
  const events = useMemo(() => posts.filter(post => post.type === "event"), [posts]);

  const value = useMemo(() => ({
    books, announcements, events, ebooks, members, requests, loans, attendance, capacity,
    myRequests, myLoans, publicPosts, scanMemberCode,
    refreshPublic, refreshMember, refreshAdmin, resetScanMember, requestBook,
    reviewLearner, changeMemberStatus, processRequest, returnLoan, registerBook, deleteBook,
    processUnifiedCode, updateCapacity, uploadEbook, removeEbook, resolveEbookUrl,
    publishNews, deletePost
  }), [
    books, announcements, events, ebooks, members, requests, loans, attendance, capacity,
    myRequests, myLoans, publicPosts, scanMemberCode,
    refreshPublic, refreshMember, refreshAdmin, resetScanMember, requestBook,
    reviewLearner, changeMemberStatus, processRequest, returnLoan, registerBook, deleteBook,
    processUnifiedCode, updateCapacity, uploadEbook, removeEbook, resolveEbookUrl,
    publishNews, deletePost
  ]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}
