"use client";

import Link from "next/link";

/** Anything unexpected inside the app lands here instead of a blank page. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page">
      <div className="notice error" role="alert" style={{ maxWidth: 560 }}>
        <b>Something went wrong loading this page.</b> It&apos;s usually FPL being busy — try again in a moment.
      </div>
      <div className="row-actions" style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-accent" onClick={reset}>
          Try again
        </button>
        <Link href="/app" className="btn">
          Back to my team
        </Link>
      </div>
    </div>
  );
}
