import { redirect } from "next/navigation";

/** Account settings went with the accounts (ADR-0017). Kept so old links and bookmarks still land somewhere useful. */
export default function Settings() {
  redirect("/team");
}
