import type { Metadata } from "next";
import { PublicPage } from "../../components/public-page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The plain-language terms for using Ownback.",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

/* Plain-language summary of how the product behaves. Legal must review before launch: see the note at the top. */
const terms = [
  { h: "Who can use Ownback", p: "You must be an adult where you live and not a US person. You're responsible for keeping your Google account or seed phrase safe; anyone with it can use your Ownback." },
  { h: "Your wallet, your vault", p: "Ownback creates a wallet tied to your sign-in, and your dollars wait in your own vault contract. The vault can only pay you. We can't move your money to anyone else." },
  { h: "Nothing buys without your OK", p: "Saving a purchase moves your chosen share into jars. Buying needs your separate approval of the live price and fees. If a price or fee moves past your limits, the buy doesn't happen and the dollars stay in the jar." },
  { h: "Receipts and data", p: "Receipts, screenshots, voice notes and emails are read by a private AI model and not stored. We keep the shop, item, amount and date so we can show your history and enforce limits. You can download or delete this data from Settings." },
  { h: "Fees", p: "Fees are shown before every buy, in dollars and percent, and are capped by the limit you set." },
  { h: "Third-party assets and networks", p: "The assets you buy are issued by third parties and move on public networks we don't control. Read the Risks page before you start." },
];

export default function Terms() {
  return <PublicPage kicker="Plain language" title="Terms" lede="How Ownback works with your money and your data." updated="2026-11-07">
    <p className="draft-note" role="note">This summary describes how the product works today. It is a draft pending legal review and will be replaced by the full terms before public launch.</p>
    <div className="prose-list">{terms.map(t => <section key={t.h}><h2>{t.h}</h2><p>{t.p}</p></section>)}</div>
    <p className="fineprint">Also read the <a href="/risks">Risks</a>.</p>
  </PublicPage>;
}
