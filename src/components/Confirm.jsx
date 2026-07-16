import { useEffect } from "react";

/** In-app confirmation dialog. Replaces window.confirm(), which on iOS renders
 *  as an ugly "localhost says" system alert and can't be styled or dismissed
 *  by tapping away. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Remove", cancelLabel = "Cancel", danger = true, onConfirm, onCancel }) {
  // Esc to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(28,48,40,0.55)",
        backdropFilter:"blur(2px)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"1.5rem",
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"var(--white)", borderRadius:8, maxWidth:380, width:"100%",
          border:"1px solid var(--gray-200)",
          boxShadow:"0 12px 32px rgba(28,48,40,0.28)",
          overflow:"hidden",
        }}>
        <div style={{background:"var(--pine-mid)",padding:"0.7rem 1rem"}}>
          <h2 style={{fontFamily:"var(--font-body)",fontSize:"var(--text-base)",fontWeight:700,color:"var(--aspen)"}}>
            {title}
          </h2>
        </div>
        <div style={{padding:"1rem"}}>
          <p style={{fontSize:"var(--text-base)",color:"var(--gray-800)",marginBottom:"1rem",lineHeight:1.45}}>
            {message}
          </p>
          <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end"}}>
            <button className="btn btn-ghost" onClick={onCancel}>{cancelLabel}</button>
            <button className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Brief non-blocking message. Replaces window.alert() for things that are
 *  informational rather than a decision. */
export function Toast({ message, onDone, ms = 2600 }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDone?.(), ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);

  if (!message) return null;

  return (
    <div style={{
      position:"fixed", zIndex:1001,
      left:"50%", transform:"translateX(-50%)",
      bottom:"calc(1.5rem + env(safe-area-inset-bottom, 0))",
      background:"var(--pine-deep)", color:"var(--aspen)",
      border:"1px solid var(--copper)", borderRadius:6,
      padding:"0.6rem 1rem", fontSize:"var(--text-sm)", fontWeight:600,
      boxShadow:"0 6px 20px rgba(28,48,40,0.3)",
      maxWidth:"calc(100vw - 2rem)", textAlign:"center",
    }}>
      {message}
    </div>
  );
}
