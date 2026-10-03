import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { errorMessage } from '../api/client';

const ClubContext = createContext(null);

// Wraps the club workspace (/c/:clubId/...): loads the club and what I can do there.
// Pages use `base` for API calls and `root` for links, so the same page works for any club.
export function ClubProvider({ children }) {
  const { clubId } = useParams();
  const [state, setState] = useState({ loading: true, error: '', dashboard: null });

  const reload = useCallback(() => {
    return api
      .get(`/clubs/${clubId}/manage`)
      .then((res) => setState({ loading: false, error: '', dashboard: res.data }))
      .catch((err) => setState({ loading: false, error: errorMessage(err), dashboard: null }));
  }, [clubId]);

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
  }, [reload]);

  const d = state.dashboard;
  const value = {
    clubId: Number(clubId),
    loading: state.loading,
    error: state.error,
    club: d?.club,
    role: d?.myRole,
    overseer: d?.overseer,
    can: d?.can || { manage: false, money: false, staff: false, view: false, oversee: false, finance: false },
    dashboard: d,
    base: `/clubs/${clubId}/manage`, // API prefix for manager/treasurer endpoints
    clubApi: `/clubs/${clubId}`, // API prefix for staff endpoints (fundraisers, claims, verify)
    root: `/c/${clubId}`, // app route prefix
    reload,
  };
  return <ClubContext.Provider value={value}>{children}</ClubContext.Provider>;
}

export const useClub = () => useContext(ClubContext);
