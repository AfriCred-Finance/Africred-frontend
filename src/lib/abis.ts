// Minimal ABIs — only the entries the frontend calls.

export const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  { type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

export const factoryAbi = [
  {
    type: "function",
    name: "createVault",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "asset", type: "address" },
          { name: "admin", type: "address" },
          { name: "allocator", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "maxDeposits", type: "uint256" },
          { name: "whitelistAsset", type: "address" },
          { name: "whitelistBalance", type: "uint256" },
          { name: "lzEndpoint", type: "address" },
          { name: "feeRecipient", type: "address" },
          { name: "performanceFeeBps", type: "uint256" },
          { name: "managementFeeBps", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "vault", type: "address" },
      { name: "feeManager", type: "address" },
    ],
  },
  { type: "function", name: "allVaults", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "feeManagerOf",
    stateMutability: "view",
    inputs: [{ name: "vault", type: "address" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "VaultCreated",
    inputs: [
      { name: "vault", type: "address", indexed: true },
      { name: "feeManager", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "admin", type: "address", indexed: false },
      { name: "allocator", type: "address", indexed: false },
    ],
  },
] as const;

export const vaultAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "allocator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "custodied", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "started", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "isFunding", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "isInEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "getCurrentEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "getCurrentEpochInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "fundingStart", type: "uint80" },
          { name: "epochStart", type: "uint80" },
          { name: "epochEnd", type: "uint80" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "whitelisted",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxDeposit",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "startEpoch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fundingStart", type: "uint80" },
      { name: "epochStart", type: "uint80" },
      { name: "epochEnd", type: "uint80" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setWhitelistStatus",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "status", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "custodyFunds",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "returnFunds",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
