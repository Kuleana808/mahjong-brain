import { useEffect, useState } from 'react';

import type { DailyRewardState, GrantKind } from '../../packages/core/src/contracts/types';
import { claimDailyReward, getDailyReward } from '../retention/daily';
import { useGame } from '../state/store';
import { Icon } from './Icon';

const LABEL: Record<GrantKind, string> = { hint: 'Hint', shuffle: 'Shuffle', revive: 'Revive', remove_ads: 'Ad removal' };

export function DailyRewardSheet({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings?: () => void }) {
  const accountStatus = useGame((state) => state.accountStatus);
  const grantInventory = useGame((state) => state.grantInventory);
  const [reward, setReward] = useState<DailyRewardState | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'claiming' | 'claimed' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (accountStatus !== 'signed_in') {
      setStatus('error');
      setMessage('Sign in with Apple in Settings to protect rewards across devices.');
      return;
    }
    void getDailyReward().then((next) => {
      setReward(next);
      setStatus(next.claimableToday ? 'ready' : 'claimed');
    }).catch((cause: unknown) => {
      setStatus('error');
      setMessage(cause instanceof Error ? cause.message : 'Daily reward could not be loaded.');
    });
  }, [accountStatus]);

  const claim = async () => {
    if (status !== 'ready') return;
    setStatus('claiming');
    try {
      const next = await claimDailyReward();
      if (next.granted) grantInventory(next.granted.kind, next.granted.quantity);
      setReward(next);
      setStatus('claimed');
      setMessage(next.granted ? `${next.granted.quantity} ${LABEL[next.granted.kind]}${next.granted.quantity === 1 ? '' : 's'} added.` : 'Already collected today.');
    } catch (cause) {
      setStatus('error');
      setMessage(cause instanceof Error ? cause.message : 'Daily reward could not be claimed.');
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="daily-title">
      <section className="card daily-card">
        <button type="button" className="sheet-close" aria-label="Close daily reward" onClick={onClose}><Icon name="close" /></button>
        <p className="result-kicker">Seven-day cycle</p>
        <h2 id="daily-title">Daily reward</h2>
        <div className="daily-days" aria-label="Seven-day reward cycle">
          {Array.from({ length: 7 }, (_, index) => <span key={index} className={reward?.day === index + 1 ? 'is-today' : index + 1 < (reward?.day ?? 1) ? 'is-complete' : ''}>{index + 1}</span>)}
        </div>
        {reward ? <><p>Day {reward.day}{reward.streakDays > 0 ? ` · ${reward.streakDays}-day streak` : ''}</p><strong className="daily-reward">{reward.reward.quantity} {LABEL[reward.reward.kind]}{reward.reward.quantity === 1 ? '' : 's'}</strong>{reward.streakBroken ? <p className="flow-notice">A day was missed, so the displayed streak restarted. Rewards you already earned remain yours.</p> : null}</> : null}
        {message ? <p role="status">{message}</p> : null}
        {status === 'loading' ? <p role="status">Loading today’s reward…</p> : null}
        {status === 'ready' ? <button type="button" className="button" onClick={() => void claim()}>Collect</button> : null}
        {status === 'claiming' ? <button type="button" className="button" disabled>Collecting…</button> : null}
        {status === 'claimed' ? <button type="button" className="button" onClick={onClose}>Done</button> : null}
        {status === 'error' ? (
          <button
            type="button"
            className="button"
            onClick={accountStatus === 'signed_in' || !onOpenSettings ? onClose : onOpenSettings}
          >
            {accountStatus === 'signed_in' || !onOpenSettings ? 'Done' : 'Open Settings'}
          </button>
        ) : null}
      </section>
    </div>
  );
}
