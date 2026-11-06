"use client";

import { createContext, useContext } from "react";

export type Navigate = (path: string, opts?: { dir?: "fwd" | "back" | "left" | "right" }) => void;
export type AppCtx = { navigate: Navigate; notify: (message: string) => void; path: string };

export const App = createContext<AppCtx>({ navigate: () => {}, notify: () => {}, path: "/" });
export const useApp = () => useContext(App);
