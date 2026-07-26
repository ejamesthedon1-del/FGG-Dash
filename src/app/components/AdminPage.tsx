import { Navigate } from "react-router";

/** Legacy account URL — redirects into the in-app Settings page. */
export function AdminPage() {
  return <Navigate to="/settings" replace />;
}
