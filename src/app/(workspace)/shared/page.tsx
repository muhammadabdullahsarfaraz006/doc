import { SharedDocumentList } from "@/components/dashboard/shared-document-list";
import { getSharedDocuments } from "@/features/sharing/actions";

export default async function SharedPage() {
  const { documents, error } = await getSharedDocuments();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Shared with me</h1>
        <p className="text-sm text-[var(--muted)]">
          Documents others have shared with your account.
        </p>
      </header>

      {error ? (
        <div
          className="rounded-lg border border-[var(--danger)]/30 bg-red-50 px-4 py-3 text-sm text-[var(--danger)]"
          role="alert"
        >
          {error}
        </div>
      ) : (
        <SharedDocumentList documents={documents} />
      )}
    </div>
  );
}
