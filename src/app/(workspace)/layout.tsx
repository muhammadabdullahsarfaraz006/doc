import { redirect } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const userName =
    profile?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email ||
    "Account";
  const userEmail = profile?.email || user.email || "";

  return (
    <div className="min-h-screen bg-[var(--background)] lg:flex">
      <div className="lg:sticky lg:top-0 lg:h-screen lg:shrink-0">
        <Suspense
          fallback={
            <aside className="h-full w-full border-r border-[var(--border)] bg-[var(--surface)] lg:w-64" />
          }
        >
          <WorkspaceSidebar userEmail={userEmail} userName={userName} />
        </Suspense>
      </div>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
