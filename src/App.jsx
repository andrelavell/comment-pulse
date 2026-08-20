import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Queue from './components/Queue.jsx';
import Detail from './components/Detail.jsx';
import Settings from './components/Settings.jsx';
import Login from './components/Login.jsx';

let toastId = 0;

export default function App() {
  const [pages, setPages] = useState([]);
  const [counts, setCounts] = useState({});
  const [bootError, setBootError] = useState(null);
  const [booting, setBooting] = useState(true);
  const [reloading, setReloading] = useState(false);

  const [pageId, setPageId] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('review');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [sweeping, setSweeping] = useState(new Set());
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [building, setBuilding] = useState(false);
  const [lastSweep, setLastSweep] = useState(null);
  const queueTotal = useRef(0);

  const toast = useCallback((text, kind = 'info') => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const { counts, lastSweep } = await api.overview();
      setCounts((c) => ({ ...c, ...counts }));
      setLastSweep(lastSweep);
    } catch {}
  }, []);

  const boot = useCallback(async (force = false) => {
    setReloading(true);
    try {
      const res = await api.bootstrap(force);
      if (res.building) {
        // First-ever load: the server is syncing pages and ads in the
        // background. Poll until the index is ready.
        setBuilding(true);
        setBooting(false);
        setReloading(false);
        setTimeout(() => boot(), 8000);
        return;
      }
      setBuilding(false);
      setPages(res.pages);
      setBootError(null);
      setNeedsLogin(false);
      refreshCounts();
      if (res.pages.length && !res.pages.some((p) => p.id === pageId)) {
        setPageId(res.pages[0].id);
      }
    } catch (e) {
      if (e.authRequired) setNeedsLogin(true);
      else setBootError(e.message);
    } finally {
      setBooting(false);
      setReloading(false);
    }
  }, [pageId]);

  useEffect(() => {
    boot();
    api.settings().then(setSettings).catch(() => {});
  }, []); // eslint-disable-line

  const onLogin = () => {
    setNeedsLogin(false);
    setBooting(true);
    boot();
    api.settings().then(setSettings).catch(() => {});
  };

  const saveSettings = async (next) => {
    try {
      const saved = await api.saveSettings(next);
      setSettings((s) => ({ ...s, ...saved }));
      setSettingsOpen(false);
      toast('Settings saved');
      boot(); // page list may have changed
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const loadComments = useCallback(async (pid, force = false) => {
    setLoading(true);
    try {
      const { comments } = await api.comments(pid, force);
      setComments(comments);
      const toReview = comments.filter((c) => !c.reviewed && !c.autoHidden && !c.is_hidden).length;
      queueTotal.current = Math.max(toReview, queueTotal.current && !force ? queueTotal.current : toReview);
      setCounts((c) => ({ ...c, [pid]: { total: comments.length, toReview } }));
    } catch (e) {
      if (e.authRequired) setNeedsLogin(true);
      else toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!pageId) return;
    setComments([]);
    setSelectedId(null);
    queueTotal.current = 0;
    loadComments(pageId);
  }, [pageId, loadComments]);

  useEffect(() => {
    const t = setInterval(refreshCounts, 60000);
    return () => clearInterval(t);
  }, [refreshCounts]);

  // Pull fresh comments for the open page every 15 minutes, matching the
  // server's background auto-hide sweep.
  useEffect(() => {
    if (!pageId) return;
    const t = setInterval(() => loadComments(pageId), 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [pageId, loadComments]);

  const page = useMemo(() => pages.find((p) => p.id === pageId), [pages, pageId]);
  const selected = useMemo(() => comments.find((c) => c.id === selectedId), [comments, selectedId]);

  const patch = (id, changes) =>
    setComments((cs) => cs.map((c) => (c.id === id ? { ...c, ...changes } : c)));

  const syncCount = (list) =>
    setCounts((c) => ({
      ...c,
      [pageId]: {
        total: list.length,
        toReview: list.filter((x) => !x.reviewed && !x.autoHidden && !x.is_hidden).length,
      },
    }));

  const sweepThen = (id, fn) => {
    setSweeping((s) => new Set(s).add(id));
    setTimeout(() => {
      setSweeping((s) => { const n = new Set(s); n.delete(id); return n; });
      fn();
    }, 360);
  };

  const [pulsing, setPulsing] = useState(new Set());
  const pulseCard = (id) => {
    setPulsing((s) => new Set(s).add(id));
    setTimeout(() => {
      setPulsing((s) => { const n = new Set(s); n.delete(id); return n; });
    }, 700);
  };

  // All actions are optimistic: the queue updates instantly and the API call
  // runs in the background. If the call fails, the previous state is restored.
  const applyOptimistic = (updater) =>
    setComments((cs) => {
      const next = updater(cs);
      syncCount(next);
      return next;
    });

  const runInBackground = (promise, snapshot, failMessage) => {
    promise.catch((e) => {
      if (e.authRequired) return setNeedsLogin(true);
      setComments(snapshot);
      syncCount(snapshot);
      toast(`${failMessage}: ${e.message}`, 'error');
    });
  };

  const handleReview = (comment, reviewed) => {
    const snapshot = comments;
    const apply = () => applyOptimistic((cs) =>
      cs.map((c) => (c.id === comment.id ? { ...c, reviewed } : c))
    );
    if (reviewed && tab === 'review') sweepThen(comment.id, apply);
    else apply();
    runInBackground(api.review([comment.id], reviewed), snapshot, 'Review failed');
  };

  const handleReviewAll = (list) => {
    const snapshot = comments;
    const ids = new Set(list.map((c) => c.id));
    applyOptimistic((cs) => cs.map((c) => (ids.has(c.id) ? { ...c, reviewed: true } : c)));
    toast(`${list.length} comments marked reviewed`);
    runInBackground(api.review([...ids], true), snapshot, 'Review failed');
  };

  const handleAction = (type, comment, payload) => {
    const snapshot = comments;
    switch (type) {
      case 'review':
        handleReview(comment, payload);
        break;
      case 'reply': {
        const tempId = `tmp_${Date.now()}`;
        applyOptimistic((cs) =>
          cs.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  reviewed: true,
                  replies: [
                    ...(c.replies || []),
                    { id: tempId, message: payload, isPageAuthor: true, from: { name: page?.name } },
                  ],
                }
              : c
          )
        );
        toast('Reply sent and marked reviewed');
        runInBackground(
          api.reply(comment.id, pageId, payload).then(({ id }) => {
            if (id) {
              setComments((cs) =>
                cs.map((c) =>
                  c.id === comment.id
                    ? { ...c, replies: c.replies.map((r) => (r.id === tempId ? { ...r, id } : r)) }
                    : c
                )
              );
            }
          }),
          snapshot,
          'Reply failed'
        );
        break;
      }
      case 'hide': {
        const apply = () =>
          applyOptimistic((cs) =>
            cs.map((c) =>
              c.id === comment.id
                ? { ...c, is_hidden: payload, reviewed: payload ? true : c.reviewed }
                : c
            )
          );
        // Hiding removes the card from the To review queue: sweep it out.
        // Anywhere else the card stays, so pulse it to confirm the change.
        if (payload && tab === 'review') sweepThen(comment.id, apply);
        else { apply(); pulseCard(comment.id); }
        toast(payload ? 'Comment hidden and marked reviewed' : 'Comment is visible again');
        runInBackground(api.hide(comment.id, pageId, payload), snapshot, 'Hide failed');
        break;
      }
      case 'deleteReply':
        applyOptimistic((cs) =>
          cs.map((c) =>
            c.id === comment.id
              ? { ...c, replies: (c.replies || []).filter((r) => r.id !== payload.id) }
              : c
          )
        );
        toast('Reply deleted');
        runInBackground(api.remove(payload.id, pageId), snapshot, 'Delete failed');
        break;
      case 'delete':
        sweepThen(comment.id, () =>
          applyOptimistic((cs) => cs.filter((c) => c.id !== comment.id))
        );
        if (selectedId === comment.id) setSelectedId(null);
        toast('Comment deleted');
        runInBackground(api.remove(comment.id, pageId), snapshot, 'Delete failed');
        break;
      case 'ban':
        applyOptimistic((cs) =>
          cs.map((c) => (c.from?.id === comment.from.id ? { ...c, authorBanned: payload } : c))
        );
        toast(payload ? `${comment.from.name || 'User'} banned from ${page?.name}` : 'User unbanned');
        runInBackground(api.ban(pageId, comment.from.id, payload), snapshot, 'Ban failed');
        break;
      case 'like':
        applyOptimistic((cs) =>
          cs.map((c) =>
            c.id === comment.id
              ? { ...c, user_likes: payload, like_count: Math.max(0, c.like_count + (payload ? 1 : -1)) }
              : c
          )
        );
        runInBackground(api.like(comment.id, pageId, payload), snapshot, 'Like failed');
        break;
    }
  };

  if (needsLogin) return <Login onSuccess={onLogin} />;

  if (booting || building) {
    return (
      <div className="boot">
        <span className="loader lg" />
        <strong>Syncing your pages and ads…</strong>
        <p>First load walks every ad account to find posts with comments. Give it a moment.</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot">
        <strong>Couldn't reach Meta</strong>
        <p>{bootError}</p>
        <button className="pill-btn primary" onClick={() => boot(true)}>Try again</button>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar
        pages={pages}
        counts={counts}
        selectedPageId={pageId}
        onSelect={setPageId}
        onReload={() => boot(true)}
        reloading={reloading}
        lastSweep={lastSweep}
      />
      <Queue
        page={page}
        comments={comments}
        tab={tab}
        setTab={setTab}
        filter={filter}
        setFilter={setFilter}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReview={handleReview}
        onReviewAll={handleReviewAll}
        onRefresh={() => loadComments(pageId, true)}
        loading={loading}
        queueTotal={queueTotal.current}
        sweeping={sweeping}
        pulsing={pulsing}
        onQuickAction={handleAction}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Detail
        comment={selected}
        page={page}
        onAction={handleAction}
        onAiDraft={async (comment) => {
          try {
            const { draft } = await api.aiDraft(comment.id, pageId);
            return draft;
          } catch (e) {
            if (e.authRequired) setNeedsLogin(true);
            else toast(e.message, 'error');
            return null;
          }
        }}
        onFeedback={async (highlight, feedback) => {
          try {
            await api.addFeedback(highlight, feedback);
            toast('Feedback saved — every future AI draft will follow it');
          } catch (e) {
            if (e.authRequired) setNeedsLogin(true);
            else toast(e.message, 'error');
          }
        }}
      />

      {settingsOpen && settings && (
        <Settings settings={settings} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />
      )}

      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
