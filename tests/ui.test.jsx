// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import App from '../src/App.jsx';
import Sidebar from '../src/components/Sidebar.jsx';
import Queue from '../src/components/Queue.jsx';
import { api } from '../src/api.js';
vi.mock('../src/api.js', () => ({ api: { bootstrap: vi.fn(), overview: vi.fn(), settings: vi.fn(), comments: vi.fn() }, timeAgo: () => '1m' }));
beforeEach(() => {
  vi.clearAllMocks();
  api.overview.mockResolvedValue({ counts: {}, lastSweep: null });
  api.settings.mockResolvedValue(null);
});
afterEach(cleanup);

it('does not report a clear queue when there are no loaded pages', () => {
  render(<Sidebar pages={[]} counts={{}} configuredPageCount={1} countsLoaded={true} />);
  expect(screen.queryByText('Queues clear')).toBeNull();
  expect(screen.getByText('No pages loaded')).toBeTruthy();
  expect(screen.queryByText('No pages match ""')).toBeNull();
});

it('shows sync failures even when cached counts are zero', () => {
  render(<Sidebar pages={[{ id: '123', name: 'Page' }]} counts={{ '123': { toReview: 0 } }} countsLoaded={true} statusError="Meta rate limit" />);
  expect(screen.getByText('Sync needs attention')).toBeTruthy();
  expect(screen.queryByText('Queues clear')).toBeNull();
});

it('disables comment refresh and explains the empty page selection', async () => {
  api.bootstrap.mockResolvedValue({ pages: [], configuredPageCount: 0 });
  render(<App />);
  const refresh = await screen.findByRole('button', { name: 'Refresh comments' });
  expect(refresh.disabled).toBe(true);
  fireEvent.click(refresh);
  expect(api.comments).not.toHaveBeenCalled();
  expect(screen.getByText('Choose pages to get started')).toBeTruthy();
});

it('shows Meta throttling persistently without displaying a false empty queue', async () => {
  api.bootstrap.mockResolvedValue({ pages: [], configuredPageCount: 1, syncError: 'Meta is limiting requests', retryAt: Date.now() + 3600000 });
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Meta is limiting requests'));
  expect(screen.queryByText('No comments here yet.')).toBeNull();
  expect(api.comments).not.toHaveBeenCalled();
});

it('keeps the comment loading failure visible after the request completes', async () => {
  api.bootstrap.mockResolvedValue({ pages: [{ id: '123', name: 'Page' }], configuredPageCount: 1 });
  api.comments.mockRejectedValue(new Error('Permission denied'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Permission denied'));
  expect(screen.queryByText('No comments here yet.')).toBeNull();
});

it('clears a removed page selection and stops requesting its comments', async () => {
  api.bootstrap.mockResolvedValueOnce({ pages: [{ id: '123', name: 'Page' }], configuredPageCount: 1 }).mockResolvedValue({ pages: [], configuredPageCount: 0 });
  api.comments.mockResolvedValue({ comments: [] });
  render(<App />);
  await waitFor(() => expect(api.comments).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Re-sync pages and ads' }));
  await screen.findByText('Choose pages to get started');
  expect(screen.getByRole('button', { name: 'Refresh comments' }).disabled).toBe(true);
  expect(api.comments).toHaveBeenCalledTimes(1);
});

it('disables forced refresh during the retry delay', () => {
  render(<Queue page={{ id: '123', name: 'Page' }} comments={[]} tab="review" filter="all" queueTotal={0} sweeping={new Set()} retryAt={Date.now() + 3600000} />);
  expect(screen.getByRole('button', { name: 'Refresh comments' }).disabled).toBe(true);
});
