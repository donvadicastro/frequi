<script setup lang="ts">
import { h } from 'vue';
import type { BalanceValues } from '@/types';

const botStore = useBotStore();
const hideSmallBalances = ref(true);
const showBotOnly = ref(true);

const smallBalance = computed<number>(() => {
  return Number((1.1 ** botStore.activeBot.stakeCurrencyDecimals).toFixed(8));
});

const canUseBotBalance = computed(() => {
  return botStore.activeBot.botFeatures.hasBotBalance;
});

const balanceCurrencies = computed(() => {
  return (
    botStore.activeBot.balance.currencies?.filter(
      (v) =>
        (!hideSmallBalances.value || v.est_stake >= smallBalance.value) &&
        (!canUseBotBalance.value || !showBotOnly.value || (v.is_bot_managed ?? true) === true),
    ) ?? []
  );
});

const tableData = computed<Record<string, string | number | null>[]>(() => {
  return balanceCurrencies.value.map((v) => ({
    currency: v.currency,
    free: v.free,
    bot_owned: v.bot_owned ?? null,
    est_stake: v.est_stake,
    est_stake_bot: v.est_stake_bot ?? null,
  }));
});

const formatCurrency = (value) => {
  return value ? formatPrice(value, botStore.activeBot.stakeCurrencyDecimals) : '';
};

const chartValues = computed<BalanceValues[]>(() => {
  return balanceCurrencies.value.map((v) => {
    return {
      balance:
        showBotOnly.value && canUseBotBalance.value && v.bot_owned != undefined
          ? v.bot_owned
          : v.is_position === true
            ? v.position
            : v.balance,
      currency: v.currency,
      est_stake:
        showBotOnly.value && canUseBotBalance.value
          ? (v.est_stake_bot ?? v.est_stake)
          : v.est_stake,
      free: showBotOnly.value && canUseBotBalance.value ? (v.bot_owned ?? v.free) : v.free,
      used: v.used,
      stake: v.stake,
    };
  });
});

const tableFields = computed(() => {
  return [
    { field: 'currency', header: 'Currency' },
    {
      field: showBotOnly.value && canUseBotBalance.value ? 'bot_owned' : 'free',
      header: 'Available',
      asCurrency: true,
    },
    {
      field: showBotOnly.value && canUseBotBalance.value ? 'est_stake_bot' : 'est_stake',
      header: `in ${botStore.activeBot.balance.stake}`,
      asCurrency: true,
    },
  ];
});

async function refreshBalance() {
  botStore.activeBot.getBalance();
}

const tableColumns = computed(() => {
  return tableFields.value.map((field, index) => ({
    accessorKey: field.field,
    header: field.header,
    cell: field.asCurrency
      ? ({ row }: { row: { original: Record<string, number | string | null> } }) =>
          formatCurrency(row.original[field.field])
      : undefined,
    footer:
      index === 0
        ? 'Total'
        : index === 1
          ? () =>
              h(
                'span',
                {
                  class: 'italic',
                  title: `Increase over initial capital of ${formatCurrency(
                    botStore.activeBot.balance.starting_capital,
                  )} ${botStore.activeBot.balance.stake}`,
                },
                formatPercent(botStore.activeBot.balance.starting_capital_ratio),
              )
          : () =>
              h(
                'strong',
                {},
                showBotOnly.value && canUseBotBalance.value
                  ? formatCurrency(botStore.activeBot.balance.total_bot)
                  : formatCurrency(botStore.activeBot.balance.total),
              ),
  }));
});

onMounted(() => {
  refreshBalance();
});
</script>

<template>
  <div class="portfolio-view">
    <div class="flex flex-wrap flex-row mb-2 justify-end items-center">
      <label class="text-xl ms-1 me-auto mb-0">{{ showBotOnly ? 'Bot' : 'Account' }} Balance</label>
      <div class="flex flex-row gap-1">
        <UButton
          v-if="canUseBotBalance"
          color="neutral"
          :tooltip="!showBotOnly ? 'Showing Account balance' : 'Showing Bot balance'"
          :icon="showBotOnly ? 'mdi:robot' : 'mdi:bank'"
          @click="showBotOnly = !showBotOnly"
        />
        <UButton
          color="neutral"
          :tooltip="!hideSmallBalances ? 'Hide small balances' : 'Show all balances'"
          :icon="hideSmallBalances ? 'mdi:eye-off' : 'mdi:eye'"
          @click="hideSmallBalances = !hideSmallBalances"
        />
        <UButton color="neutral" icon="mdi:refresh" @click="refreshBalance" />
      </div>
    </div>
    <div class="portfolio-layout">
      <section class="allocation-panel" aria-label="Balance allocation">
        <h3>Allocation</h3>
        <BalanceChart :currencies="chartValues" :show-title="false" compact />
      </section>
      <section class="holdings-panel" aria-label="Portfolio holdings">
        <p v-if="botStore.activeBot.balance.note">
          <strong>{{ botStore.activeBot.balance.note }}</strong>
        </p>
        <UTable :data="tableData" :columns="tableColumns" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.portfolio-view {
  max-width: 1120px;
  margin: 0 auto;
  text-align: left;
}
.portfolio-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  margin-top: 18px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg);
  overflow: hidden;
}
.allocation-panel,
.holdings-panel {
  min-width: 0;
}
.allocation-panel {
  padding: 18px 12px;
  border-right: 1px solid var(--ui-border);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.allocation-panel :deep(.echarts) {
  width: 100%;
  max-width: 280px;
}
.allocation-panel h3 {
  margin: 0 4px 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text-highlighted);
}
.holdings-panel {
  overflow-x: auto;
}
.holdings-panel > p {
  padding: 14px 16px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
@media (max-width: 760px) {
  .portfolio-layout {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .allocation-panel {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
    align-items: center;
  }
}
</style>
