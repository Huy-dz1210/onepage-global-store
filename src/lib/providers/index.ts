import type { Account } from "@/generated/prisma/client";
import { decryptJson } from "@/lib/crypto";
import { payoneerAdapter } from "./payoneer";
import { pingpongAdapter } from "./pingpong";
import type { ProviderAdapter } from "./types";
import { worldfirstAdapter } from "./worldfirst";

export function adapterFor(account: Pick<Account, "provider" | "baseUrl" | "credentials">): ProviderAdapter {
  const creds = decryptJson<Record<string, string>>(account.credentials);
  const base = account.baseUrl.replace(/\/$/, "");
  switch (account.provider) {
    case "PINGPONG":
      return pingpongAdapter(base, creds as never);
    case "PAYONEER":
      return payoneerAdapter(base, creds as never);
    case "WORLDFIRST":
      return worldfirstAdapter(base, creds as never);
    default:
      throw new Error(`Unsupported provider ${account.provider}`);
  }
}

export { PROVIDER_META } from "./meta";

export function externalIdFromCreds(provider: "PINGPONG" | "PAYONEER" | "WORLDFIRST", creds: Record<string, string>) {
  return provider === "PINGPONG" ? creds.appId : provider === "PAYONEER" ? creds.payeeId : creds.clientId;
}
