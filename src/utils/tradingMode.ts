export type TradingMode = 'live' | 'dry_run';

export const tradingModes = [
  { key: 'live', label: 'Live' },
  { key: 'dry_run', label: 'Dry-run' },
] as const;

export function tradingMode(config?: {
  dry_run?: boolean;
  runmode?: string;
}): TradingMode | 'unknown' {
  if (config?.runmode === 'webserver' || typeof config?.dry_run !== 'boolean') return 'unknown';
  return config.dry_run ? 'dry_run' : 'live';
}
