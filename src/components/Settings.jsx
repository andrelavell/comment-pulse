import { useState } from 'react';
import { ShieldIcon } from './icons.jsx';

export default function Settings({ settings, onSave, onClose }) {
  const [autoHide, setAutoHide] = useState(settings.autoHide);
  const [text, setText] = useState(settings.keywords.join('\n'));

  const keywords = text.split('\n').map((k) => k.trim()).filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Moderation settings" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <ShieldIcon size={18} />
          <strong>Auto-hide settings</strong>
        </header>

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
              load, across every page, and land in the Auto-hidden tab. Unhiding a
              comment yourself is final — it won't be re-hidden.
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

        <footer className="modal-foot">
          <button className="pill-btn ghost" onClick={onClose}>Cancel</button>
          <button className="pill-btn primary" onClick={() => onSave({ autoHide, keywords })}>
            Save settings
          </button>
        </footer>
      </div>
    </div>
  );
}
