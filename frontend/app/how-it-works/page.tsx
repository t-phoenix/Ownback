import type { Metadata } from "next";
import { PublicPage } from "../../components/public-page";
import { site } from "../../lib/site";

export const metadata: Metadata = {
  title: { absolute: "How Ownback works · Own what you buy" },
  description: "Snap a receipt, and Ownback puts 2–10% of the price into US-dollar jars for the companies behind the product. You review live prices and fees and approve every buy; shares land in your own wallet.",
  alternates: { canonical: "/how-it-works" },
  openGraph: { url: "/how-it-works", title: "How Ownback works", images: [site.ogImage] },
};

const steps = [
  { name: "Add a purchase", text: "Snap a receipt or an order screenshot, record a voice note, or type it in. A private AI model on 0G reads the shop, item, amount and date. The photo is deleted after reading; only those four fields are kept." },
  { name: "See who is behind it", text: "Ownback finds the maker, the companies that supply it and the materials inside it. For a ₹79,900 iPhone that is Apple, then TSMC, Qualcomm and Corning, then gold and silver. You can untick any of them." },
  { name: "Your share fills jars", text: "You choose 2–10% of each purchase (5% by default). It is split 70 / 20 / 10 across maker, suppliers and materials, in US dollars (USDC), into jars inside your own vault on Arc. A monthly limit you set is enforced by the vault contract." },
  { name: "You approve the buy", text: "When a jar reaches $5 (you can set $1–$50), we remind you on Sunday. You see the live price, the most you will pay (+1%) and every fee in dollars and percent, capped at 5% by default. Nothing buys without your OK." },
  { name: "Shares land in your wallet", text: "Approved buys go through the cheapest venue within your fee limit, and the shares land in your own Solana wallet. Each step leaves a public proof trail you can open." },
];

const faqs = [
  { q: "What is Ownback?", a: "Ownback turns a small share of what you spend into ownership of the companies behind the things you buy. You add a receipt, Ownback finds the maker, suppliers and materials, and saves 2–10% of the price in US-dollar jars that you approve buying into." },
  { q: "Does Ownback buy shares automatically?", a: "No. Jars only fill. Every buy needs you to review the live price and fees and approve it, and the vault checks that approval before any money moves." },
  { q: "Do I own real shares?", a: "You own tracker assets issued by third parties (for example xStocks) that follow the price of a company's stock. They sit in your own wallet, but they are not shares registered in your name." },
  { q: "Who holds my money?", a: "Your dollars wait in your own vault contract on Arc. The vault can only pay you: to send money to someone else you withdraw first and send it from your own wallet app." },
  { q: "What does it cost?", a: "Fees are shown in dollars and percent before every buy and are capped by you (5% of each buy by default). If fees would be higher, the jar waits. The network fee for saving a purchase is covered." },
  { q: "Is my receipt stored?", a: "No. Receipts and emails are read by a private AI model on 0G and are not stored. Only the shop, item, amount and date are kept, and you can delete them any time." },
  { q: "What if a brand isn't listed?", a: "If a brand is private or has no tracker yet, you can put your share into a fallback such as the S&P 500, or skip the purchase. Nothing is saved without your confirmation." },
  { q: "Where is Ownback available?", a: "Ownback isn't available in the US: the shares it buys aren't offered to US persons. It is built first for people in India and other non-US markets." },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "HowTo", name: "How to own a piece of what you buy with Ownback", description: metadata.description, totalTime: "PT1M", step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })) },
    { "@type": "FAQPage", mainEntity: faqs.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

export default function HowItWorks() {
  return <PublicPage kicker="How it works" title="Every purchase buys you a small piece of the company that made it." lede="Five steps, and you approve the one that moves money." updated="2026-11-07" jsonLd={jsonLd}>
    <ol className="prose-steps">
      {steps.map((s, i) => <li key={s.name}><span className="prose-num">{i + 1}</span><div><h2>{s.name}</h2><p>{s.text}</p></div></li>)}
    </ol>
    <h2 className="prose-h2" id="faq">Questions people ask</h2>
    <div className="faq">
      {faqs.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
    </div>
    <p className="prose-cta"><a className="button primary lg" href="/signin">Start owning what you buy</a></p>
  </PublicPage>;
}
