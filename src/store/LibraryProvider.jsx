import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEMO_BOOKS } from "../lib/demoBooks";
import { useToast } from "./ToastProvider";
const LibraryContext = createContext(null);
export const useLibrary = () => useContext(LibraryContext);
const initialMembers = [
 { id:"m-01", fullName:"Amina Hassan", full_name:"Amina Hassan", email:"amina@example.com", libraryNumber:"AMG-12041", library_number:"AMG-12041", eduLevel:"Primary", edu_level:"Primary", studyLevel:"Grade 6", school:"Kibera Primary", isApproved:true, is_approved:true, membershipStatus:"Approved", approvedAt:new Date().toISOString() },
 { id:"m-02", fullName:"Brian Otieno", full_name:"Brian Otieno", email:"brian@example.com", libraryNumber:"AMG-12042", library_number:"AMG-12042", eduLevel:"Junior Secondary", edu_level:"Junior Secondary", studyLevel:"Grade 8", school:"AMG Learning Centre", isApproved:false, is_approved:false, membershipStatus:"Pending" }
];
const initialPosts = [
 { id:"n-01", type:"announcement", announcementKind:"Announcement", title:"Welcome to the AMG Library digital portal", body:"Explore the catalogue, discover learning resources and stay connected with library activities.", date:new Date().toISOString(), createdAt:new Date().toISOString() },
 { id:"n-02", type:"event", announcementKind:"Event", title:"Reading and discovery day", body:"Join fellow learners for a day of reading, shared stories and activities that celebrate curiosity.", date:new Date(Date.now()+86400000*10).toISOString(), createdAt:new Date().toISOString() }
];
export function LibraryProvider({ children }) {
 const { showToast } = useToast();
 const [books,setBooks] = useState(DEMO_BOOKS.map((b,i)=>({...b,available:i%3===0?0:3,quantity:3,icon:b.code})));
 const [members,setMembers] = useState(initialMembers);
 const [requests,setRequests] = useState([{id:"r-01",user_name:"Amina Hassan",book_title:"Mwangaza Readers, Book 1",book_category:"Primary",status:"Pending",created_at:new Date().toISOString()}]);
 const [loans,setLoans] = useState([{id:"l-01",user_name:"Amina Hassan",book_title:"Kiswahili Made Simple",status:"Borrowed",created_at:new Date().toISOString()}]);
 const [attendance,setAttendance] = useState([]);
 const [ebooks,setEbooks] = useState([{id:"e-01",title:"Reading Skills Starter Pack",category:"Primary",file_name:"starter-pack.pdf",created_at:new Date().toISOString()}]);
 const [posts,setPosts] = useState(initialPosts);
 const [capacity,setCapacity] = useState(100);
 const [myRequests,setMyRequests] = useState([]);
 const [myLoans,setMyLoans] = useState([]);
 const [scanMemberCode,setScanMemberCode] = useState("");
 const refreshPublic = useCallback(async()=>{},[]);
 const refreshMember = useCallback(async()=>{},[]);
 const refreshAdmin = useCallback(async()=>{},[]);
 const resetScanMember = useCallback(()=>setScanMemberCode(""),[]);
 const requestBook = useCallback(async(id)=>{const book=books.find(b=>String(b.id)===String(id));if(!book)return;setMyRequests(v=>[{id:"req-"+Date.now(),bookTitle:book.title,status:"Pending",createdAt:new Date().toISOString()},...v]);showToast("Demo borrow request added locally.");},[books,showToast]);
 const resolveEbookUrl = useCallback(async()=>{showToast("Digital downloads are disabled in frontend-only mode.","error");return "";},[showToast]);
 const registerBook = useCallback(async(data)=>{const item={...data,id:"book-"+Date.now(),available:Number(data.quantity)||1,icon:"BOOK"};setBooks(v=>[item,...v]);showToast("Book added to the local demo catalogue.");return {title:item.title,copies:[]};},[showToast]);
 const deleteBook = useCallback(async(book)=>{setBooks(v=>v.filter(b=>b.id!==book.id));showToast("Demo book removed.");return true;},[showToast]);
 const processUnifiedCode = useCallback(async(code,mode)=>{if(!code)return;setAttendance(v=>[{id:"a-"+Date.now(),member_name:code,library_number:code,action:mode,created_at:new Date().toISOString()},...v]);setScanMemberCode("");showToast("Scan recorded in this session.");},[showToast]);
 const updateCapacity = useCallback(async(n)=>{setCapacity(n);showToast("Demo capacity updated.");return true;},[showToast]);
 const uploadEbook = useCallback(async({title,category,file})=>{setEbooks(v=>[{id:"e-"+Date.now(),title,category,file_name:file?.name||"demo-file",created_at:new Date().toISOString()},...v]);showToast("E-book entry added locally; no file was uploaded.");return true;},[showToast]);
 const removeEbook = useCallback(async(book)=>{setEbooks(v=>v.filter(x=>x.id!==book.id));showToast("Demo e-book entry removed.");},[showToast]);
 const publishNews = useCallback(async({type,title,body,date})=>{setPosts(v=>[{id:"p-"+Date.now(),type,announcementKind:type==="event"?"Event":"Announcement",title,body,date:date||new Date().toISOString(),createdAt:new Date().toISOString()},...v]);showToast("Update published in this session.");return true;},[showToast]);
 const deletePost = useCallback(async(_type,id)=>{setPosts(v=>v.filter(x=>x.id!==id));showToast("Demo update removed.");},[showToast]);
 const reviewLearner = useCallback(async(id,decision)=>{setMembers(v=>v.map(m=>m.id===id?{...m,isApproved:decision==="Approved",is_approved:decision==="Approved",membershipStatus:decision}:m));showToast("Demo membership marked "+decision.toLowerCase()+".");},[showToast]);
 const processRequest = useCallback(async(id,status)=>{setRequests(v=>v.map(r=>r.id===id?{...r,status}:r));showToast("Demo request "+status.toLowerCase()+".");},[showToast]);
 const returnLoan = useCallback(async(_requestId,id)=>{setLoans(v=>v.map(l=>l.id===id?{...l,status:"Returned"}:l));showToast("Demo return recorded.");},[showToast]);
 const publicPosts = useMemo(()=>posts,[posts]);
 const announcements = useMemo(()=>posts.filter(p=>p.type==="announcement"),[posts]);
 const events = useMemo(()=>posts.filter(p=>p.type==="event"),[posts]);
 const value=useMemo(()=>({books,announcements,events,ebooks,members,requests,loans,attendance,capacity,myRequests,myLoans,publicPosts,scanMemberCode,refreshPublic,refreshMember,refreshAdmin,resetScanMember,requestBook,reviewLearner,processRequest,returnLoan,registerBook,deleteBook,processUnifiedCode,updateCapacity,uploadEbook,removeEbook,resolveEbookUrl,publishNews,deletePost}),[books,announcements,events,ebooks,members,requests,loans,attendance,capacity,myRequests,myLoans,publicPosts,scanMemberCode,refreshPublic,refreshMember,refreshAdmin,resetScanMember,requestBook,reviewLearner,processRequest,returnLoan,registerBook,deleteBook,processUnifiedCode,updateCapacity,uploadEbook,removeEbook,resolveEbookUrl,publishNews,deletePost]);
 return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}