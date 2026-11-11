import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Start writing with a lightweight collaborative workspace.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
