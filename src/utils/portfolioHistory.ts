import type { WalletHistory } from '@/types';

/** Sum balances only across the interval covered by every included strategy. */
export function aggregateWalletHistory(histories: WalletHistory[]): WalletHistory | undefined {
  if (!histories.length) return undefined;
  const series = histories.map((history) => {
    const dateIndex = history.columns.indexOf('__date_ts');
    const totalIndex = history.columns.indexOf('total_quote');
    if (dateIndex < 0 || totalIndex < 0) return [];
    return history.data
      .filter((row) => row[dateIndex] !== '' && row[totalIndex] !== '')
      .map((row) => [Number(row[dateIndex]), Number(row[totalIndex])] as [number, number])
      .filter(([date, total]) => Number.isFinite(date) && Number.isFinite(total))
      .sort((a, b) => a[0] - b[0]);
  });
  if (series.some((points) => !points.length)) return undefined;
  const start = Math.max(
    ...series.map((points, index) =>
      Math.max(points[0]![0], histories[index]!.capture_start_ts ?? 0),
    ),
  );
  const end = Math.min(...series.map((points) => points.at(-1)![0]));
  if (start > end) return undefined;
  const timestamps = [
    ...new Set([start, ...series.flatMap((points) => points.map(([date]) => date))]),
  ]
    .filter((date) => date >= start && date <= end)
    .sort((a, b) => a - b);
  const cursors = series.map(() => 0);
  const data = timestamps.map((date) => {
    let total = 0;
    series.forEach((points, index) => {
      while (cursors[index]! + 1 < points.length && points[cursors[index]! + 1]![0] <= date)
        cursors[index]!++;
      total += points[cursors[index]!]![1];
    });
    return [date, total];
  });
  return {
    columns: ['__date_ts', 'total_quote'],
    data,
    length: data.length,
    botName: 'Portfolio total',
  };
}
