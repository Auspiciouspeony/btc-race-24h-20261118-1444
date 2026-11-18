// Dip-bounce + EMA-cross trend bot for the make.fun btc-race-24h-20261118-1444
// bounty (bars-replay/v1, cbBTC/USDC, 1-minute bars, $1,000 paper money).
//
// Two legs, one open position at a time, full size, long only:
//
//   DIP leg (mean reversion): the close fell at least 80 bps over the last
//   10 bars and the current bar closed up (a bounce starting). Buy the whole
//   cash. Exit at +100 bps over the entry close. No stop, no trail: a trail
//   churns the same dip over and over (each round trip costs ~26 bps), and
//   in backtests a stop never fired before the take or the window's end.
//
//   TREND leg (momentum): EMA(12) crosses above EMA(120) while the 10-bar
//   return is at least +50 bps. Buy the whole cash. Exit at +250 bps take,
//   -100 bps stop, a 60 bps trailing stop from the peak close, or the EMA
//   cross back down.
//
//   No new entries in the last 180 bars: a position opened that late cannot
//   reach its take before the window ends and is flattened at a loss.
//
// Validated offline on three published 24h dev windows (this competition's
// plus the two prior btc-race-24h kits) with an exact-integer replay of the
// harness fill math (4 bps fee, 2 bps slippage, constant-product impact):
//   dev (2026-11-17/18): +7.30 USDC, 1 round trip, max drawdown 1.5%
//   2026-11-14/15:       +37.41 USDC, 3 round trips, max drawdown 1.5%
//   2026-11-16/17:       +13.30 USDC, 2 round trips, max drawdown 1.9%
// Every window positive, every window at least one trade, drawdowns small.
// Round 2 change (from round 1's EMA(5)/EMA(90), 15-bar +40 bps): the
// slower EMA(12)/EMA(120) cross with a stronger 10-bar +50 bps momentum
// filter skips whipsaw cross-ups (round 1's trend leg bought a losing
// dip on 2026-11-14/15 and missed the main +4% rebound) and catches the
// genuine rebound instead. The improvement is a broad plateau, not one
// tuned point: 1,354 of 3,600 neighbouring trend configs also total over
// +45 USDC across the three windows, and the dip leg is unchanged.
// The EMA trend family on its own loses on choppy windows (whipsaw) and the
// dip leg on its own trades only 2-3 times per window; the two legs together
// are the best of both that the backtests found.
//
// Determinism: pure float64 arithmetic on the bars, no clock, no environment,
// no randomness. The entry price and peak are closes the harness sent, so the
// same bars always give the same orders.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 500; // 5%: BTC 1-minute gaps past this are ~never; also caps our own impact

// Dip leg.
const DIP_LOOKBACK = 10;
const DIP_DROP_BPS = 80;
const DIP_TAKE_BPS = 100;

// Trend leg.
const EMA_FAST = 12;
const EMA_SLOW = 120;
const TREND_MOM_BARS = 10;
const TREND_MOM_MIN_BPS = 50;
const TREND_TAKE_BPS = 250;
const TREND_STOP_BPS = 100;
const TREND_TRAIL_BPS = 60;

// No entries in the last bars of the window (1440 bars total).
const ENTRY_CUTOFF_BARS = 1260;

const closes: number[] = [];
const opens: number[] = [];
let emaFast: number | null = null;
let emaSlow: number | null = null;
let prevEmaFast: number | null = null;
let prevEmaSlow: number | null = null;

type Leg = 'dip' | 'trend' | null;
let leg: Leg = null;
let entryPx = 0;
let peakPx = 0;
let pendingBuy = false;

function emaStep(prev: number | null, close: number, span: number): number {
  const k = 2 / (span + 1);
  return prev === null ? close : close * k + prev * (1 - k);
}

function retBps(now: number, then: number): number {
  return (now / then - 1) * 10000;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const c = Number(bar.c);
    const o = Number(bar.o);

    // The buy decided on the previous batch fills (or is rejected) on this one.
    if (pendingBuy) {
      const mine = batch.fills.find((f) => f.symbol === SYMBOL && f.side === 'buy');
      if (mine !== undefined) {
        pendingBuy = false;
        if (mine.status === 'rejected') leg = null;
      }
    }

    closes.push(c);
    opens.push(o);
    prevEmaFast = emaFast;
    prevEmaSlow = emaSlow;
    emaFast = emaStep(emaFast, c, EMA_FAST);
    emaSlow = emaStep(emaSlow, c, EMA_SLOW);
    const idx = closes.length - 1;

    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;

    if (qty === 0n) {
      if (pendingBuy) return [];
      leg = null;
      if (idx > ENTRY_CUTOFF_BARS) return [];

      // Dip leg: 10-bar drop of 80+ bps, bar closing up.
      if (idx >= DIP_LOOKBACK && retBps(c, closes[idx - DIP_LOOKBACK]) <= -DIP_DROP_BPS && c > o) {
        leg = 'dip';
        entryPx = c;
        peakPx = c;
        pendingBuy = true;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // Trend leg: EMA(12) cross above EMA(120) with 10-bar momentum >= 50 bps.
      if (
        idx >= 122 &&
        prevEmaFast !== null && prevEmaSlow !== null &&
        emaFast > emaSlow && prevEmaFast <= prevEmaSlow &&
        retBps(c, closes[idx - TREND_MOM_BARS]) >= TREND_MOM_MIN_BPS
      ) {
        leg = 'trend';
        entryPx = c;
        peakPx = c;
        pendingBuy = true;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Holding: update the peak and check the current leg's exits.
    if (c > peakPx) peakPx = c;
    const up = retBps(c, entryPx);
    if (leg === 'dip') {
      if (up >= DIP_TAKE_BPS) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }
    // Trend leg exits.
    if (up >= TREND_TAKE_BPS) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (up <= -TREND_STOP_BPS) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (retBps(peakPx, c) >= TREND_TRAIL_BPS) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (emaFast < emaSlow) {
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
