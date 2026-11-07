"use client";

import { useEffect } from "react";
import { Logo } from "../components/logo";

/** Last-resort boundary: calm copy (copy-and-errors.md), no codes, one way forward. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="error-page">
    <Logo />
    <h1 className="h-title">We couldn't load this.</h1>
    <p className="sub">Your money isn't affected.</p>
    <button className="button primary" onClick={reset}>Try again</button>
  </main>;
}
