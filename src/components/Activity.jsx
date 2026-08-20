import { useEffect, useState } from 'react';
import { api, timeAgo } from '../api.js';
import {
  ClockIcon, ReplyIcon, EyeIcon, EyeOffIcon, TrashIcon, BanIcon, CheckIcon, ShieldIcon,
} from './icons.jsx';

const ACTIONS = {
  reply: { icon: ReplyIcon, label: 'Replied' },
  hide: { icon: EyeOffIcon, label: 'Hid comment' },
  unhide: { icon: EyeIcon, label: 'Unhid comment' },
  delete: { icon: TrashIcon, label: 'Deleted', danger: true },
  autohide: { icon: ShieldIcon, label: 'Auto-hidden', auto: true },
  review: { icon: CheckIcon, label: 'Marked reviewed' },
  unreview: { icon: CheckIcon, label: 'Moved back to queue' },
  ban: { icon: BanIcon, label: 'Banned user', danger: true },
  unban: { icon: BanIcon, label: 'Unbanned user' },
};

const FILTERS = [
  { id: 'all', label: 'All actions' },
  { id: 'autohide', label: 'Auto-hidden' },
  { id: 'reply', label: 'Replies' },
  { id: 'hide', label: 'Hide / unhide' },
  { id: 'delete', label: 'Deletes' },
  { id: 'review', label: 'Reviews' },
];

function dayLabel(at) {
  const d = new Date(at);
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Activity({ pages, onClose }) {
  const [entries, setEntries] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.activity().then(({ activity }) => setEntries(activity)).catch(() => setEntries([]));
  }, []);

  const pageName = (id) => pages.find((p) => p.id === id)?.name;

  const list = (entries || []).filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'hide') return e.action === 'hide' || e.action === 'unhide';
    if (filter === 'review') return e.action === 'review' || e.action === 'unreview';
    return e.action === filter;
  });

  let lastDay = null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal activity-modal" role="dialog" aria-label="Activity log" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <ClockIcon size={18} />
          <strong>Activity</strong>
          <select
            className="activity-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter activity"
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <button className="feedback-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="activity-list">
          {!entries && <p className="profile-note">Loading…</p>}
          {entries && list.length === 0 && (
            <p className="profile-note">
              {filter === 'all'
                ? 'No activity yet. Every reply, hide, delete, review, ban, and auto-hide will be recorded here.'
                : 'No matching activity.'}
            </p>
          )}
          {list.map((e) => {
            const meta = ACTIONS[e.action] || { icon: ClockIcon, label: e.action };
            const Icon = meta.icon;
            const day = dayLabel(e.at);
            const header = day !== lastDay ? (lastDay = day) : null;
            return (
              <div key={e.id}>
                {header && <div className="activity-day">{header}</div>}
                <div className="activity-row">
                  <span className={`activity-icon ${meta.danger ? 'danger' : ''} ${meta.auto ? 'auto' : ''}`}>
                    <Icon size={13} />
                  </span>
                  <div className="activity-body">
                    <span className="activity-title">
                      <strong>{meta.label}</strong>
                      {meta.auto && <span className="flag autohidden">auto</span>}
                      {e.detail && <span className="activity-detail">{e.detail}</span>}
                    </span>
                    {e.comment && <span className="activity-quote">“{e.comment}”</span>}
                    <span className="mono activity-when">
                      {timeAgo(e.at)} ago
                      {pageName(e.pageId) ? ` · ${pageName(e.pageId)}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
