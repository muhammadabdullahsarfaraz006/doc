import { DocumentList } from "@/components/dashboard/document-list";
import { getOwnedDocuments } from "@/features/documents/actions";

type DashboardPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const view = params.view === "recent" ? "recent" : "owned";
  const { documents, error } = await getOwnedDocuments();

  const visibleDocuments =
    view === "recent" ? documents.slice(0, 10) : documents;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {view === "recent" ? "Recent documents" : "My documents"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {view === "recent"
            ? "Your ten most recently updated owned documents."
            : "Documents you own. Create a new one from the sidebar."}
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
        <DocumentList
          documents={visibleDocuments}
          emptyMessage="Create your first document to get started."
        />
      )}
    </div>
  );
}
