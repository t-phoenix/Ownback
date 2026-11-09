import type { Metadata } from "next";
import { PublicPage } from "../../components/public-page";

export const metadata: Metadata = {
  title: "Risks",
  description: "What can go wrong with Ownback, in plain words: prices move, the assets are issued by third parties, it isn't for US persons, and it isn't advice.",
  alternates: { canonical: "/risks" },
};

const risks = [
  { h: "Prices go down as well as up", p: "What you own can be worth less than you put in. Ownback shows past prices and what you paid, never a promise about what comes next." },
  { h: "The assets are issued by third parties", p: "Ownback buys tracker assets from issuers such as xStocks. They follow a company's stock price but are not shares registered in your name. If an issuer pauses, changes or stops one, its value or tradability can be affected, and the jar waits." },
  { h: "Not for US persons", p: "The assets Ownback buys aren't offered to US persons, so Ownback isn't available in the US." },
  { h: "Not advice", p: "Ownback matches purchases to the companies behind them. It does not tell you what to buy, and nothing here is financial, legal or tax advice. Think about whether it suits you before you start." },
  { h: "Smart contracts and networks", p: "Your money waits in a vault contract on Arc and buys run on public networks. Contracts can have bugs, and networks can be slow or congested. Ownback limits what the vault can do (it can only pay you), but this risk can't be removed." },
  { h: "Fees and price moves", p: "Every buy shows fees in dollars and percent and won't go above your fee limit (5% of the buy by default) or more than 1% over the quoted price. If either would be crossed, the jar keeps its dollars until you approve again." },
  { h: "Early software", p: "Ownback is new. Start with amounts you're comfortable with, and you can withdraw your dollars at any time." },
];

export default function Risks() {
  return <PublicPage kicker="Honest about risk" title="Risks" lede="Read this before you put money in. It's short on purpose." updated="2026-11-07">
    <div className="prose-list">{risks.map(r => <section key={r.h}><h2>{r.h}</h2><p>{r.p}</p></section>)}</div>
  </PublicPage>;
}
