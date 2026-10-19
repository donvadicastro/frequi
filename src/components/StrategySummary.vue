<script setup lang="ts">
const props = defineProps<{ botId: string; botName: string }>();
const bots = useBotStore();
const bot = computed(() => bots.botStores[props.botId]);
const config = computed(() => bot.value?.botState);
const profit = computed(() => bot.value?.profit);
const positions = computed(() => bot.value?.openTrades ?? []);
const balance = computed(() => bot.value?.balance.total_bot ?? bot.value?.balance.total);
const closedCount = computed(() => profit.value?.closed_trade_count);
const winRate = computed(() => {
  if (!profit.value || !closedCount.value) return undefined;
  return profit.value.winning_trades / closedCount.value;
});
const amount = (value: number | undefined) =>
  value === undefined ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = (value: number | undefined) =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <article class="strategy-summary">
    <header>
      <div class="strategy-heading">
        <span class="summary-avatar" aria-hidden="true">{{
          botName.slice(0, 2).toUpperCase()
        }}</span>
        <div>
          <h3>
            <a href="/" class="strategy-link" @click.prevent="emit('open')">{{ botName }}</a>
          </h3>
          <p>{{ config?.strategy || 'Strategy not reported' }}</p>
        </div>
      </div>
      <div class="strategy-header-info">
        <div class="strategy-status">
          <span class="connection" :class="{ online: bot?.isBotOnline }">{{
            bot?.isBotOnline ? 'Connected' : 'Offline'
          }}</span
          ><span v-if="config?.state">{{ config.state }}</span
          ><span v-if="config?.dry_run !== undefined" class="mode">{{
            config.dry_run ? 'Paper trading' : 'Live trading'
          }}</span>
        </div>
        <p class="strategy-context">
          {{
            [
              config?.exchange,
              config?.trading_mode,
              config?.timeframe ? `${config.timeframe} candles` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || 'Waiting for strategy configuration.'
          }}
        </p>
      </div>
    </header>
    <dl class="summary-metrics">
      <div>
        <dt>Bot balance</dt>
        <dd>
          {{ amount(balance) }} <small>{{ bot?.stakeCurrency }}</small>
        </dd>
      </div>
      <div>
        <dt>Total P&amp;L</dt>
        <dd
          :class="{
            gain: (profit?.profit_all_coin ?? 0) > 0,
            loss: (profit?.profit_all_coin ?? 0) < 0,
          }"
        >
          {{ amount(profit?.profit_all_coin) }} <small>{{ bot?.stakeCurrency }}</small>
        </dd>
        <span v-if="profit">{{ percent(profit.profit_all_ratio) }} return</span>
      </div>
      <div>
        <dt>Realized P&amp;L</dt>
        <dd>
          {{ amount(profit?.profit_closed_coin) }} <small>{{ bot?.stakeCurrency }}</small>
        </dd>
      </div>
      <div>
        <dt>Win rate</dt>
        <dd>{{ percent(winRate) }}</dd>
        <span>{{
          closedCount !== undefined ? `${closedCount} closed trades` : 'No trade statistics yet'
        }}</span>
      </div>
      <div>
        <dt>Open positions</dt>
        <dd>
          {{ bot?.isBotOnline ? bot.openTradeCount : '—'
          }}<small v-if="config?.max_open_trades !== undefined && config.max_open_trades > 0">
            / {{ config.max_open_trades }} slots</small
          >
        </dd>
      </div>
      <div>
        <dt>Max drawdown</dt>
        <dd>{{ percent(profit?.max_drawdown) }}</dd>
      </div>
    </dl>
    <div v-if="positions.length" class="position-preview">
      <span>Active pairs</span
      ><span v-for="trade in positions.slice(0, 5)" :key="trade.trade_id" class="pair-chip"
        >{{ trade.pair }} <small>{{ trade.is_short ? 'Short' : 'Long' }}</small></span
      ><span v-if="positions.length > 5">+{{ positions.length - 5 }} more</span>
    </div>
  </article>
</template>

<style scoped>
.strategy-summary {
  border: 1px solid #e4e7ef;
  border-radius: 12px;
  padding: 20px;
  background: #fff;
  color: #242530;
}
.strategy-summary header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.strategy-heading {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.summary-avatar {
  display: grid;
  place-items: center;
  background: #eef1fb;
  color: #5a6fb0;
  border-radius: 10px;
  width: 36px;
  height: 36px;
  font-size: 11px;
  flex-shrink: 0;
}
h3 {
  font-size: 15px;
  font-weight: 650;
}
.strategy-heading p {
  font-size: 11px;
  color: #697386;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.strategy-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 10px;
  color: #697386;
  text-transform: capitalize;
}
.connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.connection:before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ca3af;
}
.connection.online:before {
  background: #289c79;
}
.mode {
  border: 1px solid #e2e6ef;
  border-radius: 4px;
  padding: 3px 6px;
}
.strategy-context {
  font-size: 11px;
  color: #697386;
  margin: 7px 0 0;
}
.summary-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
  padding: 16px 0 0;
  margin-top: 18px;
  border-top: 1px solid #eceef3;
}
dt {
  font-size: 10px;
  color: #697386;
  margin-bottom: 7px;
}
dd {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
dd small {
  font-size: 10px;
  font-weight: 400;
  color: #697386;
}
.summary-metrics div > span {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  color: #697386;
}
.gain {
  color: #20835e;
}
.loss {
  color: #bf4657;
}
.position-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  font-size: 10px;
  color: #697386;
  margin-top: 16px;
}
.pair-chip {
  padding: 5px 7px;
  background: #f5f6fa;
  border-radius: 5px;
  color: #404b61;
}
.pair-chip small {
  color: #697386;
  margin-left: 4px;
}
.strategy-link {
  color: #5267b5;
}
.strategy-link:hover {
  text-decoration: underline;
}
.strategy-link:focus-visible {
  outline: 2px solid #637acb;
  outline-offset: 4px;
  border-radius: 2px;
}
.strategy-header-info {
  text-align: right;
}
@media (max-width: 1100px) {
  .summary-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .strategy-summary {
    padding: 15px;
  }
  .strategy-summary header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .strategy-header-info {
    margin-left: auto;
  }
  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
