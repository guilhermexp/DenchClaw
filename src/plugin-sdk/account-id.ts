/**
 * Resolve the account ID from plugin configuration.
 * Used by extensions that need to identify the current Dench account.
 */
export function resolveAccountId(config?: Record<string, unknown>): string | undefined {
  if (config?.accountId && typeof config.accountId === "string") {
    return config.accountId.trim() || undefined;
  }
  return undefined;
}
