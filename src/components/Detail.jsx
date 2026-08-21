import { useEffect, useRef, useState } from 'react';
import { api, fullTime } from '../api.js';
import {
  CheckIcon, ReplyIcon, EyeIcon, EyeOffIcon, TrashIcon, BanIcon, ThumbIcon, ExternalIcon, SparkIcon, BookmarkIcon, BackIcon,
} from './icons.jsx';

const MAX_LEN = 2000;

const REACTION_EMOJI = {
  LIKE: '\u{1F44D}', LOVE: '\u2764\uFE0F', CARE: '\u{1F970}', HAHA: '\u{1F606}',
  WOW: '\u{1F62E}', SAD: '\u{1F622}', ANGRY: '\u{1F621}',
};

function Reactions({ reactions }) {
  if (!reactions?.total) return null;
  const types = Object.keys(reactions.types || {});
  const icons = types.length
    ? types.map((t) => REACTION_EMOJI[t] || REACTION_EMOJI.LIKE).join('')
    : REACTION_EMOJI.LIKE;
  const label = types.length
    ? Object.entries(reactions.types).map(([t, n]) => `${t.toLowerCase()}: ${n}`).join(', ')
    : `${reactions.total} reaction${reactions.total > 1 ? 's' : ''}`;
  return (
    <span className="reactions-row" title={label}>
      {icons} {reactions.total}
    </span>
  );
}

// Cheap language sniff: only offer Translate when a comment doesn't look English.
const EN_WORDS = new Set(
  ('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us are is was were been has had did does am doesn\u2019t don\u2019t won\u2019t can\u2019t hear hearing loss aids severe does anyone bought where why really'.split(/\s+/))
);

