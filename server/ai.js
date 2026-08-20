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

const FEEDBACK_KEY = 'aiFeedback';

// Standing corrections: saved once, served in every prompt until deleted.
export async function listFeedback() {
  return (await kvGet('moderation', FEEDBACK_KEY)) || [];
}

export async function addFeedback({ highlight, feedback }) {
  const list = await listFeedback();
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    highlight: String(highlight || '').slice(0, 500),
    feedback: String(feedback || '').slice(0, 1000),
  };
  list.push(entry);
  await kvSet('moderation', FEEDBACK_KEY, list);
  return entry;
}

export async function deleteFeedback(id) {
  const list = await listFeedback();
  await kvSet('moderation', FEEDBACK_KEY, list.filter((f) => f.id !== id));
}

export async function draftReply({ comment, instructions, model: modelSetting, reasoning }) {
  const key = env('OPENAI_API_KEY');
  if (!key) {
    throw new GraphError(
      { message: 'No OpenAI API key configured. Add OPENAI_API_KEY to the environment.' },
      400
    );
  }

  if (!instructions?.trim()) {
    throw new GraphError(
      { message: 'Add your AI reply instructions in Settings first — that is the prompt.' },
      400
    );
  }

  // Every reply sent in the last 30 days, as reference material.
  const examples = (await recentReplies()).slice(-200);
  const exampleBlock = examples.length
    ? `Replies we sent in the last 30 days:\n${examples
        .map((r) => `- Comment: "${(r.comment || '').slice(0, 300)}" → Our reply: "${r.reply}"`)
        .join('\n')}`
    : '';

  // Standing corrections from past feedback, always appended to the prompt.
  const feedback = await listFeedback();
  const feedbackBlock = feedback.length
    ? `\n\nStanding corrections from the brand — ALWAYS follow these:\n${feedback
        .map((f) =>
          `- ${f.feedback}${f.highlight ? ` (this was given about a past draft that said: "${f.highlight.slice(0, 200)}")` : ''}`
        )
        .join('\n')}`
    : '';

  // The system prompt comes entirely from Settings; code only supplies the data.
  const user = [
    comment.post?.message ? `The ad post being commented on:\n"""${comment.post.message.slice(0, 800)}"""` : '',
    `The comment to reply to:\n"""${comment.message || '(no text)'}"""`,
    exampleBlock,
    'Write only the reply text, nothing else.',
  ].filter(Boolean).join('\n\n');

  const model = modelSetting || env('OPENAI_MODEL') || 'gpt-5';
  const body = {
    model,
    messages: [
      { role: 'system', content: instructions + feedbackBlock },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 4000,
  };
  if (model.startsWith('gpt-5') || model.startsWith('o')) {
    body.reasoning_effort = reasoning || 'low';
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GraphError({ message: json.error?.message || `OpenAI error (${res.status})` }, 502);
  }
  const draft = json.choices?.[0]?.message?.content?.trim();
  if (!draft) throw new GraphError({ message: 'OpenAI returned an empty reply' }, 502);
  return draft;
}
