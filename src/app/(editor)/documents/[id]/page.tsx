import Link from "next/link";

import { DocumentEditor } from "@/components/editor/document-editor";
import { getDocumentForUser } from "@/features/documents/actions";
import { createClient } from "@/lib/supabase/server";
import { normalizeTipTapDocument } from "@/lib/validation/tiptap";

type DocumentPageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { id } = await params;
  const result = await getDocumentForUser(id);

  if (!result.ok) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Document unavailable
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {result.unauthorized
            ? "You do not have access to this document."
            : result.error}
        </p>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[var(--accent)]"
        >
          Back to workspace
        </Link>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const userName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "Account";
  const userEmail = profile?.email || user?.email || "";

  return (
    <DocumentEditor
      documentId={result.document.id}
      initialTitle={result.document.title}
      initialRevision={result.document.revision}
      initialContent={normalizeTipTapDocument(result.document.content)}
      role={result.role}
      canEdit={result.canEdit}
      canRename={result.canRename}
      canDelete={result.canDelete}
      canShare={result.canShare}
      userId={user?.id ?? ""}
      userName={userName}
      userEmail={userEmail}
    />
  );
}
