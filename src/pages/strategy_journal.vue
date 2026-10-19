<script setup lang="ts">
import { strategyMessagePost, tradeJournal } from '@/utils/strategyJournal';

const botStore = useBotStore();
const strategy = ref('');
const search = ref('');
const kind = ref('all');
const activityLimit = ref(10);
const loading = ref(false);
const error = ref('');
const bot = computed(() => botStore.activeBot);
const posts = computed(() =>
  [
    ...tradeJournal(
      bot.value?.allTrades ?? [],
      bot.value?.balance.starting_capital,
      bot.value?.stakeCurrency,
    ),
    ...(bot.value?.journalPosts ?? []),
  ].sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id)),
);
const strategies = computed(() =>
  [
    ...new Set(
      [bot.value?.botState.strategy, ...posts.value.map((post) => post.strategy)].filter(
        (name): name is string => !!name,
      ),
    ),
  ].sort(),
);
const visiblePosts = computed(() =>
  posts.value.filter(
    (post) =>
      (!strategy.value || post.strategy === strategy.value) &&
      (kind.value === 'all' || post.kind === kind.value) &&
      `${post.pair} ${post.title} ${post.message} ${post.tradeId ?? ''}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
const shownPosts = computed(() => visiblePosts.value.slice(0, activityLimit.value));
watch([strategy, search, kind, () => botStore.selectedBot], () => {
  activityLimit.value = 10;
});
async function refresh() {
  const selected = bot.value;
  if (!selected) return;
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([selected.getTrades(), selected.getOpenTrades(), selected.getBalance()]);
  } catch {
    error.value = 'Could not load trade history. Showing available records; retry to refresh.';
  } finally {
    loading.value = false;
  }
}
watch(
  () => botStore.selectedBot,
  () => {
    strategy.value = '';
    void refresh();
  },
  { immediate: true },
);
function exportHistory() {
  const blob = new Blob([JSON.stringify(visiblePosts.value, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'strategy-journal.json';
  link.click();
  URL.revokeObjectURL(url);
}
const example = JSON.stringify({
  id: 'BTC-USDT-rsi-cross-2026-10-18T14:05:00Z',
  timestamp: '2026-10-18T14:05:00Z',
  pair: 'BTC/USDT',
  title: 'RSI crossed above entry threshold',
  message:
    'RSI crossed from 28.4 to 31.2 above 30. Waiting for the volume condition before an entry signal can qualify.',
});
// Keep the example compatible with the same parser used for incoming messages.
const examplePost = strategyMessagePost(example, 'YourStrategy', 0);
</script>

<template>
  <main class="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Strategy journal</h1>
        <p class="text-muted mt-1">The facts behind each decision, in the order they happened.</p>
      </div>
      <div class="flex gap-2">
        <UButton icon="i-mdi-refresh" :loading="loading" @click="refresh">Refresh</UButton>
        <UButton
          color="neutral"
          variant="outline"
          :disabled="!visiblePosts.length"
          @click="exportHistory"
          >Export history</UButton
        >
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span class="rounded-full border px-3 py-1">{{ bot?.botName || 'Selected bot' }}</span>
      <span>{{
        bot?.websocketStarted ? 'Live connection active' : 'Live connection unavailable'
      }}</span>
      <span>· {{ visiblePosts.length }} events · Newest first · Times shown in UTC</span>
    </div>

    <UAlert v-if="error" color="error" :description="error" />
    <UAlert
      v-if="bot?.journalStorageError"
      color="warning"
      description="Browser storage is full or unavailable. New live posts may not survive a reload. Export history to save them."
    />

    <div class="flex flex-wrap gap-3">
      <label class="flex flex-col gap-1 text-sm">
        Strategy
        <select v-model="strategy" class="border rounded-md p-2 bg-default min-w-48">
          <option value="">All strategies</option>
          <option v-for="name in strategies" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Event type
        <select v-model="kind" class="border rounded-md p-2 bg-default">
          <option value="all">All events</option>
          <option value="execution">Executions</option>
          <option value="signal">Strategy signals</option>
          <option value="cancellation">Cancellations</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm grow">
        Search history
        <input
          v-model="search"
          type="search"
          placeholder="Pair, reason, or trade ID…"
          class="border rounded-md p-2 bg-default"
        />
      </label>
    </div>

    <p class="text-sm text-muted">
      Executions come from bot trade records. Signal explanations and cancellations are saved in
      this browser while connected. Events sent while disconnected cannot be recovered here. A
      strategy update describes conditions; it does not guarantee a trade.
    </p>

    <div v-if="!visiblePosts.length" class="border border-dashed rounded-xl p-10 text-center">
      <h2 class="font-medium">{{ loading ? 'Loading strategy history…' : 'No events to show' }}</h2>
      <p class="text-muted mt-2">
        {{
          posts.length
            ? 'Try another strategy or search.'
            : 'Completed trades and strategy messages will appear here.'
        }}
      </p>
    </div>
    <ol v-else aria-label="Strategy activity history" class="rounded-lg border px-3">
      <li v-for="post in shownPosts" :key="post.id">
        <StrategyActivityRow :post="post" :author="strategy ? undefined : post.strategy" />
      </li>
    </ol>
    <button
      v-if="visiblePosts.length > activityLimit"
      type="button"
      class="text-xs text-primary hover:underline cursor-pointer"
      @click="activityLimit += 10"
    >
      Load more
    </button>

    <details class="border rounded-lg p-4 text-sm">
      <summary class="cursor-pointer font-medium">
        Connect strategy reasoning and threshold alerts
      </summary>
      <div class="mt-3 space-y-3 text-muted">
        <p>
          Enable <code>apiserver.allow_custom_messages: true</code> in the bot configuration. In the
          strategy, call <code>self.dp.send_msg(...)</code> when a meaningful condition changes.
          Plain text works; JSON adds the pair, event timestamp, title, and stable ID for
          deduplication.
        </p>
        <pre class="overflow-x-auto rounded bg-elevated p-3 text-xs">
import json

# Emit once when the condition crosses, using actual indicator values.
self.dp.send_msg(json.dumps({{ example }}))</pre>
        <p>Example post: {{ examplePost.title }} — {{ examplePost.message }}</p>
        <p>
          Record the observed value, crossed threshold, remaining conditions, and why they matter to
          this strategy. Only report probabilities if the strategy actually calculates them. Use a
          unique ID per event and an ISO 8601 timestamp with timezone.
        </p>
        <p>
          Entry tags, exit reasons, and order tags provide the execution explanations. Full history
          across devices or disconnected periods requires a durable event journal in the bot
          backend.
        </p>
      </div>
    </details>
  </main>
</template>
