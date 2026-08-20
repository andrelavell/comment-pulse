import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ShieldIcon, SparkIcon, InboxIcon, GearIcon } from './icons.jsx';

const MODELS = [
  { id: 'gpt-5', label: 'GPT-5', hint: 'Smartest — recommended' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', hint: 'Faster, cheaper' },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', hint: 'Fastest, most basic' },
  { id: 'gpt-4o', label: 'GPT-4o', hint: 'Previous generation' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', hint: 'Previous gen, cheap' },
];

const REASONING = [
  { id: 'minimal', label: 'Minimal', hint: 'Instant, least thought' },
  { id: 'low', label: 'Low', hint: 'Fast — recommended' },
  { id: 'medium', label: 'Medium', hint: 'Slower, more careful' },
  { id: 'high', label: 'High', hint: 'Slowest, most thorough' },
];

const TABS = [
  { id: 'pages', label: 'Pages', icon: InboxIcon },
  { id: 'autohide', label: 'Auto-hide', icon: ShieldIcon },
  { id: 'ai', label: 'AI replies', icon: SparkIcon },
  { id: 'feedback', label: 'Feedback', icon: GearIcon },
];

export default function Settings({ settings, onSave, onClose }) {
  const [tab, setTab] = useState('pages');
  const [autoHide, setAutoHide] = useState(settings.autoHide);
  const [text, setText] = useState(settings.keywords.join('\n'));
  const [enabledPages, setEnabledPages] = useState(settings.enabledPages || []);
  const [aiPrompt, setAiPrompt] = useState(settings.aiPrompt || '');
  const [aiModel, setAiModel] = useState(settings.aiModel || 'gpt-5');
  const [aiReasoning, setAiReasoning] = useState(settings.aiReasoning || 'low');
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    api.feedback().then(({ feedback }) => setFeedback(feedback)).catch(() => setFeedback([]));
  }, []);

  const removeFeedback = async (id) => {
    setFeedback((f) => f.filter((x) => x.id !== id));
    try {
      await api.deleteFeedback(id);
    } catch {
      api.feedback().then(({ feedback }) => setFeedback(feedback)).catch(() => {});
    }
  };

  const keywords = text.split('\n').map((k) => k.trim()).filter(Boolean);
  const allPages = settings.allPages || [];
  const reasoningApplies = aiModel.startsWith('gpt-5');

  const togglePage = (id) =>
    setEnabledPages((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-tabbed" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <GearIcon size={18} />
          <strong>Settings</strong>
        </header>

        <div className="modal-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`modal-tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'pages' && (
            <>
              <div className="field-label">
                Pages in your inbox <span className="tab-n">{enabledPages.length} of {allPages.length}</span>
                <small>Only checked pages appear in the sidebar and get the 15-minute auto-hide sweep.</small>
              </div>
              <div className="page-picker tall">
                {allPages.map((p) => (
                  <label key={p.id} className="page-pick">
                    <input
                      type="checkbox"
                      checked={enabledPages.includes(p.id)}
                      onChange={() => togglePage(p.id)}
                    />
                    {p.picture?.data?.url ? (
                      <img className="avatar sm" src={p.picture.data.url} alt="" />
                    ) : (
                      <div className="avatar sm avatar-fallback">{p.name[0]}</div>
                    )}
                    <span className="page-pick-name">{p.name}</span>
                    <span className="mono">{p.adPosts} ad posts</span>
                  </label>
                ))}
                {allPages.length === 0 && (
                  <p className="profile-note">Page list is still syncing — try again in a minute.</p>
                )}
              </div>
            </>
          )}

          {tab === 'autohide' && (
            <>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={autoHide}
                  onChange={(e) => setAutoHide(e.target.checked)}
                />
                <span>
                  <strong>Hide matching comments automatically</strong>
                  <small>
                    New comments containing any keyword below are hidden the moment they
                    load, across every enabled page, and land in the Auto-hidden tab.
                    Unhiding a comment yourself is final — it won't be re-hidden.
                  </small>
                </span>
              </label>

              <label className="field-label" htmlFor="kw">
                Keywords &amp; phrases <span className="tab-n">{keywords.length}</span>
                <small>One per line. Whole-word match, case doesn't matter.</small>
              </label>
              <textarea
                id="kw"
                className="keywords-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                spellCheck={false}
              />
            </>
          )}

          {tab === 'ai' && (
            <>
              <div className="ai-selects">
                <label className="field-label">
                  Model
                  <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Reasoning effort
                  <select
                    value={aiReasoning}
                    onChange={(e) => setAiReasoning(e.target.value)}
                    disabled={!reasoningApplies}
                    title={reasoningApplies ? undefined : 'Reasoning effort only applies to GPT-5 models'}
                  >
                    {REASONING.map((r) => (
                      <option key={r.id} value={r.id}>{r.label} — {r.hint}</option>
                    ))}
                  </select>
                  {!reasoningApplies && <small>Only applies to GPT-5 models.</small>}
                </label>
              </div>

              <label className="field-label" htmlFor="aiprompt">
                AI reply instructions
                <small>
                  This is the entire prompt GPT gets with every "Respond with AI" draft —
                  who you are, what you sell, policies, tone. It also receives the comment,
                  the ad post, and every reply sent in the last 30 days.
                </small>
              </label>
              <textarea
                id="aiprompt"
                className="keywords-input"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={12}
                placeholder={'Example:\nWe sell OTC hearing aids ($249, 45-day returns, free US shipping).\nTone: warm, helpful, concise. For support issues point to support@ourbrand.com.\nNever promise discounts or medical outcomes.'}
                spellCheck={false}
              />
            </>
          )}
          {tab === 'feedback' && (
            <>
              <div className="field-label">
                AI feedback {feedback && <span className="tab-n">{feedback.length}</span>}
                <small>
                  Standing corrections you've given by highlighting AI drafts. Each one is
                  served with every future draft until you remove it.
                </small>
              </div>
              {!feedback ? (
                <p className="profile-note">Loading…</p>
              ) : feedback.length === 0 ? (
                <p className="profile-note">
                  No feedback yet. Highlight part of an AI draft in the reply box and click
                  "Give feedback" to add your first correction.
                </p>
              ) : (
                <div className="feedback-list">
                  {[...feedback].reverse().map((f) => (
                    <div key={f.id} className="feedback-item">
                      <div className="feedback-item-body">
                        <strong>{f.feedback}</strong>
                        {f.comment && (
                          <span className="feedback-item-quote">comment: “{f.comment.slice(0, 120)}{f.comment.length > 120 ? '…' : ''}”</span>
                        )}
                        {f.highlight && (
                          <span className="feedback-item-quote">draft said: “{f.highlight.slice(0, 120)}{f.highlight.length > 120 ? '…' : ''}”</span>
                        )}
                        <span className="mono">{new Date(f.at).toLocaleDateString()}</span>
                      </div>
                      <button
                        className="feedback-x"
                        title="Remove this feedback"
                        aria-label="Remove this feedback"
                        onClick={() => removeFeedback(f.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="modal-foot">
          <button className="pill-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="pill-btn primary"
            disabled={enabledPages.length === 0}
            title={enabledPages.length === 0 ? 'Select at least one page (Pages tab)' : undefined}
            onClick={() => onSave({ autoHide, keywords, enabledPages, aiPrompt, aiModel, aiReasoning })}
          >
            Save settings
          </button>
        </footer>
      </div>
    </div>
  );
}
