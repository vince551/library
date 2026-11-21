import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";
import { useAuth } from "./AuthProvider";
import { apiRequest } from "../lib/api";

const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);

const initialPosts = [
  { id:"n-01", type:"announcement", announcementKind:"Announcement", title:"Welcome to the AMG Library digital portal", body:"Explore the catalogue, discover learning resources and stay connected with library activities.", date:new Date().toISOString(), createdAt:new Date().toISOString() },
  { id:"n-02", type:"event", announcementKind:"Event", title:"Reading and discovery day", body:"Join fellow learners for a day of reading, shared stories and activities that celebrate curiosity.", date:new Date(Date.now()+86400000*10).toISOString(), createdAt:new Date().toISOString() }
];

const makeId = (prefix) => prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2,7);

export function LibraryProvider({ children }) {
  const { showToast } = useToast();
  const { token } = useAuth();
  // Empty catalogue by default: the sample site never pretends that demo titles
  // are real inventory. Librarian-created entries appear immediately in this session.
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
    try {
      const data = await apiRequest("/books");
      setBooks(data.books || []);
      return true;
    } catch (error) {
      showToast(error.message || "Could not load the book catalogue.", "error");
      return false;
    }
  }, [showToast]);

  const refreshMember = useCallback(async () => true, []);

  const refreshAdmin = useCallback(async () => {
    if (!token) return false;

    const [memberResult, bookResult, loanResult, attendanceResult] = await Promise.allSettled([
      apiRequest("/members", { token }),
      apiRequest("/books/manage", { token }),
      apiRequest("/loans", { token }),
      apiRequest("/attendance", { token })
    ]);

    if (memberResult.status === "fulfilled") {
      setMembers(memberResult.value.members || []);
    } else {
      showToast(memberResult.reason?.message || "Could not load members.", "error");
    }

    if (bookResult.status === "fulfilled") {
      setBooks(bookResult.value.books || []);
    }

    if (loanResult.status === "fulfilled") {
      setLoans(loanResult.value.loans || []);
    }

    if (attendanceResult.status === "fulfilled") {
      setAttendance(attendanceResult.value.attendance || []);
    }

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
    if (book?.localUrl) return book.localUrl;
    showToast("This demo entry has no attached file. The backend will provide secure file links.", "error");
    return "";
  }, [showToast]);

  const registerBook = useCallback(async (data) => {
    const quantity = Math.max(1, Math.min(400, Number(data.quantity) || 1));
    const id = makeId("book");
    const barcodeBase = "AMG" + Date.now().toString().slice(-8);
    const copies = Array.from({ length:quantity }, (_, index) => ({
      id:makeId("copy"),
      copyNumber:index + 1,
      barcode:barcodeBase + String(index + 1).padStart(2, "0")
    }));
    const coverUrl = data.coverFile ? URL.createObjectURL(data.coverFile) : "";
    const item = {
      ...data, id, format:"Physical", type:"physical",
      quantity, available:quantity, coverUrl, barcode:copies[0]?.barcode,
      libraryNumber:barcodeBase, copies, createdAt:new Date().toISOString()
    };
    delete item.coverFile;
    setBooks(current => [item, ...current]);
    showToast("Physical book added to the local catalogue. Changes are temporary.");
    return { title:item.title, copies };
  }, [showToast]);

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

  const uploadEbook = useCallback(async ({ title, category, description, file, coverFile }) => {
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
      showToast("The demo upload limit is 30 MB per e-book.", "error");
      return false;
    }
    const coverUrl = coverFile ? URL.createObjectURL(coverFile) : "";
    const entry = {
      id:makeId("ebook"), title, category, description, coverUrl, format:"E-book", type:"ebook",
      fileName:file.name, fileSize:file.size, fileType:file.type,
      localUrl:URL.createObjectURL(file), createdAt:new Date().toISOString()
    };
    setEbooks(current => [entry, ...current]);
    showToast("E-book added to the local demo catalogue. The file is not uploaded to a server.");
    return true;
  }, [showToast]);

  const removeEbook = useCallback(async (book) => {
    if (book?.localUrl?.startsWith("blob:")) URL.revokeObjectURL(book.localUrl);
    if (book?.coverUrl?.startsWith("blob:")) URL.revokeObjectURL(book.coverUrl);
    setEbooks(current => current.filter(item => item.id !== book.id));
    showToast("E-book removed from this demo session.");
  }, [showToast]);

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