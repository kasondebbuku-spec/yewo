// Login state + the live connection to the server, shared by every screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api, setApiToken } from './api';
import { API_URL } from './config';
import type { User } from './types';

const TOKEN_KEY = 'yewo.token';

type AuthState = {
  ready: boolean;
  user: User | null;
  socket: Socket | null;
  login: (phone: string, pin: string) => Promise<User>;
  register: (data: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const startSession = useCallback(async (t: string, u: User) => {
    setApiToken(t);
    await AsyncStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
    return u;
  }, []);

  // Restore a saved login when the app opens.
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(TOKEN_KEY);
      if (saved) {
        setApiToken(saved);
        try {
          const { user: u } = await api<{ user: User }>('/auth/me');
          setToken(saved);
          setUser(u);
        } catch {
          setApiToken(null);
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      }
      setReady(true);
    })();
  }, []);

  // One live connection per login.
  const socket = useMemo<Socket | null>(
    () => (token ? io(API_URL, { auth: { token }, transports: ['websocket'], autoConnect: false }) : null),
    [token]
  );
  useEffect(() => {
    if (!socket) return;
    socket.connect();
    return () => {
      socket.close();
    };
  }, [socket]);

  const login = useCallback(
    async (phone: string, pin: string) => {
      const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { phone, pin } });
      return startSession(r.token, r.user);
    },
    [startSession]
  );

  const register = useCallback(
    async (data: Record<string, unknown>) => {
      const r = await api<{ token: string; user: User }>('/auth/register', { method: 'POST', body: data });
      return startSession(r.token, r.user);
    },
    [startSession]
  );

  const logout = useCallback(async () => {
    setApiToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: u } = await api<{ user: User }>('/auth/me');
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, user, socket, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// Run `handler` whenever the server pushes `event`.
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
  const { socket } = useAuth();
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    if (!socket) return;
    const fn = (data: T) => onEvent(data);
    socket.on(event, fn);
    return () => {
      socket.off(event, fn);
    };
  }, [socket, event]);
}
