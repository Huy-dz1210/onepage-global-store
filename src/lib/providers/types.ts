import type { Direction, Provider, TxStatus, TxType } from "@/generated/prisma/enums";

export interface NormalizedBalance {
  currency: string;
  available: number;
  pending: number;
}

export interface NormalizedTx {
  externalId: string;
  direction: Direction;
  type: TxType;
  status: TxStatus;
  amount: number;
  currency: string;
  fee: number;
  feeCurrency?: string;
  counterAmount?: number;
  counterCurrency?: string;
  fxRate?: number;
  counterparty?: string;
  description?: string;
  reference?: string;
  occurredAt: Date;
  raw: unknown;
}

export interface CheckoutRequest {
  method: "CARD" | "WALLET";
  amount: number;
  currency: string;
  orderRef: string;
  description?: string;
  payer: { name: string; email?: string };
  card?: { number: string; expiry: string; cvc: string };
  wallet?: { account: string; otp: string };
}

export interface CheckoutResult {
  ok: boolean;
  externalId?: string;
  fee?: number;
  error?: string;
  raw: unknown;
}

export interface ProviderAdapter {
  provider: Provider;
  fetchBalances(): Promise<NormalizedBalance[]>;
  /** Trả về từng trang giao dịch trong [from, to] */
  fetchTransactions(from: Date, to: Date): AsyncGenerator<NormalizedTx[]>;
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}
