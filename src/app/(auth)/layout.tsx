/** Standalone layout for the temporary authentication screens (no sidebar or top bar). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-page">{children}</div>;
}
