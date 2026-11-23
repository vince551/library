import { useCallback, useEffect, useRef, useState } from "react";
import { useLibrary } from "../../store/LibraryProvider";
import { useToast } from "../../store/ToastProvider";
import { errorMessage, formatDate } from "../../lib/format";

const DEFAULT_INSTRUCTION = "Select an action, then scan the relevant membership card or book-copy label.";
const SCAN_MODES = [
  { value: "check-in", label: "Member check-in" },
  { value: "check-out", label: "Member check-out" },
  { value: "issue-book", label: "Issue book (scan member, then copy)" },
  { value: "return-book", label: "Return book (scan copy)" }
];

export function AttendanceTab({ active }) {
  const { attendance, attendanceSummary, capacity, scanMemberCode, processUnifiedCode, updateCapacity, resetScanMember } = useLibrary();
  const { showToast } = useToast();

  const [mode, setMode] = useState("check-in");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [hint, setHint] = useState("");
  const [capacityInput, setCapacityInput] = useState(String(capacity));
  const [scannerStatus, setScannerStatus] = useState("idle");

  const videoRef = useRef(null);
  const codeRef = useRef(null);
  const modeRef = useRef(mode);
  const memberRef = useRef(scanMemberCode);
  const busyRef = useRef(false);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);
  const scannerKeyTimesRef = useRef([]);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { memberRef.current = scanMemberCode; }, [scanMemberCode]);
  useEffect(() => { setCapacityInput(String(capacity)); }, [capacity]);

  // A scanned code is only processed once, even if the detector reports the
  // same value on several consecutive frames.
  const scanHandler = useCallback(async (rawCode) => {
    const value = String(rawCode || "").trim();
    if (!value || busyRef.current) return;
    const now = Date.now();
    const currentMode = modeRef.current;
    if (currentMode === "issue-book" && memberRef.current && value === memberRef.current) return;
    if (value === lastScanRef.current && now - lastScanAtRef.current < 1600) return;
    lastScanRef.current = value;
    lastScanAtRef.current = now;
    busyRef.current = true;
    const hadMember = Boolean(memberRef.current);
    try {
      const processed = await processUnifiedCode(value, currentMode);
      if (processed && (currentMode !== "issue-book" || hadMember)) setScanning(false);
    } finally {
      busyRef.current = false;
    }
  }, [processUnifiedCode]);

  const handlerRef = useRef(scanHandler);
  useEffect(() => { handlerRef.current = scanHandler; }, [scanHandler]);

  useEffect(() => {
    if (!scanning) return undefined;
    let disposed = false;
    let stream = null;
    let frame = 0;
    let controls = null;

    const run = async () => {
      const video = videoRef.current;
      if (!video) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast("Camera access is unavailable. Use a USB barcode scanner connected to the code field.", "error");
        setScanning(false);
        return;
      }
      try {
        if ("BarcodeDetector" in window) {
          try {
            const formats = ["code_128", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e"];
            const supported = await window.BarcodeDetector.getSupportedFormats?.();
            const usable = supported ? formats.filter(format => supported.includes(format)) : formats;
            if (usable.length) {
              const detector = new window.BarcodeDetector({ formats: usable });
              stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
              if (disposed) {
                stream.getTracks().forEach(track => track.stop());
                return;
              }
              video.srcObject = stream;
              await video.play();
              const loop = async () => {
                if (disposed) return;
                try {
                  if (!busyRef.current) {
                    const codes = await detector.detect(video);
                    if (codes.length && codes[0].rawValue) await handlerRef.current(codes[0].rawValue);
                  }
                } catch (_) { /* skip this frame */ }
                if (!disposed) frame = window.requestAnimationFrame(loop);
              };
              setHint("Camera ready. Scan a membership card or book-copy label.");
              loop();
              return;
            }
          } catch (_) {
            if (stream) stream.getTracks().forEach(track => track.stop());
            stream = null;
            video.srcObject = null;
          }
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (disposed) return;
        const reader = new BrowserMultiFormatReader();
        setHint("Loading the compatible barcode and QR camera reader…");
        controls = await reader.decodeFromVideoDevice(undefined, video, result => {
          if (result) void handlerRef.current(result.getText());
        });
        setHint("Camera ready. Scan a membership card or book-copy label.");
      } catch (error) {
        showToast(
          "Could not start camera scanning: " + errorMessage(error) + ". Check camera permission and use HTTPS, or connect a USB scanner.",
          "error"
        );
        setScanning(false);
      }
    };

    void run();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      try { controls?.stop(); } catch (_) { /* reader already stopped */ }
      if (stream) stream.getTracks().forEach(track => track.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
      setHint("");
      resetScanMember();
    };
  }, [scanning, showToast, resetScanMember]);

  const handleScannerKeyDown = (event) => {
    if (event.key === "Enter") {
      const times = scannerKeyTimesRef.current;
      const isScannerBurst = times.length >= 5 && times[times.length - 1] - times[0] <= 1500;
      setScannerStatus(isScannerBurst ? "detected" : "manual");
      scannerKeyTimesRef.current = [];
      return;
    }
    if (event.key.length === 1) {
      const now = Date.now();
      scannerKeyTimesRef.current = [...scannerKeyTimesRef.current.filter(time => now - time < 1500), now].slice(-40);
      if (scannerKeyTimesRef.current.length >= 5 && now - scannerKeyTimesRef.current[0] <= 1500) {
        setScannerStatus("receiving");
      }
    }
  };

  const scannerStatusCopy = {
    idle: ["Scanner not tested", "Click the barcode field, then scan a card to verify the scanner."],
    ready: ["Ready for scanner input", "The field is focused. Scan a barcode; AMG will confirm when input arrives."],
    receiving: ["Scanner input detected", "Rapid barcode characters are arriving in the scan field."],
    detected: ["Scanner input detected", "Rapid input arrived in the scan field, matching a typical USB keyboard-wedge scan."],
    manual: ["Code entered", "The value was entered. A USB keyboard-wedge scanner is confirmed after a rapid scan."]
  }[scannerStatus];

  const submitCode = async (event) => {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    await processUnifiedCode(value, mode);
    setCode("");
    codeRef.current?.focus();
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

  const inside = Number(attendanceSummary.currentlyInside) || 0;
  const instruction = hint || (scanMemberCode
    ? "Member scanned. Now scan the individual book-copy barcode."
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
        <article className="attendance-overview-card"><span>Attendance records</span><strong>{Number(attendanceSummary.totalRecords) || 0}</strong><small>Recorded scan events</small></article>
      </div>
      <section className="attendance-card">
        <div className="attendance-card-heading"><div><span className="attendance-kicker">01 · SCAN &amp; PROCESS</span><h4>Smart barcode &amp; QR scanner</h4><p>Use a USB barcode scanner or the rear camera on a phone or tablet.</p></div><span className="attendance-step">01</span></div>
        <div className="scanner-method-hints">
          <span><b>USB scanner</b><small>Focus the code field and scan. Configure the scanner to send Enter after each scan.</small></span>
          <span><b>Phone camera</b><small>Allow camera access and hold the barcode or QR code inside the frame.</small></span>
        </div>
        <form id="attendanceForm" className="inline-form attendance-scan-form" onSubmit={submitCode}>
          <label>Scanner mode<select name="action" value={mode} onChange={event => setMode(event.target.value)}>{SCAN_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="attendance-code-field">Scan / enter barcode<input id="attendanceCodeInput" ref={codeRef} name="libraryNumber" type="text" required autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Click here, then scan CODE-128 or QR code" value={code} onFocus={() => setScannerStatus("ready")} onBlur={() => { if (scannerStatus === "ready") setScannerStatus("idle"); }} onKeyDown={handleScannerKeyDown} onChange={event => setCode(event.target.value)} /></label>
          <button className="btn btn-primary" type="submit">Process scan</button>
        </form>
        <div className="scanner-connection-status" data-scanner-state={scannerStatus} role="status" aria-live="polite"><i /><span><strong>{scannerStatusCopy[0]}</strong><small>{scannerStatusCopy[1]}</small></span></div>
        <div className="attendance-instruction" role="status">{instruction}</div>
        <button id="startScannerBtn" className="btn btn-outline attendance-camera-button" type="button" onClick={() => setScanning(true)} disabled={scanning}>Open phone camera scanner</button>
        <div id="scannerBox" className={"scanner-box attendance-camera-box" + (scanning ? "" : " hidden")}>
          <video id="scannerVideo" ref={videoRef} playsInline muted></video>
          <p className="scanner-camera-help">Position the code inside the camera view. The scanner will process it automatically.</p>
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
            <thead><tr><th>Attendance #</th><th>Member</th><th>Library #</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
            <tbody id="attendanceTable">
              {attendance.length ? attendance.map(item => (
                <tr key={item.id}><td><strong>{item.attendanceNumber || "—"}</strong></td><td>{item.memberName}</td><td>{item.libraryNumber}</td><td>{formatDate(item.checkInAt)}</td><td>{formatDate(item.checkOutAt)}</td><td><span className={"attendance-status " + (item.status === "In library" ? "is-inside" : "is-outside")}>{item.status}</span></td></tr>
              )) : <tr><td colSpan="6" className="attendance-empty">No attendance records have been recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
