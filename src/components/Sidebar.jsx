import { useState } from 'react';
import { timeAgo } from '../api.js';
import { SearchIcon, RefreshIcon, InboxIcon } from './icons.jsx';

export default function Sidebar({ pages, counts, selectedPageId, onSelect, onReload, reloading, lastSweep, statusError, countsLoaded, configuredPageCount, open, onClose }) {
  const [q, setQ] = useState('');
  const filtered = pages.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const totalQueue = pages.reduce((n, p) => n + (counts[p.id]?.toReview || 0), 0);
  const complete = countsLoaded && pages.length > 0 && pages.every((p) => counts[p.id]);

  return (
    <>
    {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-mark"><InboxIcon size={18} /></div>
        <div>
          <div className="brand-name">Ad Comments</div>
          <div className="brand-sub">moderation inbox</div>
        </div>
      </div>

      <div className="sidebar-search">
        <SearchIcon size={14} />
        <input
          placeholder="Search pages"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search pages"
        />
      </div>

      <div className="sidebar-section">
        <span>Pages with ads</span>
        <button
          className={`icon-btn ${reloading ? 'spinning' : ''}`}
          onClick={onReload}
          disabled={reloading}
          title="Re-sync pages and ads"
          aria-label="Re-sync pages and ads"
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      <nav className="page-list">
        {filtered.map((p) => {
          const c = counts[p.id];
          return (
            <button
              key={p.id}
              className={`page-item ${p.id === selectedPageId ? 'active' : ''}`}
              onClick={() => { onSelect(p.id); onClose?.(); }}
            >
              {p.picture?.data?.url ? (
                <img className="avatar" src={p.picture.data.url} alt="" />
              ) : (
                <div className="avatar avatar-fallback">{p.name[0]}</div>
              )}
              <span className="page-name">{p.name}</span>
              {c ? (
                c.toReview > 0 ? (
                  <span className="count-pill">{c.toReview}</span>
                ) : (
                  <span className="count-pill clear">0</span>
                )
              ) : (
                <span className="count-pill idle">{p.adPosts}</span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && <div className="side-empty">{
          pages.length ? `No pages match "${q}"` : statusError ? 'Pages unavailable. Re-sync when the connection recovers.' : configuredPageCount ? 'No pages loaded. Try re-syncing pages and ads.' : 'No pages enabled. Choose pages in Settings.'
        }</div>}
      </nav>

      <div className="sidebar-foot">
        <div className="foot-row">
          <span className={`foot-dot ${statusError || !complete ? 'uncertain' : ''}`} />
          {statusError ? 'Sync needs attention' : !pages.length ? 'No pages loaded' : !complete ? 'Queue status unavailable' : totalQueue > 0 ? `${totalQueue} awaiting review` : 'Queues clear'}
        </div>
        {lastSweep && (
          <div className="foot-sync" title={new Date(lastSweep).toLocaleString()}>
            Last successful check {timeAgo(lastSweep)} ago
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
