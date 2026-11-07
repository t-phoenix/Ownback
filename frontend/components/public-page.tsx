import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Server-rendered shell for the public, indexable pages (no client JS needed to read them). */
export function PublicPage({ kicker, title, lede, updated, children, jsonLd }: { kicker: string; title: string; lede: string; updated: string; children: ReactNode; jsonLd?: object }) {
  return <div className="public">
    <header className="public-head">
      <a href="/" className="public-logo" aria-label="Ownback home"><Logo /></a>
      <nav aria-label="Site" className="public-nav">
        <a href="/how-it-works">How it works</a>
        <a href="/risks">Risks</a>
        <a href="/signin" className="button primary sm">Open the app</a>
      </nav>
    </header>
    <main className="public-main">
      <article className="prose">
        <p className="kicker">{kicker}</p>
        <h1 className="h-display">{title}</h1>
        <p className="lede left">{lede}</p>
        <p className="fineprint updated">Last updated <time dateTime={updated}>{new Date(updated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</time></p>
        {children}
      </article>
    </main>
    <footer className="public-foot">
      <Logo compact />
      <span>Own what you buy.</span>
      <nav aria-label="Legal"><a href="/how-it-works">How it works</a><a href="/risks">Risks</a><a href="/terms">Terms</a></nav>
    </footer>
    {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
  </div>;
}
