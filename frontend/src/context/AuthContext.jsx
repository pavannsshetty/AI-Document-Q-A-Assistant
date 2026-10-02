import React, { createContext, useState, useEffect, useCallback } from 'react';
import {
  authApi,
  getStoredToken,
  getStoredUser,
  setStoredAuth,
  clearStoredAuth
} from '../services/api.js';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

  useEffect(() => {
    let isMounted = true;
    const verifySession = async () => {
      const existingToken = getStoredToken();
      if (!existingToken) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await authApi.getMe();
        if (isMounted && response?.user) {
          setUser(response.user);
          setToken(existingToken);
          setStoredAuth(existingToken, response.user);
        }
      } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 404) {
          if (isMounted) {
            logout();
          }
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    verifySession();
    return () => {
      isMounted = false;
    };
  }, [logout]);

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const data = await authApi.login({ email: normalizedEmail, password });
    if (!data?.token || !data?.user) {
      throw new Error('Authentication failed: invalid session response.');
    }
    setStoredAuth(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async ({ name, email, password }) => {
    const normalizedName = String(name ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const data = await authApi.register({
      name: normalizedName,
      email: normalizedEmail,
      password
    });
    if (!data?.token || !data?.user) {
      throw new Error('Registration failed: invalid session response.');
    }
    setStoredAuth(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: Boolean(token && user),
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
