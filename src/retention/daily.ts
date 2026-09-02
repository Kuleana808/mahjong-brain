import type { DailyClaimResponse, DailyRewardState } from '../../packages/core/src/contracts/types';
import { loadAccountSession } from '../auth/apple';
import { apiRequest } from '../services/api';

function localDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function bearer(): Promise<string> {
  const session = await loadAccountSession();
  if (!session) throw new Error('Sign in with Apple to keep daily rewards across devices.');
  return session.token;
}

export async function getDailyReward(): Promise<DailyRewardState> {
  const envelope = await apiRequest<DailyRewardState>(`/api/retention/daily?localDate=${localDate()}`, { bearer: await bearer() });
  if (!envelope.data) throw new Error('Daily reward is temporarily unavailable.');
  return envelope.data;
}

export async function claimDailyReward(): Promise<DailyClaimResponse> {
  const envelope = await apiRequest<DailyClaimResponse>('/api/retention/daily', {
    method: 'POST',
    bearer: await bearer(),
    body: { localDate: localDate() },
  });
  if (!envelope.data) throw new Error('Daily reward is temporarily unavailable.');
  return envelope.data;
}
