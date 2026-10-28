"use client";

import { useEffect, useState } from "react";

/**
 * A one-off confirmation after deleting an account (/?account=deleted).
 * Read in the browser so the landing page stays a cached static page.
 */
export function AccountNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("account") === "deleted") {
      setShow(true);
      url.searchParams.delete("account");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  if (!show) return null;
  return (
    <div className="account-notice" role="status">
      <span>Your account has been deleted — your login, connected team and usage history are gone.</span>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
