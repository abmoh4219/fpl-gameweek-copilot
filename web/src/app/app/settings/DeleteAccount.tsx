"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  return (
    <form
      className="form danger-confirm"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await deleteAccount(text);
          if (result) setError(result.error);
        });
      }}
    >
      <div className="field">
        <label htmlFor="confirm-delete">
          <span>
            Type <b>delete</b> to confirm. This can&apos;t be undone.
          </span>
        </label>
        <input id="confirm-delete" className="input" autoComplete="off" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="row-actions">
        <button type="submit" className="btn btn-danger" disabled={pending || text.trim().toLowerCase() !== "delete"}>
          {pending ? <span className="spinner" /> : "Delete my account for good"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(false);
            setText("");
            setError(null);
          }}
          disabled={pending}
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}
