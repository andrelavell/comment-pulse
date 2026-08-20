import { env, kvGet, kvSet } from './storage.js';
import { GraphError } from './graph.js';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const LOG_KEY = 'replyLog';
const MAX_LOG = 500;

// Every reply sent through the app is logged so the AI can match past tone.
export async function logReply(entry) {
  const log = (await kvGet('moderation', LOG_KEY)) || [];
  log.push(entry);
  const cutoff = Date.now() - THIRTY_DAYS;
  await kvSet('moderation', LOG_KEY, log.filter((r) => r.at >= cutoff).slice(-MAX_LOG));
}

export async function recentReplies() {
  const log = (await kvGet('moderation', LOG_KEY)) || [];
  const cutoff = Date.now() - THIRTY_DAYS;
  return log.filter((r) => r.at >= cutoff);
}

export async function draftReply({ comment, pageName, instructions }) {
  const key = env('OPENAI_API_KEY');
  if (!key) {
    throw new GraphError(
      { message: 'No OpenAI API key configured. Add OPENAI_API_KEY to the environment.' },
      400
    );
  }

  const examples = (await recentReplies()).slice(-40);
  const exampleBlock = examples.length
    ? `Recent replies we sent in the last 30 days — match their tone and reuse their answers when the same question comes up:\n${examples
        .map((r) => `- Comment: "${(r.comment || '').slice(0, 200)}" → Our reply: "${r.reply}"`)
        .join('\n')}`
    : 'No past replies logged yet.';

  const system = [
    `You write short public replies to comments on Facebook ad posts, replying as the brand "${pageName}".`,
    instructions ? `Business context and reply guidelines from the brand:\n${instructions}` : '',
    `Rules:
- Keep it to 1-3 sentences, friendly and professional.
- Never invent prices, policies, discounts, or facts that aren't in the guidelines or past replies.
- If the comment is a complaint, be empathetic and offer a path to help.
- No hashtags, no emojis unless past replies use them.
- Output ONLY the reply text, nothing else.`,
  ].filter(Boolean).join('\n\n');

  const user = [
    comment.post?.message ? `The ad post being commented on:\n"""${comment.post.message.slice(0, 500)}"""` : '',
    `The comment to reply to:\n"""${comment.message || '(no text)'}"""`,
    exampleBlock,
    'Write the reply.',
  ].filter(Boolean).join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env('OPENAI_MODEL') || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GraphError({ message: json.error?.message || `OpenAI error (${res.status})` }, 502);
  }
  const draft = json.choices?.[0]?.message?.content?.trim();
  if (!draft) throw new GraphError({ message: 'OpenAI returned an empty reply' }, 502);
  return draft;
}
