import { useState } from 'react';
import { timeAgo } from '../api.js';
import {
  CheckIcon, EyeIcon, EyeOffIcon, TrashIcon, ReplyIcon, RefreshIcon, SparkIcon, GearIcon, ShieldIcon,
} from './icons.jsx';

const FILTERS = [
  { id: 'all', label: 'All items' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'questions', label: 'Questions' },
  { id: 'hidden', label: 'Hidden' },
];

export default function Queue({
  page, comments, tab, setTab, filter, setFilter, selectedId, onSelect,
  onReview, onReviewAll, onRefresh, loading, queueTotal, sweeping, pulsing,
  onQuickAction, onOpenSettings,
}) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Hidden or page-replied comments count as handled: never in the queue.
  const handled = (c) =>
    c.reviewed || c.is_hidden || c.replies?.some((r) => r.isPageAuthor);
  const toReview = comments.filter((c) => !handled(c) && !c.autoHidden);
  const autoHidden = comments.filter((c) => c.autoHidden);
  const list = {
    review: toReview,
    reviewed: comments.filter((c) => handled(c) && !c.autoHidden),
    autohidden: autoHidden,
    all: comments,
  }[tab].filter((c) => {
    if (filter === 'hidden') return c.is_hidden;
    if (filter === 'questions') return (c.message || '').includes('?');
    if (filter === 'unanswered') return !c.replies?.some((r) => r.isPageAuthor);
    return true;
  });

  const done = queueTotal - toReview.length;
  const progress = queueTotal > 0 ? done / queueTotal : 1;

  return (
    <section className="queue">
      <header className="queue-head">
        <h1>{page ? page.name : 'Inbox'}</h1>
        <div className="queue-head-actions">
          <button className="icon-btn" onClick={onOpenSettings} title="Moderation settings" aria-label="Moderation settings">
            <GearIcon size={15} />
          </button>
          <button className={`icon-btn ${loading ? 'spinning' : ''}`} onClick={onRefresh} title="Refresh comments" aria-label="Refresh comments">
            <RefreshIcon size={15} />
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {[
          ['review', 'To review', toReview.length],
          ['reviewed', 'Reviewed', comments.filter((c) => handled(c) && !c.autoHidden).length],
          ['autohidden', 'Auto-hidden', autoHidden.length],
          ['all', 'All', comments.length],
        ].map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label} <span className="tab-n">{n}</span>
          </button>
        ))}
      </div>

      {queueTotal > 0 && (
        <div className="queue-meter" title={`${done} of ${queueTotal} reviewed`}>
          <div className="queue-meter-bar" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}

      <div className="queue-tools">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter comments">
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        {tab === 'review' && list.length > 0 && (
          confirmAll ? (
            <span className="confirm-inline">
              Review all {list.length}?
              <button className="link-btn" onClick={() => { onReviewAll(list); setConfirmAll(false); }}>Yes</button>
              <button className="link-btn muted" onClick={() => setConfirmAll(false)}>No</button>
            </span>
          ) : (
            <button className="link-btn" onClick={() => setConfirmAll(true)}>Review all</button>
          )
        )}
      </div>

      <div className="card-list">
        {loading && comments.length === 0 && (
          <div className="queue-empty"><span className="loader" /> Loading comments…</div>
        )}
        {!loading && list.length === 0 && (
          <div className="queue-empty">
            {tab === 'review' && comments.length > 0 ? (
              <>
                <SparkIcon size={28} />
                <strong>All clear</strong>
                <span>Every comment on this page has been reviewed.</span>
              </>
            ) : tab === 'autohidden' ? (
              <>
                <ShieldIcon size={26} />
                <span>Nothing auto-hidden yet. Comments matching your keyword list are hidden as they load.</span>
              </>
            ) : (
              <span>No comments here yet.</span>
            )}
          </div>
        )}
        {list.map((c) => (
          <article
            key={c.id}
            className={[
              'card',
              c.id === selectedId ? 'selected' : '',
              sweeping.has(c.id) ? 'sweep-out' : '',
              pulsing?.has(c.id) ? 'pulse' : '',
              c.is_hidden ? 'is-hidden' : '',
            ].join(' ')}
            onClick={() => onSelect(c.id)}
          >
            <div className="card-top">
              {c.from?.picture?.data?.url ? (
                <img className="avatar sm" src={c.from.picture.data.url} alt="" />
              ) : (
                <div className="avatar sm avatar-fallback">{(c.from?.name || 'F')[0]}</div>
              )}
              <span className="card-author">{c.from?.name || 'Facebook user'}</span>
              <span className="card-time">{timeAgo(c.created_time)}</span>
            </div>
            <p className="card-msg">{c.message || <em>(no text — sticker or photo)</em>}</p>
            <div className="card-foot">
              <span className="creative-chip" title={c.ads.map((a) => a.name).join(', ')}>
                {c.adActive && <span className="live-dot" />}
                {c.ads[0]?.name || 'Ad post'}
              </span>
              <span className="card-flags">
                {c.autoHidden ? (
                  <span className="flag autohidden" title={`Matched "${c.autoHidden.keyword}"`}>
                    <ShieldIcon size={12} /> {c.autoHidden.keyword}
                  </span>
                ) : c.is_hidden ? (
                  <span className="flag hiddenf"><EyeOffIcon size={12} /> hidden</span>
                ) : null}
                {c.replies?.some((r) => r.isPageAuthor) && (
                  <span className="flag replied"><ReplyIcon size={12} /> replied</span>
                )}
              </span>
              <span className="card-actions" onClick={(e) => e.stopPropagation()}>
                {confirmDeleteId === c.id ? (
                  <span className="confirm-inline">
                    Delete?
                    <button
                      className="link-btn danger-link"
                      onClick={() => { onQuickAction('delete', c); setConfirmDeleteId(null); }}
                    >
                      Yes
                    </button>
                    <button className="link-btn muted" onClick={() => setConfirmDeleteId(null)}>No</button>
                  </span>
                ) : (
                  <>
                    <button
                      className="card-tool"
                      disabled={!c.can_hide}
                      title={c.is_hidden ? 'Unhide comment' : 'Hide comment'}
                      aria-label={c.is_hidden ? 'Unhide comment' : 'Hide comment'}
                      onClick={() => onQuickAction('hide', c, !c.is_hidden)}
                    >
                      {c.is_hidden ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                    </button>
                    <button
                      className="card-tool danger"
                      disabled={!c.can_remove}
                      title="Delete comment"
                      aria-label="Delete comment"
                      onClick={() => setConfirmDeleteId(c.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                    <button
                      className={`review-btn ${c.reviewed ? 'done' : ''}`}
                      title={c.reviewed ? 'Move back to queue' : 'Mark reviewed'}
                      aria-label={c.reviewed ? 'Move back to queue' : 'Mark reviewed'}
                      onClick={() => onReview(c, !c.reviewed)}
                    >
                      <CheckIcon size={14} />
                    </button>
                  </>
                )}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
