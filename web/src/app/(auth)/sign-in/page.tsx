import { redirect } from "next/navigation";

/** There are no accounts any more: signing in became finding your team (ADR-0017). Kept so old links and bookmarks still land somewhere useful. */
export default function SignIn() {
  redirect("/team");
}
