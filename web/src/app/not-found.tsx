import Link from "next/link";

export default function NotFound() {
  return (
    <main className="message-page" id="content">
      <div>
        <div className="code" aria-hidden="true">
          404
        </div>
        <h1>Off the pitch</h1>
        <p>That page doesn&apos;t exist — or it was subbed off. Head back and try again.</p>
        <div className="row-actions">
          <Link href="/" className="btn btn-accent">
            Back to Armband
          </Link>
          <Link href="/demo" className="btn">
            Try the demo
          </Link>
        </div>
      </div>
    </main>
  );
}
