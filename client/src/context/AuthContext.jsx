import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

// Where someone lands after logging in
export function homeFor(user) {
  return user?.role === 'PLATFORM_ADMIN' ? '/platform' : '/dashboard';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // My standing everywhere: college, colleges I head, clubs I'm in (with role and rights)
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshContext = useCallback(async () => {
    try {
      const res = await api.get('/me/context');
      setCtx(res.data);
      setUser(res.data.user);
      return res.data;
    } catch {
      return null;
    }
  }, []);

  // On page load, restore the session from the saved token
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    refreshContext()
      .then((c) => {
        if (!c) localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, [refreshContext]);

  const saveSession = async (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    await refreshContext();
    return data.user;
  };

  const login = async (email, password) => saveSession((await api.post('/auth/login', { email, password })).data);
  const register = async (form) => saveSession((await api.post('/auth/register', form)).data);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setCtx(null);
  }, []);

  // Log out automatically if the server says the token is no longer valid
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) logout();
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, [logout]);

  const updateUser = (u) => {
    setUser(u);
    refreshContext();
  };

  return (
    <AuthContext.Provider value={{ user, ctx, loading, login, register, logout, saveSession, updateUser, refreshContext }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
