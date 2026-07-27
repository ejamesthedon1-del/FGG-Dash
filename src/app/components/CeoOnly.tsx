import { Navigate } from "react-router";
import { useAuth } from "../lib/use-auth";

/** CEO-only pages (Brand Hub, Mockups, Creative Assets, Training Center, Mission). */
export function CeoOnly({ children }: { children: React.ReactNode }) {
  const { loading, isCeo } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
        Checking access…
      </div>
    );
  }

  if (!isCeo) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
