import { useCallback, useEffect, useRef, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";
import { useToast } from "../../store/ToastProvider";
import { errorMessage, formatDate } from "../../lib/format";

const DEFAULT_INSTRUCTION = "Choose an action, then scan the member card or individual book-copy label.";
const SCAN_MODES = [
  { value: "check-in", label: "Member check-in" },
  { value: "check-out", label: "Member check-out" },
  { value: "issue-book", label: "Issue book (member, then copy)" },
  { value: "return-book", label: "Return book (scan copy)" }
];

export function AttendanceTab({ active }) {
  const { attendance, capacity, scanMemberCode, processUnifiedCode, updateCapacity, resetScanMember } = useLibrary();
  const { showToast } = useToast();

  const [mode, setMode] = useState("check-in");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [hint, setHint] = useState("");
  const [scanFeedback, setScanFeedback] = useState(null);
  const [capacityInput, setCapacityInput] = useState(String(capacity));

  const videoRef = useRef(null);
  const codeRef = useRef(null);
  const modeRef = useRef(mode);
  const memberRef = useRef(scanMemberCode);
  const busyRef = useRef(false);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { memberRef.current = scanMemberCode; }, [scanMemberCode]);
  useEffect(() => { setCapacityInput(String(capacity)); }, [capacity]);

  const scanHandler = useCallback(async (rawCode) => {
    const value = String(rawCode || "").replace(/[\\r\\n]+$/g, "").trim();
    if (!value || busyRef.current) return false;

    const now = Date.now();
    const currentMode = modeRef.current;
    const awaitingCopy = currentMode === "issue-book" && Boolean(memberRef.current);

    if (awaitingCopy && value.toUpperCase() === String(memberRef.current).toUpperCase()) return false;
    if (value === lastScanRef.current && now - lastScanAtRef.current < 1800) return false;

    lastScanRef.current = value;
    lastScanAtRef.current = now;
    busyRef.current = true;
    setScanFeedback({ type: "processing", message: "Reading code and verifying it…" });

    try {
      const processed = await processUnifiedCode(value, currentMode);
      if (!processed) {
        setScanFeedback({ type: "error", message: "This code was not accepted. Check the scan and try again." });
        return false;
      }

      if (currentMode === "issue-book" && !awaitingCopy) {
        setScanFeedback({ type: "success", message: "Member verified. Scan the individual book-copy label next." });
      } else {
        const message = currentMode === "issue-book"
          ? "Book issue completed successfully."
          : currentMode === "return-book"
            ? "Book return completed successfully."
            : currentMode === "check-in"
              ? "Member checked in successfully."
              : "Member checked out successfully.";
        setScanFeedback({ type: "success", message });
        setScanning(false);
      }
      return true;
    } finally {
      busyRef.current = false;
    }
  }, [processUnifiedCode]);

  const handlerRef = useRef(scanHandler);
  useEffect(() => { handlerRef.current = scanHandler; }, [scanHandler]);

  useEffect(() => {
    if (!scanning) return undefined;
    let disposed = false;
    let controls = null;

    const run = async () => {
      const video = videoRef.current;
      if (!video) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        showToast("Camera access is unavailable in this browser. Use a USB/Bluetooth scanner or the manual code field.", "error");
        setScanning(false);
        return;
      }

      try {
        setHint("Requesting camera access…");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (disposed) return;

        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          },
          video,
          result => {
            if (result && !disposed) void handlerRef.current(result.getText());
          }
        );

        if (disposed) {
          controls?.stop();
          return;
        }
        setHint("Camera ready. Hold the QR code or barcode steadily inside the frame.");
      } catch (error) {
        if (disposed) return;
        const detail = error?.name === "NotAllowedError"
          ? "Camera permission was denied."
          : error?.name === "NotFoundError"
            ? "No camera was found on this device."
            : errorMessage(error);
        showToast("Could not start camera scanning: " + detail + " Use HTTPS, allow camera access, or connect a USB scanner.", "error");
        setScanning(false);
      }
    };

    void run();

    return () => {
      disposed = true;
      try { controls?.stop(); } catch (_) { /* camera may already be stopped */ }
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
      }
      setHint("");
      resetScanMember();
    };
  }, [scanning, showToast, resetScanMember]);

  const submitCode = async (event) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    await handlerRef.current(value);
    setCode("");
    codeRef.current?.focus();
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    modeRef.current = nextMode;
    lastScanRef.current = "";
    lastScanAtRef.current = 0;
    setScanFeedback(null);
    resetScanMember();
  };

  const submitCapacity = async (event) => {
    event.preventDefault();
    const next = Number(capacityInput);
    if (!Number.isInteger(next) || next < 1 || next > 10000) {
      showToast("Capacity must be between 1 and 10,000.", "error");
      return;
    }
    await updateCapacity(next);
  };

  const inside = attendance.filter(item => item.status === "In library").length;
  const instruction = hint || (scanMemberCode
    ? "Member verified. Now scan the individual book-copy barcode."
    : DEFAULT_INSTRUCTION);

  return (
    <div id="attendanceTab" className={"tab-content attendance-workspace" + (active ? " active" : "")}>
      <header className="attendance-header">
        <div><span className="attendance-kicker">AMG LIBRARY · VISITOR MANAGEMENT</span><h3>Attendance &amp; circulation</h3><p>Record visits, manage capacity and process book movement from one desk.</p></div>
        <div className="attendance-live"><i /> Scanner workspace</div>
      </header>
      <div className="attendance-overview">
        <article className="attendance-overview-card attendance-overview-primary"><span>Currently in library</span><strong>{inside}</strong><small>People checked in</small></article>
        <article className="attendance-overview-card"><span>Maximum capacity</span><strong>{capacity}</strong><small>Configured library limit</small></article>
        <article className="attendance-overview-card"><span>Available spaces</span><strong>{Math.max(0, capacity - inside)}</strong><small>Remaining capacity</small></article>
        <article className="attendance-overview-card"><span>Attendance records</span><strong>{attendance.length}</strong><small>Recorded visits</small></article>
      </div>
      <section className="attendance-card">
        <div className="attendance-card-heading"><div><span className="attendance-kicker">01 · SCAN &amp; PROCESS</span><h4>Smart barcode &amp; QR scanner</h4><p>Scan membership cards and book-copy labels using a phone camera or external scanner.</p></div><span className="attendance-step">01</span></div>
        <div className="scanner-method-hints">
          <span><b>USB / Bluetooth scanner</b><small>Click the code field and scan. The scanner should send Enter after each code.</small></span>
          <span><b>Phone camera</b><small>Allow camera access and hold the QR code or barcode inside the frame.</small></span>
        </div>
        <form id="attendanceForm" className="inline-form attendance-scan-form" onSubmit={submitCode}>
          <label>Scanner mode<select name="action" value={mode} onChange={event => changeMode(event.target.value)}>{SCAN_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="attendance-code-field">Scan / enter code<input id="attendanceCodeInput" ref={codeRef} name="libraryNumber" type="text" required autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Focus here, then scan a QR code or barcode" value={code} onChange={event => setCode(event.target.value)} /></label>
          <button className="btn btn-primary" type="submit" disabled={!code.trim()}>Process scan</button>
        </form>
        <div className="attendance-instruction" role="status" aria-live="polite">{instruction}</div>
        {scanFeedback ? <div className={"attendance-scan-feedback is-" + scanFeedback.type} role="status" aria-live="polite">{scanFeedback.message}</div> : null}
        <button id="startScannerBtn" className="btn btn-outline attendance-camera-button" type="button" onClick={() => { setScanFeedback(null); setScanning(true); }} disabled={scanning}>Open phone camera scanner</button>
        <div id="scannerBox" className={"scanner-box attendance-camera-box" + (scanning ? "" : " hidden")}>
          <video id="scannerVideo" ref={videoRef} playsInline muted autoPlay></video>
          <p className="scanner-camera-help">Position the code inside the camera view. QR codes and supported barcodes are read automatically.</p>
          <button id="stopScannerBtn" className="btn btn-secondary" type="button" onClick={() => setScanning(false)}>Stop scanner</button>
        </div>
      </section>
      <section className="attendance-card attendance-capacity-card">
        <div className="attendance-card-heading"><div><span className="attendance-kicker">02 · SPACE MANAGEMENT</span><h4>Library capacity</h4><p>Keep the occupancy limit aligned with the available seating and space.</p></div><span className="attendance-step">02</span></div>
        <div className="attendance-capacity-visual">
          <div><strong>{inside}<small> / {capacity}</small></strong><span>Current occupancy</span></div>
          <div className="attendance-capacity-track"><span style={{ width: Math.min(100, capacity > 0 ? inside / capacity * 100 : 0) + "%" }} /></div>
          <b>{Math.round(Math.min(100, capacity > 0 ? inside / capacity * 100 : 0))}% occupied</b>
        </div>
        <form id="capacityForm" className="inline-form attendance-capacity-form" onSubmit={submitCapacity}>
          <label>Maximum library capacity<input name="capacity" type="number" min="1" max="10000" required value={capacityInput} onChange={event => setCapacityInput(event.target.value)} /></label>
          <button className="btn btn-outline" type="submit">Save capacity</button>
        </form>
      </section>
      <section className="attendance-card attendance-history-card">
        <div className="attendance-card-heading"><div><span className="attendance-kicker">03 · ACTIVITY LOG</span><h4>Recent attendance</h4><p>Review member visits and check-in / check-out activity.</p></div><span className="attendance-step">03</span></div>
        <div className="table-responsive">
          <table className="data-table">
            <thead><tr><th>Member</th><th>Library #</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
            <tbody id="attendanceTable">
              {attendance.length ? attendance.map(item => (
                <tr key={item.id}><td>{item.memberName}</td><td>{item.libraryNumber}</td><td>{formatDate(item.checkInAt)}</td><td>{formatDate(item.checkOutAt)}</td><td><span className={"attendance-status " + (item.status === "In library" ? "is-inside" : "is-outside")}>{item.status}</span></td></tr>
              )) : <tr><td colSpan="5" className="attendance-empty">No attendance records have been recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
