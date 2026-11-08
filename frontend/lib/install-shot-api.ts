/** Swap live API methods for wireframe fixtures. Call once before mounting /shots. */
import { api } from "./api";
import * as f from "./shot-fixtures";

let installed = false;

export function installShotApi() {
  if (installed) return;
  installed = true;
  api.me = async () => f.me;
  api.home = async () => f.home;
  api.jars = async () => f.jars;
  api.holdings = async () => f.holdings;
  api.receipts = async () => f.receipts;
  api.gmailState = async () => f.gmail;
  api.rules = async () => f.rules;
  api.activity = async () => ({ groups: [] });
  api.purchase = async () => f.purchase;
  api.buysReview = async () => ({ ...f.buyReview, expiresAt: new Date(Date.now() + 28_000).toISOString() });
  api.buyProgress = async () => f.buyDone;
  api.deselect = async () => f.purchase;
  api.makerOnly = async () => f.purchase;
  api.confirm = async () => ({ action: { kind: "typed_data" as const, typedData: {}, summary: "demo" } });
  api.confirmSubmitted = async () => ({ ...f.purchase, status: "saved" as const });
  api.buy = async () => ({ batchIds: [f.SHOT_IDS.batch] });
  api.putRules = async (patch) => ({ ...f.rules, ...patch });
}
