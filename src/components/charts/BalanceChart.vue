<script setup lang="ts">
import type { EChartsOption } from 'echarts';
import ECharts from 'vue-echarts';

import { PieChart } from 'echarts/charts';
import {
  DatasetComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { use } from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

import type { BalanceValues } from '@/types';

use([
  PieChart,
  CanvasRenderer,
  DatasetComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  LabelLayout,
]);

const balanceChart = ref(null);
const { width } = useElementSize(balanceChart);

const props = withDefaults(
  defineProps<{
    currencies: BalanceValues[];
    showTitle?: boolean;
    compact?: boolean;
  }>(),
  {
    showTitle: true,
    compact: false,
  },
);
const settingsStore = useSettingsStore();
const route = useRoute();
const chartTheme = computed(() => (route.path === '/' ? 'light' : settingsStore.chartTheme));

const allocationColors = [
  '#5470c6',
  '#23966b',
  '#d99625',
  '#c65d70',
  '#7a62ba',
  '#298da8',
  '#b67a43',
];
const balanceChartOptions = computed((): EChartsOption => {
  return {
    title: {
      text: 'Balance',
      show: props.showTitle,
    },
    center: ['50%', '50%'],
    backgroundColor: 'rgba(0, 0, 0, 0)',
    color: props.compact ? allocationColors : undefined,
    dataset: {
      dimensions: ['balance', 'currency', 'est_stake', 'free', 'used', 'stake'],
      source: props.currencies,
    },
    tooltip: {
      trigger: 'item',
      renderMode: 'html',
      appendTo: 'body',
      confine: false,
      extraCssText: 'z-index: 10000;',
      textStyle: { fontSize: 14 },
      formatter: (params) => {
        return `${formatPriceCurrency(params.value.balance, params.value.currency, 8)}<br />${
          params.percent
        }% (${formatPriceCurrency(params.value.est_stake, params.value.stake)})`;
      },
    },
    // legend: {
    //   orient: 'vertical',
    //   right: 10,
    //   top: 20,
    //   bottom: 20,
    // },
    series: [
      {
        type: 'pie',
        radius: props.compact ? ['42%', '66%'] : ['40%', '70%'],
        center: ['50%', '50%'],

        encode: {
          value: 'est_stake',
          itemName: 'currency',
          tooltip: ['balance', 'currency'],
        },
        label: {
          show: !props.compact,
          formatter: '{b} - {d}%',
        },
        tooltip: {
          show: true,
        },
      },
    ],
  };
});
</script>

<template>
  <ECharts
    v-if="currencies"
    ref="balanceChart"
    :option="balanceChartOptions"
    :theme="chartTheme"
    :style="{ height: compact ? '190px' : width * 0.6 + 'px' }"
    autoresize
  />
  <ul v-if="compact" class="color-key" aria-label="Chart currency colors">
    <li v-for="(item, index) in currencies" :key="`${item.currency}-${index}`">
      <span
        class="color-dot"
        :style="{ backgroundColor: allocationColors[index % allocationColors.length] }"
        aria-hidden="true"
      />
      {{ item.currency }}
    </li>
  </ul>
</template>

<style lang="css" scoped>
.echarts {
  min-height: 20px;
}
.color-key {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 14px;
  margin: 0;
  padding: 8px;
  list-style: none;
  background: #fff;
  color: #172033;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.color-key li {
  display: flex;
  align-items: center;
  gap: 6px;
}
.color-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}
</style>
