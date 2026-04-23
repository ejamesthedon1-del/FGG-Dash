import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { initSupabaseAuthSync } from '@/lib/supabase/session';

function App() {
  useEffect(() => {
    return initSupabaseAuthSync();
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  );
}

export default App;
