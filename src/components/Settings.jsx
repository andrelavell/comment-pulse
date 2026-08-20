import { useState } from 'react';
import { ShieldIcon } from './icons.jsx';

export default function Settings({ settings, onSave, onClose }) {
  const [autoHide, setAutoHide] = useState(settings.autoHide);
  const [text, setText] = useState(settings.keywords.join('\n'));
  const [enabledPages, setEnabledPages] = useState(settings.enabledPages || []);

  const keywords = text.split('\n').map((k) => k.trim()).filter(Boolean);
  const allPages = settings.allPages || [];

  const togglePage = (id) =>
    setEnabledPages((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <ShieldIcon size={18} />
          <strong>Settings</strong>
        </header>

        <div className="field-label">
          Pages in your inbox <span className="tab-n">{enabledPages.length}</span>
          <small>Only checked pages appear in the sidebar and get the 15-minute auto-hide sweep.</small>
        </div>
        <div className="page-picker">
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
          rows={10}
          spellCheck={false}
        />

        <footer className="modal-foot">
          <button className="pill-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="pill-btn primary"
            disabled={enabledPages.length === 0}
            title={enabledPages.length === 0 ? 'Select at least one page' : undefined}
            onClick={() => onSave({ autoHide, keywords, enabledPages })}
          >
            Save settings
          </button>
        </footer>
      </div>
    </div>
  );
}
