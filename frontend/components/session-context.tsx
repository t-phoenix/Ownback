"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { Me } from "../lib/api";

export type Session = {
  /** undefined = still checking, null = signed out */
  me: Me | null | undefined;
  refresh: () => Promise<Me | null>;
  signIn: () => void;
  signOut: () => Promise<void>;
  busy: boolean;
  error: string | null;
  configured: boolean;
};

export const SessionCtx = createContext<Session>({
  me: undefined, refresh: async () => null, signIn: () => {}, signOut: async () => {},
  busy: false, error: null, configured: false,
});

export const useSession = () => useContext(SessionCtx);

/** Fixture session for /shots — no Privy, no network. */
export function MockSessionProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  const value = useMemo<Session>(() => ({
    me, refresh: async () => me, busy: false, error: null, configured: true,
    signIn: () => {}, signOut: async () => {},
  }), [me]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
