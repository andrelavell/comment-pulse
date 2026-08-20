import type { Context } from "@netlify/functions";
// @ts-ignore -- shared JS module
import { service } from "../../server/service.js";
// @ts-ignore -- shared JS module
import { sweepKey } from "../../server/sweep-key.js";

// Background function (15-minute budget): rebuilds the ad index, refreshes
// comments for every page, auto-hides keyword matches, and stores queue
// counts in Blobs for the UI to read.
export default async (req: Request, _context: Context) => {
  if (req.headers.get("x-sweep-key") !== sweepKey()) {
    console.warn("Sweep rejected: bad key");
    return;
  }
  try {
    const result = await service.sweep();
    console.log("Sweep result:", JSON.stringify(result));
  } catch (e: any) {
    console.error("Sweep threw:", e?.stack || e?.message);
    await service.recordSweepError(e?.message || String(e)).catch(() => {});
  }
};
