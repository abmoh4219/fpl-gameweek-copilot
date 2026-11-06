"use client";

import { useEffect, useState } from "react";

/**
 * Share a card (ADR-0019). On a phone: the system share sheet with the image
 * itself, so it lands in X, WhatsApp or Telegram as a picture. Everywhere: a
 * "Post on X" link (the card's page carries the card as its preview image)
 * and a plain download.
 */
export function ShareBar({ image, page, text, file }: { image: string; page: string; text: string; file: string }) {
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const probe = new File([new Blob()], "x.png", { type: "image/png" });
      setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShareFiles(false);
    }
  }, []);

  async function share() {
    setBusy(true);
    try {
      const blob = await fetch(image).then((r) => r.blob());
      await navigator.share({ files: [new File([blob], file, { type: "image/png" })], text: `${text} ${page}` });
    } catch {
      // Cancelled or unsupported: nothing to do, the other buttons still work.
    } finally {
      setBusy(false);
    }
  }

  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(page)}`;
  return (
    <div className="share-bar">
      {canShareFiles && (
        <button type="button" className="btn btn-accent" onClick={() => void share()} disabled={busy}>
          {busy ? <span className="spinner" /> : "Share image"}
        </button>
      )}
      <a className={`btn${canShareFiles ? "" : " btn-accent"}`} href={intent} target="_blank" rel="noreferrer">
        Post on X
      </a>
      <a className="btn" href={image} download={file}>
        Download
      </a>
    </div>
  );
}
