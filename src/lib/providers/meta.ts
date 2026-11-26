export const PROVIDER_META = {
  PINGPONG: {
    label: "PingPong",
    color: "#e5483f",
    fields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App Secret", secret: true },
    ],
    mockPath: "/api/mock/pingpong",
  },
  PAYONEER: {
    label: "Payoneer",
    color: "#ff4800",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret", secret: true },
      { key: "programId", label: "Program ID" },
      { key: "payeeId", label: "Payee ID" },
    ],
    mockPath: "/api/mock/payoneer",
  },
  WORLDFIRST: {
    label: "WorldFirst",
    color: "#1f5fff",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client Secret", secret: true },
    ],
    mockPath: "/api/mock/worldfirst",
  },
} as const;

