# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Auspiciouspeony/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Auspiciouspeony/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Dip-bounce + EMA-cross trend bot trading cbBTC/USDC on 1-minute bars with $1,000 of paper money. Two legs, one open position at a time, full size, long only: buy sharp 10-bar dips (≥80 bps down, bar closing up) for a +100 bps bounce, or ride EMA(12)/EMA(120) cross-ups with 10-bar momentum (≥50 bps; take +250, stop −100, 60 bps trail, exit on cross-down). No new entries in the last 180 bars.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 (newline-delimited JSON on stdin/stdout) using the kit's `vendor/makefun-bars.ts` shim. Standard library only; no network, no clock, no randomness — the same bars always give the same orders.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wa0stw5e&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
