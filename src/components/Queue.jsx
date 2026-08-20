import { useMemo, useState } from 'react';
import { timeAgo } from '../api.js';
import {
  CheckIcon, EyeIcon, EyeOffIcon, TrashIcon, ReplyIcon, RefreshIcon, SparkIcon, GearIcon,
  ShieldIcon, ThumbIcon, SearchIcon, ClockIcon, SquareCheckIcon,
} from './icons.jsx';

const FILTERS = [
  { id: 'all', label: 'All items' },
  { id: 'unanswered', label: 'Unanswered' },
  { id: 'questions', label: 'Questions' },
  { id: 'reactions', label: 'Has reactions' },
  { id: 'hidden', label: 'Hidden' },
];

const DATES = [
  { id: 'any', label: 'Any time' },
  { id: '1', label: 'Last 24 hours' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
];

export default function Queue({
  page, comments, tab, setTab, filter, setFilter, selectedId, onSelect,
  onReview, onReviewAll, onRefresh, loading, queueTotal, sweeping, pulsing,
  onQuickAction, onBulk, onOpenSettings, onOpenActivity,
}) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [query, setQuery] = useState('');
  const [adFilter, setAdFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('any');
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Hidden or page-replied comments count as handled: never in the queue.
  const handled = (c) =>
    c.reviewed || c.is_hidden || c.replies?.some((r) => r.isPageAuthor);
  const toReview = comments.filter((c) => !handled(c) && !c.autoHidden);
  const autoHidden = comments.filter((c) => c.autoHidden);

  const ads = useMemo(() => {
    const map = new Map();
    for (const c of comments) for (const a of c.ads || []) if (!map.has(a.id)) map.set(a.id, a.name);
    return [...map.entries()];
  }, [comments]);

  const q = query.trim().toLowerCase();
  const cutoff = dateFilter === 'any' ? 0 : Date.now() - Number(dateFilter) * 86400000;

  const list = {
    review: toReview,
    reviewed: comments.filter((c) => handled(c) && !c.autoHidden),
    autohidden: autoHidden,
    all: comments,
  }[tab].filter((c) => {
    if (filter === 'hidden' && !c.is_hidden) return false;
    if (filter === 'questions' && !(c.message || '').includes('?')) return false;
    if (filter === 'unanswered' && c.replies?.some((r) => r.isPageAuthor)) return false;
    if (filter === 'reactions' && !(c.reactions?.total > 0)) return false;
    if (adFilter !== 'all' && !c.ads?.some((a) => a.id === adFilter)) return false;
    if (cutoff && new Date(c.created_time).getTime() < cutoff) return false;
    if (q) {
      const hay = `${c.message || ''} ${c.from?.name || ''} ${(c.ads || []).map((a) => a.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const done = queueTotal - toReview.length;
  const progress = queueTotal > 0 ? done / queueTotal : 1;
  const filtersActive = q || adFilter !== 'all' || dateFilter !== 'any' || filter !== 'all';

  const checkedComments = list.filter((c) => checked.has(c.id));
  const toggleChecked = (id) =>
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const exitSelect = () => {
    setSelectMode(false);
    setChecked(new Set());
    setConfirmBulkDelete(false);
  };
  const bulk = (type) => {
    if (checkedComments.length === 0) return;
    onBulk(type, checkedComments);
    exitSelect();
  };
  const allVisibleChecked = list.length > 0 && list.every((c) => checked.has(c.id));

  return (
    <section className="queue">
      <header className="queue-head">
        <h1>{page ? page.name : 'Inbox'}</h1>
        <div className="queue-head-actions">
          <button className="icon-btn" onClick={onOpenActivity} title="Activity log" aria-label="Activity log">
            <ClockIcon size={15} />
          </button>
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
            onClick={() => { setTab(id); exitSelect(); }}
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

      <div className="queue-search">
        <SearchIcon size={14} />
        <input
          type="search"
          placeholder="Search comments, authors, ads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search comments"
        />
        {query && (
          <button className="queue-search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>
        )}
      </div>

      <div className="queue-tools">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter comments">
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date">
          {DATES.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
        {ads.length > 1 && (
          <select value={adFilter} onChange={(e) => setAdFilter(e.target.value)} aria-label="Filter by ad" className="ad-filter-select">
            <option value="all">All ads</option>
            {ads.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
        <span className="queue-tools-spacer" />
        {list.length > 0 && !selectMode && (
          <button className="link-btn" onClick={() => setSelectMode(true)} title="Select multiple comments">
            <SquareCheckIcon size={13} /> Select
          </button>
        )}
        {tab === 'review' && list.length > 0 && !selectMode && (
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
            {filtersActive && comments.length > 0 ? (
              <>
                <SearchIcon size={24} />
                <span>Nothing matches your search or filters.</span>
              </>
            ) : tab === 'review' && comments.length > 0 ? (
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
              selectMode && checked.has(c.id) ? 'checked' : '',
            ].join(' ')}
            onClick={() => (selectMode ? toggleChecked(c.id) : onSelect(c.id))}
          >
            <div className="card-top">
              {selectMode && (
                <input
                  type="checkbox"
                  className="card-check"
                  checked={checked.has(c.id)}
                  onChange={() => toggleChecked(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Select comment"
                />
              )}
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
                {c.reactions?.total > 0 && (
                  <span className="flag reactions" title={`${c.reactions.total} reaction${c.reactions.total > 1 ? 's' : ''}`}>
                    <ThumbIcon size={11} /> {c.reactions.total}
                  </span>
                )}
              </span>
              {!selectMode && (
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
              )}
            </div>
          </article>
        ))}
      </div>

      {selectMode && (
        <div className="bulk-bar">
          <label className="bulk-all">
            <input
              type="checkbox"
              checked={allVisibleChecked}
              onChange={() =>
                setChecked(allVisibleChecked ? new Set() : new Set(list.map((c) => c.id)))
              }
              aria-label="Select all visible"
            />
            <strong>{checked.size}</strong> selected
          </label>
          <span className="queue-tools-spacer" />
          {confirmBulkDelete ? (
            <span className="confirm-inline">
              Delete {checked.size}?
              <button className="link-btn danger-link" onClick={() => bulk('delete')}>Yes</button>
              <button className="link-btn muted" onClick={() => setConfirmBulkDelete(false)}>No</button>
            </span>
          ) : (
            <>
              <button className="bulk-btn" disabled={!checked.size} onClick={() => bulk('review')}>
                <CheckIcon size={13} /> Review
              </button>
              <button className="bulk-btn" disabled={!checked.size} onClick={() => bulk('hide')}>
                <EyeOffIcon size={13} /> Hide
              </button>
              <button className="bulk-btn danger" disabled={!checked.size} onClick={() => setConfirmBulkDelete(true)}>
                <TrashIcon size={13} /> Delete
              </button>
            </>
          )}
          <button className="link-btn muted" onClick={exitSelect}>Cancel</button>
        </div>
      )}
    </section>
  );
}
