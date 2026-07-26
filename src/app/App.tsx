import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { initSupabaseAuthSync } from "@/lib/supabase/session";
import { AuthProvider } from "./lib/use-auth";

function App() {
  useEffect(() => {
    return initSupabaseAuthSync();
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
