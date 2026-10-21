/** Integer millionths of a pound. £1 = 1_000_000 micro. */
export const MICRO = 1_000_000n;

export function poundsToMicro(pounds: bigint): bigint {
  return pounds * MICRO;
}

export function sumMicro(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** Cost for a token count at a per-million-token price. Rounds half up. */
export function tokenCostMicro(tokens: number, microPerMillion: bigint): bigint {
  if (!Number.isInteger(tokens) || tokens < 0) {
    throw new Error("Token counts must be zero or a positive integer.");
  }
  return (BigInt(tokens) * microPerMillion + 500_000n) / MICRO;
}

export function requestCostMicro(
  tokensIn: number,
  tokensOut: number,
  inputMicroPerMillion: bigint,
  outputMicroPerMillion: bigint,
): bigint {
  return tokenCostMicro(tokensIn, inputMicroPerMillion) + tokenCostMicro(tokensOut, outputMicroPerMillion);
}
