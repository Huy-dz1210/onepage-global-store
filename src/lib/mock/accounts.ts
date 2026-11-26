import type { Provider } from "@/generated/prisma/enums";

/**
 * "Tài khoản clone": các merchant giả lập mà mock API chấp nhận.
 * Thêm dòng mới ở đây để có thêm tài khoản demo (mỗi key sinh lịch sử khác nhau).
 */
export interface MockMerchant {
  provider: Provider;
  key: string; // = externalAccountId
  name: string;
  credentials: Record<string, string>;
  currencies: string[];
  primary: string;
}

export const MOCK_MERCHANTS: MockMerchant[] = [
  {
    provider: "PINGPONG",
    key: "pp_app_store01",
    name: "PingPong – Shopify Store",
    credentials: { appId: "pp_app_store01", appSecret: "pp_secret_store01" },
    currencies: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"],
    primary: "USD",
  },
  {
    provider: "PAYONEER",
    key: "payee_100234",
    name: "Payoneer – Marketplace",
    credentials: {
      clientId: "payo_client_demo",
      clientSecret: "payo_secret_demo",
      programId: "100001",
      payeeId: "payee_100234",
    },
    currencies: ["USD", "EUR", "GBP", "CAD", "AUD"],
    primary: "USD",
  },
  {
    provider: "WORLDFIRST",
    key: "wf_client_88001",
    name: "WorldFirst – World Account",
    credentials: { clientId: "wf_client_88001", clientSecret: "wf_secret_88001" },
    currencies: ["USD", "EUR", "GBP", "JPY", "CNY", "HKD", "SGD", "AUD", "CAD"],
    primary: "USD",
  },
];

export function findMerchant(provider: Provider, key: string) {
  return MOCK_MERCHANTS.find((m) => m.provider === provider && m.key === key);
}

/** Tài khoản nhận tiền local (virtual account) – dữ liệu hư cấu cho demo */
export const LOCAL_RECEIVING_ACCOUNTS: Record<
  string,
  { bank: string; holder: string; fields: { label: string; value: string }[]; rail: string; eta: string }
> = {
  USD: {
    bank: "Demo Federal Bank (US)",
    holder: "ONEPAGE DEMO STORE LLC",
    rail: "ACH / Fedwire",
    eta: "ACH 1 ngày • Wire trong ngày",
    fields: [
      { label: "Account number", value: "8310 0042 7751" },
      { label: "ACH routing", value: "026 999 001" },
      { label: "Wire routing", value: "026 999 002" },
    ],
  },
  EUR: {
    bank: "Demo Bank Europe SA (BE)",
    holder: "ONEPAGE DEMO STORE",
    rail: "SEPA Instant",
    eta: "SEPA Instant: vài giây",
    fields: [
      { label: "IBAN", value: "BE71 9670 0000 4219 3346" },
      { label: "BIC", value: "DEMOBEB1XXX" },
    ],
  },
  GBP: {
    bank: "Demo Bank UK Ltd",
    holder: "ONEPAGE DEMO STORE",
    rail: "Faster Payments",
    eta: "Faster Payments: vài giây",
    fields: [
      { label: "Account number", value: "4417 2209" },
      { label: "Sort code", value: "04-00-99" },
    ],
  },
  JPY: {
    bank: "Demo Bank Japan (Tokyo branch)",
    holder: "ONEPAGE DEMO STORE",
    rail: "Zengin",
    eta: "Trong ngày làm việc",
    fields: [
      { label: "Bank code", value: "0999" },
      { label: "Branch code", value: "101" },
      { label: "Account (Futsu)", value: "7742019" },
    ],
  },
  AUD: {
    bank: "Demo Bank Australia",
    holder: "ONEPAGE DEMO STORE",
    rail: "NPP / PayID",
    eta: "NPP: vài giây",
    fields: [
      { label: "BSB", value: "802-999" },
      { label: "Account number", value: "1209 4471" },
    ],
  },
  CAD: {
    bank: "Demo Bank Canada",
    holder: "ONEPAGE DEMO STORE",
    rail: "EFT",
    eta: "1 ngày làm việc",
    fields: [
      { label: "Institution", value: "999" },
      { label: "Transit", value: "00123" },
      { label: "Account", value: "5517 0093 21" },
    ],
  },
  SGD: {
    bank: "Demo Bank Singapore",
    holder: "ONEPAGE DEMO STORE",
    rail: "FAST",
    eta: "FAST: vài giây",
    fields: [
      { label: "Bank code", value: "7999" },
      { label: "Account number", value: "885 112 7740" },
    ],
  },
};