function looksEnglish(text) {
  if (!text) return true;
  // non-Latin scripts are an instant "not English"
  if (/[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/.test(text)) {
    return false;
  }
  const words = text.toLowerCase().match(/[a-z\u00C0-\u024F']+/g) || [];
  if (words.length < 3) return true;
  const hits = words.filter((w) => EN_WORDS.has(w)).length;
  const accented = (text.match(/[\u00C0-\u024F]/g) || []).length;
  return hits / words.length >= 0.18 && accented / text.length < 0.03;
}

function Avatar({ from, size = '' }) {
  return from?.picture?.data?.url ? (
    <img className={`avatar ${size}`} src={from.picture.data.url} alt="" />
  ) : (
    <div className={`avatar ${size} avatar-fallback`}>{(from?.name || 'F')[0]}</div>
  );
}

export default function Detail({ comment, page, notify, onBack, onAction, onAiDraft, onFeedback }) {
  const [reply, setReply] = useState('');
  const [confirm, setConfirm] = useState(null); // 'delete' | 'ban' | null
  const [drafting, setDrafting] = useState(false);
  const [sel, setSel] = useState('');
  const [fbOpen, setFbOpen] = useState(false);
  const [fbText, setFbText] = useState('');
  const [confirmReplyId, setConfirmReplyId] = useState(null);
  const [translations, setTranslations] = useState({}); // id -> text | 'loading' | null(hidden)
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState(null); // null = not fetched yet
  const [tplSaving, setTplSaving] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const replyRef = useRef(null);

  useEffect(() => {
    setReply('');
    setConfirm(null);
    setDrafting(false);
    setSel('');
    setFbOpen(false);
    setFbText('');
    setConfirmReplyId(null);
    setTranslations({});
    setTplOpen(false);
    setTplSaving(false);
    setTplTitle('');
  }, [comment?.id]);

  const openTemplates = async () => {
    if (tplOpen) return setTplOpen(false);
    setTplOpen(true);
    try {
      const { savedReplies } = await api.savedReplies();
      setTemplates(savedReplies);
    } catch {
      setTemplates([]);
    }
  };

  const insertTemplate = (text) => {
    setReply((r) => (r.trim() ? `${r.trimEnd()} ${text}` : text));
    setTplOpen(false);
    replyRef.current?.focus();
  };

  const saveTemplate = async () => {
    const text = reply.trim();
    if (!text) return;
    try {
      const { entry } = await api.addSavedReply(tplTitle.trim(), text);
      setTemplates((t) => (t ? [...t, entry] : t));
      notify?.('Saved as a reply template');
    } catch (e) {
      notify?.(e.message, 'error');
    }
    setTplSaving(false);
    setTplTitle('');
  };

  const toggleTranslate = async (id, text) => {
    const current = translations[id];
    if (current === 'loading') return;
    if (typeof current === 'string') {
      // toggle visibility off, keep the cached text under a hidden key
      setTranslations((t) => ({ ...t, [id]: null, [`_${id}`]: current }));
      return;
    }
    if (current === null && translations[`_${id}`]) {
      setTranslations((t) => ({ ...t, [id]: t[`_${id}`] }));
      return;
    }
    setTranslations((t) => ({ ...t, [id]: 'loading' }));
    try {
      const { translation } = await api.translate(text);
      setTranslations((t) => ({ ...t, [id]: translation }));
    } catch {
      setTranslations((t) => ({ ...t, [id]: undefined }));
    }
  };

  const TranslateButton = ({ id, text }) =>
    text && !looksEnglish(text) ? (
      <button className="translate-btn" onClick={() => toggleTranslate(id, text)}>
        {translations[id] === 'loading'
          ? 'Translating…'
          : typeof translations[id] === 'string'
            ? 'Hide translation'
            : 'Translate'}
      </button>
    ) : null;

  const Translation = ({ id }) =>
    typeof translations[id] === 'string' && translations[id] !== 'loading' ? (
      <p className="translation">{translations[id]}</p>
    ) : null;

  const handleSelect = (e) => {
    if (fbOpen) return;
    const { selectionStart, selectionEnd, value } = e.target;
    setSel(value.slice(selectionStart, selectionEnd).trim());
  };

  const saveFeedback = async () => {
    if (!fbText.trim()) return;
    await onFeedback(sel, fbText.trim(), comment.message || '');
    setSel('');
    setFbOpen(false);
    setFbText('');
  };

  const draftWithAi = async () => {
    setDrafting(true);
    const text = await onAiDraft(comment);
    setDrafting(false);
    if (text) {
      setReply(text);
      replyRef.current?.focus();
    }
  };

  if (!comment) {
    return (
      <section className="detail detail-empty">
        <div>
          <div className="detail-empty-mark"><ReplyIcon size={22} /></div>
          <strong>Select a comment</strong>
          <p>Pick a comment from the queue to read the thread, reply, or moderate it.</p>
        </div>
      </section>
    );
  }

  const canBan = Boolean(comment.from?.id) && !comment.isPageAuthor;
  const author = comment.from?.name || 'Facebook user';

  const act = (type, payload) => onAction(type, comment, payload);

  return (
    <section className="detail">
      <header className="detail-head">
        <button className="icon-btn mobile-only detail-back" onClick={onBack} title="Back to queue" aria-label="Back to queue">
          <BackIcon size={17} />
        </button>
        <Avatar from={comment.from} />
        <div className="detail-head-id">
          <strong>{author}</strong>
          <span className="mono">{fullTime(comment.created_time)}</span>
        </div>
        <div className="detail-head-actions">
          <button
            className={`pill-btn ${comment.reviewed ? 'teal' : 'primary'}`}
            onClick={() => act('review', !comment.reviewed)}
          >
            <CheckIcon size={14} /> {comment.reviewed ? 'Reviewed' : 'Mark reviewed'}
          </button>
        </div>
      </header>

      <div className="detail-scroll">
        <div className="creative-card">
          {comment.post.picture && <img src={comment.post.picture} alt="" />}
          <div className="creative-card-body">
            <span className="creative-card-label">
              {comment.ads.length ? `Ad post · ${comment.ads[0]?.account || page?.name}` : `Page post · ${page?.name || ''}`}
            </span>
            <p>{comment.post.message ? comment.post.message.slice(0, 180) + (comment.post.message.length > 180 ? '…' : '') : 'Untitled ad post'}</p>
            <div className="creative-card-meta">
              {comment.ads.map((a) => (
                <span key={a.id} className={`creative-chip ${a.status === 'ACTIVE' ? '' : 'paused'}`}>
                  {a.status === 'ACTIVE' && <span className="live-dot" />}
                  {a.name}
                </span>
              ))}
              {comment.post.permalink && (
                <a className="link-btn" href={comment.post.permalink} target="_blank" rel="noreferrer">
                  View post <ExternalIcon size={12} />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="thread">
          <div className={`bubble-row ${comment.is_hidden ? 'dim' : ''}`}>
            <Avatar from={comment.from} size="sm" />
            <div className="bubble">
              <div className="bubble-meta">
                {author}
                {comment.autoHidden ? (
                  <span className="flag autohidden">auto-hidden · matched "{comment.autoHidden.keyword}"</span>
                ) : comment.is_hidden ? (
                  <span className="flag hiddenf"><EyeOffIcon size={11} /> hidden from public</span>
                ) : null}
                {comment.authorBanned && <span className="flag banned"><BanIcon size={11} /> banned</span>}
              </div>
              <p>{comment.message || <em>(no text)</em>}</p>
              <Translation id={comment.id} />
              {comment.attachment?.media?.image?.src && (
                <img className="bubble-attachment" src={comment.attachment.media.image.src} alt="attachment" />
              )}
              <div className="bubble-foot mono">
                <TranslateButton id={comment.id} text={comment.message} />
                <Reactions reactions={comment.reactions} />
                {comment.permalink_url && (
                  <a href={comment.permalink_url} target="_blank" rel="noreferrer">open on Facebook <ExternalIcon size={11} /></a>
                )}
              </div>
            </div>
          </div>

          {comment.replies?.map((r) => (
            <div key={r.id} className={`bubble-row ${r.isPageAuthor ? 'own' : ''}`}>
              <Avatar from={r.from} size="sm" />
              <div className="bubble">
                <div className="bubble-meta">{r.isPageAuthor ? page?.name || 'Your page' : r.from?.name || 'Facebook user'}</div>
                <p>{r.message}</p>
                <Translation id={r.id} />
                {(!r.isPageAuthor || r.reactions?.total > 0) && (
                  <div className="bubble-foot mono">
                    {!r.isPageAuthor && <TranslateButton id={r.id} text={r.message} />}
                    <Reactions reactions={r.reactions} />
                  </div>
                )}
              </div>
              <div className="bubble-tools">
                {confirmReplyId === r.id ? (
                  <span className="confirm-inline">
                    Delete?
                    <button
                      className="link-btn danger-link"
                      onClick={() => { act('deleteReply', r); setConfirmReplyId(null); }}
                    >
                      Yes
                    </button>
                    <button className="link-btn muted" onClick={() => setConfirmReplyId(null)}>No</button>
                  </span>
                ) : (
                  <button
                    className="card-tool danger"
                    title="Delete this reply"
                    aria-label="Delete this reply"
                    disabled={r.can_remove === false || r.id.startsWith('tmp_')}
                    onClick={() => setConfirmReplyId(r.id)}
                  >
                    <TrashIcon size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mod-bar">
        <button
          className="tool-btn"
          disabled={!comment.can_like}
          onClick={() => act('like', !comment.user_likes)}
          title={comment.user_likes ? 'Unlike as page' : 'Like as page'}
        >
          <ThumbIcon size={15} className={comment.user_likes ? 'liked' : ''} />
          {comment.user_likes ? 'Liked' : 'Like'}
        </button>
        <button
          className="tool-btn"
          disabled={!comment.can_hide}
          onClick={() => act('hide', !comment.is_hidden)}
        >
          {comment.is_hidden ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />}
          {comment.is_hidden ? 'Unhide' : 'Hide'}
        </button>
        <button
          className="tool-btn danger"
          disabled={!comment.can_remove}
          onClick={() => setConfirm('delete')}
        >
          <TrashIcon size={15} /> Delete
        </button>
        <button
          className="tool-btn danger"
          disabled={!canBan}
          title={canBan ? `${comment.authorBanned ? 'Unban' : 'Ban'} ${author} from ${page?.name}` : 'Meta did not share this commenter\u2019s identity, so they can\u2019t be banned from here'}
          onClick={() => (comment.authorBanned ? act('ban', false) : setConfirm('ban'))}
        >
          <BanIcon size={15} /> {comment.authorBanned ? 'Unban user' : 'Ban user'}
        </button>
      </div>

      {confirm && (
        <div className="confirm-bar">
          {confirm === 'delete'
            ? 'Delete this comment permanently? This can\u2019t be undone.'
            : `Ban ${author} from ${page?.name}? They won\u2019t be able to comment on this page.`}
          <div>
            <button
              className="pill-btn danger"
                onClick={() => { act(confirm === 'delete' ? 'delete' : 'ban', true); setConfirm(null); }}
            >
              {confirm === 'delete' ? 'Delete comment' : 'Ban user'}
            </button>
            <button className="pill-btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="composer">
        <textarea
          ref={replyRef}
          placeholder={`Reply publicly as ${page?.name || 'your page'}…`}
          value={reply}
          maxLength={MAX_LEN}
          rows={2}
          disabled={!comment.can_comment}
          onChange={(e) => setReply(e.target.value)}
          onSelect={handleSelect}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && reply.trim()) {
              act('reply', reply.trim());
              setReply('');
            }
          }}
        />
        {(sel || fbOpen) && (
          <div className="feedback-bar">
            <span className="feedback-snippet" title={sel}>
              “{sel.slice(0, 70)}{sel.length > 70 ? '…' : ''}”
            </span>
            {!fbOpen ? (
              <button className="link-btn" onClick={() => setFbOpen(true)}>Give feedback</button>
            ) : (
              <>
                <input
                  className="feedback-input"
                  autoFocus
                  value={fbText}
                  placeholder={'e.g. Never say it\u2019s manufactured overseas'}
                  onChange={(e) => setFbText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveFeedback();
                    if (e.key === 'Escape') { setFbOpen(false); setFbText(''); }
                  }}
                />
                <button className="link-btn" disabled={!fbText.trim()} onClick={saveFeedback}>Save</button>
                <button className="link-btn muted" onClick={() => { setFbOpen(false); setFbText(''); }}>Cancel</button>
              </>
            )}
          </div>
        )}
        {tplOpen && (
          <div className="tpl-pop">
            <div className="tpl-pop-head">
              <BookmarkIcon size={13} /> Saved replies
              <button className="feedback-x" onClick={() => setTplOpen(false)} aria-label="Close">×</button>
            </div>
            {!templates ? (
              <p className="profile-note">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="profile-note">
                No saved replies yet. Type a reply below and click the bookmark to save it as a template.
              </p>
            ) : (
              templates.map((t) => (
                <button key={t.id} className="tpl-item" onClick={() => insertTemplate(t.text)}>
                  {t.title && <strong>{t.title}</strong>}
                  <span>{t.text}</span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="composer-foot">
          <button
            className="pill-btn ghost ai-btn"
            disabled={drafting || !comment.can_comment}
            onClick={draftWithAi}
            title="Draft a reply with AI — you can edit it before sending"
          >
            <SparkIcon size={14} className={drafting ? 'spin' : ''} />
            {drafting ? 'Drafting…' : 'Respond with AI'}
          </button>
          <button
            className={`pill-btn ghost tpl-btn ${tplOpen ? 'active' : ''}`}
            onClick={openTemplates}
            title="Insert a saved reply"
          >
            <BookmarkIcon size={14} /> Saved
          </button>
          {reply.trim() && !tplSaving && (
            <button
              className="link-btn tpl-save-link"
              onClick={() => setTplSaving(true)}
              title="Save the current reply as a reusable template"
            >
              Save as template
            </button>
          )}
          {tplSaving && (
            <span className="tpl-save-row">
              <input
                className="feedback-input"
                autoFocus
                value={tplTitle}
                placeholder="Template name (optional)"
                onChange={(e) => setTplTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTemplate();
                  if (e.key === 'Escape') { setTplSaving(false); setTplTitle(''); }
                }}
              />
              <button className="link-btn" onClick={saveTemplate}>Save</button>
              <button className="link-btn muted" onClick={() => { setTplSaving(false); setTplTitle(''); }}>Cancel</button>
            </span>
          )}
          <span className="composer-spacer" />
          <span className="mono">{MAX_LEN - reply.length}</span>
          <button
            className="pill-btn primary"
            disabled={!reply.trim() || !comment.can_comment}
            onClick={() => { act('reply', reply.trim()); setReply(''); }}
          >
            <ReplyIcon size={14} /> Send reply
          </button>
        </div>
      </div>
    </section>
  );
}
