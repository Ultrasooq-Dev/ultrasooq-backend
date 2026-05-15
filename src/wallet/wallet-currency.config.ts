import { BadRequestException } from '@nestjs/common';

export const DEFAULT_WALLET_CURRENCY = 'OMR';
const SUPPORTED_WALLET_CURRENCIES = new Set([DEFAULT_WALLET_CURRENCY]);

export function getWalletDefaultCurrency(): string {
  const currencyCode = (process.env.WALLET_DEFAULT_CURRENCY || DEFAULT_WALLET_CURRENCY).trim().toUpperCase();

  if (!SUPPORTED_WALLET_CURRENCIES.has(currencyCode)) {
    throw new Error('Invalid WALLET_DEFAULT_CURRENCY configuration');
  }

  return currencyCode;
}

export function assertWalletCurrency(currencyCode?: string): string {
  const normalized = (currencyCode || getWalletDefaultCurrency()).trim().toUpperCase();

  if (!SUPPORTED_WALLET_CURRENCIES.has(normalized)) {
    throw new BadRequestException('Unsupported wallet currency');
  }

  return normalized;
}
