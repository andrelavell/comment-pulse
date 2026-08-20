import type { Config } from "@netlify/functions";
// @ts-ignore -- shared JS module
import { sweepKey } from "../../server/sweep-key.js";

// Scheduled functions are capped at 30 seconds, and a full sweep across all
// pages takes longer than that — so this just hands off to the background
// function, which has a 15-minute budget.
export default async (req: Request) => {
  const { next_run } = await req.json();
  const origin = Netlify.env.get("URL");
  await fetch(`${origin}/.netlify/functions/sweep-background`, {
    method: "POST",
    headers: { "x-sweep-key": sweepKey() },
  });
  console.log("Sweep dispatched. Next run:", next_run);
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
