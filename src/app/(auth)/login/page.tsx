import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Access your documents and workspace.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
