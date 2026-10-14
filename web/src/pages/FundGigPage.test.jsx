// Component tests for the Fund a Gig screen. The API is faked (no server or database needed),
// so these check what the USER SEES for success and for each failure.
// Run: cd web && npm test
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FundGigPage from './FundGigPage.jsx';
import { ActorProvider } from '../context/ActorContext.jsx';

const CLIENT = { id: 'c1', name: 'Asha Rao', escrow_balance: 1000 };
const FREELANCER = { id: 'f1', name: 'Ravi Kumar', is_available: true, active_contract: null };

// Fake fetch: GETs return fixtures, POST /contracts/fund returns whatever the test sets.
function mockApi(fundResponse) {
  global.fetch = vi.fn(async (url, opts = {}) => {
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (url.startsWith('/api/clients/c1')) return json(200, CLIENT);
    if (url.startsWith('/api/freelancers/f1')) return json(200, FREELANCER);
    if (url.startsWith('/api/contracts/fund') && opts.method === 'POST') return json(fundResponse.status, fundResponse.body);
    return json(200, { data: [], page: 1, totalPages: 1, total: 0 });
  });
}

function renderPage() {
  localStorage.setItem('gigtask.actor', JSON.stringify(CLIENT));
  return render(
    <MemoryRouter initialEntries={['/fund?freelancer=f1']}>
      <ActorProvider><FundGigPage /></ActorProvider>
    </MemoryRouter>);
}

async function submitWithBudget(value) {
  await screen.findByText('Ravi Kumar');                 // freelancer pre-selected from the URL
  fireEvent.change(screen.getByLabelText('Budget'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Fund gig' }));
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Fund a gig', () => {
  test('success shows balance before/after and the new audit log entry', async () => {
    mockApi({ status: 201, body: {
      contract: { id: 'k1234567-aaaa', status: 'IN PROGRESS', freelancer_name: 'Ravi Kumar' },
      balance_before: 1000, balance_after: 750,
      audit_entry: { id: 99, client_id: 'c1', action_type: 'GIG_FUNDED', amount_changed: -250, balance_after: 750, created_at: new Date().toISOString() },
    } });
    renderPage();
    await submitWithBudget('250');

    expect(await screen.findByText('Gig funded')).toBeTruthy();
    expect(screen.getByText('Balance before')).toBeTruthy();
    expect(screen.getByText('GIG_FUNDED')).toBeTruthy();
    expect(screen.getByText(/written by the trigger/)).toBeTruthy();

    const body = JSON.parse(global.fetch.mock.calls.find(([u]) => u.startsWith('/api/contracts/fund'))[1].body);
    expect(body).toEqual({ client_id: 'c1', freelancer_id: 'f1', budget: 250 });
  });

  test('insufficient balance shows a friendly explanation', async () => {
    mockApi({ status: 422, body: { error: { code: 'INSUFFICIENT_BALANCE', message: "The client doesn't have enough money in escrow to fund this gig.", detail: 'balance=1000.00 budget=5000' } } });
    renderPage();
    await submitWithBudget('5000');

    expect(await screen.findByText('Not enough money in escrow')).toBeTruthy();
    expect(screen.getByText(/rolled back/)).toBeTruthy();
    expect(screen.queryByText('Gig funded')).toBeNull();
  });

  test('a busy freelancer (partial unique index) shows a friendly explanation', async () => {
    mockApi({ status: 409, body: { error: { code: 'FREELANCER_BUSY', message: 'This freelancer already has a gig in progress.' } } });
    renderPage();
    await submitWithBudget('100');

    expect(await screen.findByText('Freelancer already has a gig in progress')).toBeTruthy();
  });

  test('server down shows an error instead of a blank page', async () => {
    mockApi({ status: 200, body: {} });
    renderPage();
    await screen.findByText('Ravi Kumar');
    global.fetch.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    fireEvent.click(screen.getByRole('button', { name: 'Fund gig' }));
    await waitFor(() => expect(screen.getByText(/Cannot reach the server/)).toBeTruthy());
  });
});
