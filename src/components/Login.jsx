import { useState } from 'react';
import { api } from '../api.js';
import { InboxIcon } from './icons.jsx';

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err.status === 401 ? 'Wrong password — try again.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="boot">
      <div className="brand-mark login-mark"><InboxIcon size={22} /></div>
      <strong>Ad Comments Inbox</strong>
      <p>Enter the password to open the moderation queue. You'll stay signed in on this device.</p>
      <form className="login-form" onSubmit={submit}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          aria-label="Password"
        />
        <button className="pill-btn primary" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
      </form>
      {error && <span className="login-error">{error}</span>}
    </div>
  );
}
