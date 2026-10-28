"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth/server";

/**
 * Delete the caller's account: their login, profile and usage history
 * (supabase/migrations/*_delete_account.sql). The typed confirmation is
 * checked here too, not only in the browser.
 */
export async function deleteAccount(confirmation: string): Promise<{ error: string }> {
  if (confirmation.trim().toLowerCase() !== "delete") return { error: 'Type "delete" to confirm.' };
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your session has ended. Log in again." };

  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "We couldn't delete your account. Please try again." };

  // The login no longer exists; clear this browser's session cookies too.
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}
