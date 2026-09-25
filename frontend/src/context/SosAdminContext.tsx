import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';

type AdminAccess = {
  isOperator: boolean;
  role: string | null;
  checking: boolean;
};

const AdminContext = createContext<AdminAccess>({
  isOperator: false,
  role: null,
  checking: true,
});

/**
 * Client-side role check used ONLY to decide what to render.
 *
 * This is not a security boundary: the `sos-admin` Edge Function re-verifies
 * `app_role` on the server for every request, and the anon key cannot change
 * `app_role` (a database trigger rejects it). Hiding the UI early just avoids
 * showing a dashboard that would immediately 403.
 */
export function SosAdminProvider({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  const [state, setState] = useState<AdminAccess>({
    isOperator: false,
    role: null,
    checking: true,
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setState({ isOperator: false, role: null, checking: false });
      return;
    }

    setState((previous) => ({ ...previous, checking: true }));
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('app_role')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      const role = (data?.app_role as string | null) ?? null;
      setState({
        isOperator: role === 'admin' || role === 'safety_team',
        role,
        checking: false,
      });
    } catch {
      setState({ isOperator: false, role: null, checking: false });
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return <AdminContext.Provider value={state}>{children}</AdminContext.Provider>;
}

export function useAdminAccess(): AdminAccess {
  return useContext(AdminContext);
}
