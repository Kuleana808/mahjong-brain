import { useEffect, useState } from 'react';
import { consumablePurchases, SHUFFLE_PRODUCT_ID } from '../iap';
import { useGame } from '../state/store';
import { track } from '../telemetry/client';
import { Icon } from './Icon';

export function BottomDock() {
  const status = useGame((s) => s.status);
  const hintPending = useGame((s) => s.hintPending);
  const tapHistory = useGame((s) => s.tapHistory);
  const shuffleBoard = useGame((s) => s.shuffleBoard);
  const requestHint = useGame((s) => s.requestHint);
  const undo = useGame((s) => s.undo);
  const inventory = useGame((s) => s.inventory);
  const playing = status === 'playing';
  const purchaseShuffles = useGame((s) => s.purchaseShuffles);
  const purchasePending = useGame((s) => s.purchasePending);
  const [shopOpen, setShopOpen] = useState(false);
  const [price, setPrice] = useState<string | null>(null);
  useEffect(() => { if (shopOpen) void consumablePurchases().product().then((product) => setPrice(product?.displayPrice ?? null)); }, [shopOpen]);

  return (<>
    <nav className="bottom-dock" aria-label="Game tools">
      <button type="button" className="tool-medallion" aria-label={`Shuffle, ${inventory.shuffle} available`} onClick={() => {
        if (inventory.shuffle > 0) shuffleBoard();
        else {
          void track('shuffle_iap_shown', { productId: SHUFFLE_PRODUCT_ID });
          setShopOpen(true);
        }
      }} disabled={!playing}>
        <span className="tool-medallion__face"><Icon name="shuffle" /><small className="inventory-badge">{inventory.shuffle}</small></span>
        <span>Shuffle</span>
      </button>
      <button type="button" className="tool-medallion" aria-label={hintPending ? 'Looking for a hint' : `Hint, ${inventory.hint} available`} onClick={() => void requestHint()} disabled={!playing || hintPending}>
        <span className="tool-medallion__face"><Icon name="hint" /><small className="inventory-badge">{inventory.hint}</small></span>
        <span>{hintPending ? 'Looking…' : 'Hint'}</span>
      </button>
      <button type="button" className="tool-medallion" aria-label="Undo" onClick={undo} disabled={tapHistory.length === 0}>
        <span className="tool-medallion__face"><Icon name="undo" /></span>
        <span>Undo</span>
      </button>
    </nav>
    {shopOpen ? <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="shuffle-pack-title"><div className="card consumable-card"><h2 id="shuffle-pack-title">5 Shuffles</h2><p>Rearrange a board when you want a fresh set of choices.</p><strong className="card__price">{price ?? 'Store unavailable'}</strong><button type="button" className="button" disabled={!price || purchasePending !== null} onClick={async () => { await purchaseShuffles(); setShopOpen(false); }}>{purchasePending === 'buying' ? 'Contacting Apple…' : price ? `Buy for ${price}` : 'Try again later'}</button><button type="button" className="button button--quiet" disabled={purchasePending !== null} onClick={() => setShopOpen(false)}>Not now</button></div></div> : null}
  </>);
}
