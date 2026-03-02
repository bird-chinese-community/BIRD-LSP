export const shouldSuppressLspMethod = (
  method: string,
  hiddenErrors: readonly string[],
): boolean => hiddenErrors.includes(method);
