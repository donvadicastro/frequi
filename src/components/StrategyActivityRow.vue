<script setup lang="ts">
import type { StrategyPost } from '@/utils/strategyJournal';
import BuyIcon from '~icons/mdi/arrow-bottom-left';
import SellIcon from '~icons/mdi/arrow-top-right';
import SignalIcon from '~icons/mdi/pulse';
import CancelIcon from '~icons/mdi/cancel';
import ExecutionIcon from '~icons/mdi/swap-horizontal';
import EntryIcon from '~icons/mdi/login';
import ExitIcon from '~icons/mdi/logout';

const props = defineProps<{ post: StrategyPost; author?: string }>();
const action = computed(() => {
  if (props.post.kind === 'cancellation')
    return { icon: CancelIcon, tone: 'cancel', label: 'Cancelled' };
  if (props.post.kind === 'signal') return { icon: SignalIcon, tone: 'signal', label: 'Signal' };
  if (props.post.title.startsWith('BUY')) return { icon: BuyIcon, tone: 'buy', label: 'Buy' };
  if (props.post.title.startsWith('SELL')) return { icon: SellIcon, tone: 'sell', label: 'Sell' };
  return { icon: ExecutionIcon, tone: 'execution', label: 'Execution' };
});
const money = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coins = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 8 });
const signedCoins = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${coins(Math.abs(value))}`;
const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;

const exactTime = computed(() => new Date(props.post.timestamp).toISOString());
const shortDate = computed(() =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    props.post.timestamp,
  ),
);
const clockTime = computed(() => exactTime.value.slice(11, 19));
const phaseIcon = computed(() =>
  props.post.kind === 'signal'
    ? undefined
    : props.post.title.includes('Entry')
      ? EntryIcon
      : props.post.title.includes('Exit')
        ? ExitIcon
        : undefined,
);
</script>

<template>
  <article class="activity-row" :class="`action-${action.tone}`">
    <time
      class="event-time"
      :datetime="exactTime"
      :aria-label="exactTime"
      :title="
        post.receivedAt === post.timestamp
          ? `${exactTime} · Receipt time; strategy event time not supplied`
          : exactTime
      "
    >
      <span class="event-date">{{ shortDate }}</span>
      <span class="event-clock">{{ clockTime }}<span class="sr-only"> UTC</span></span>
    </time>
    <span class="action-icon" :title="action.label" aria-hidden="true"
      ><component :is="action.icon"
    /></span>
    <div class="row-content">
      <div class="row-copy">
        <div class="row-heading">
          <span v-if="author" class="row-author">{{ author }}</span>
          <span v-if="post.pair" class="row-pair">{{ post.pair }}</span>
          <component :is="phaseIcon" v-if="phaseIcon" class="phase-icon" aria-hidden="true" />
          <h3>{{ post.title }}</h3>
        </div>
        <p>{{ post.message }}</p>
      </div>
      <div class="balance-column">
        <template v-if="post.impact">
          <div
            class="balance-change"
            :title="
              post.impact.cashFlow !== undefined
                ? 'Cash change before fees. Approximate balances replay all recorded bot fills from starting capital, excluding fees, deposits and withdrawals. Missing history is shown as unavailable.'
                : 'Futures margin cash changes are unavailable.'
            "
          >
            <span class="sr-only">Cash:</span>
            <strong
              >{{ post.impact.cashFlow !== undefined ? signed(post.impact.cashFlow) : '—' }}
              {{ post.impact.quoteCurrency }}</strong
            >
            <span
              >({{
                post.impact.cashBefore !== undefined ? `≈ ${money(post.impact.cashBefore)}` : '—'
              }}
              →
              {{
                post.impact.cashAfter !== undefined ? `≈ ${money(post.impact.cashAfter)}` : '—'
              }})</span
            >
          </div>
          <div
            class="balance-change"
            title="Coin position change for this trade, reconstructed from recorded fills and base fees. Missing history is shown as unavailable."
          >
            <span class="sr-only">{{ post.impact.isShort ? 'Short position' : 'Coin' }}:</span>
            <strong>{{ signedCoins(post.impact.coinFlow) }} {{ post.impact.baseCurrency }}</strong>
            <span
              >({{
                post.impact.positionBefore !== undefined ? coins(post.impact.positionBefore) : '—'
              }}
              →
              {{
                post.impact.positionAfter !== undefined ? coins(post.impact.positionAfter) : '—'
              }})</span
            >
          </div>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
.activity-row {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #eceef3;
  text-align: left;
  color: #242530;
}
.action-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  flex-shrink: 0;
  background: #edf0f7;
  color: #65718b;
}
.action-icon svg {
  width: 17px;
  height: 17px;
}
.action-buy .action-icon {
  background: #e8f6ef;
  color: #17865f;
}
.action-sell .action-icon {
  background: #fff0ec;
  color: #c25636;
}
.action-signal .action-icon {
  background: #edf0fc;
  color: #6267bd;
}
.action-cancel .action-icon {
  background: #fff5df;
  color: #9a6a12;
}
.row-content {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 20px;
}
.row-copy {
  min-width: 0;
}
.balance-column {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.balance-change {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 3px 5px;
  margin-top: 3px;
  font-size: 10px;
  color: #737d91;
}
.balance-change strong {
  color: #49556c;
  font-weight: 550;
}
.row-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-height: 20px;
}
.row-author,
.row-pair,
h3 {
  font-size: 12px;
  font-weight: 600;
}
.row-author {
  color: #737c90;
}
.row-pair {
  color: #4c5d91;
}
h3 {
  margin: 0;
}
.phase-icon {
  width: 13px;
  height: 13px;
  color: #8991a2;
}
.event-time {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 0 0 62px;
  padding-top: 2px;
  color: #7e8799;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  line-height: 1.5;
}
.event-date {
  font-size: 11px;
  font-weight: 550;
  color: #626e83;
}
.event-clock {
  font-size: 10px;
}
p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 680px) {
  .activity-row {
    gap: 7px;
  }
  .event-time {
    flex-basis: 52px;
  }
  .event-clock {
    font-size: 9px;
  }
  .row-content {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .balance-column {
    text-align: left;
  }
  .balance-change {
    justify-content: flex-start;
  }
  .row-heading {
    gap: 3px 6px;
  }
}
</style>
