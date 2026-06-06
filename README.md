# AfriCred Frontend

Minimal Next.js (App Router) demo UI for the AfriCred protocol on Base Sepolia.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in the deployed addresses
npm run dev                        # http://localhost:3000
```

`.env.local`:

```
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_FACTORY_ADDRESS=0x...   # AfriCredFactory
NEXT_PUBLIC_ROUTER_ADDRESS=0x...    # AfriCredRouter (optional for the demo)
NEXT_PUBLIC_USDC_ADDRESS=0x...      # MockUSDC
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
```

## Pages

- **`/`** — overview of the funding → active → settled lifecycle.
- **`/vaults`** — lists all vaults from the factory; each card shows phase, TVL, share price.
- **`/vault/[address]`** — vault detail. LP deposit/redeem + USDC faucet; role-gated panels appear
  for the **allocator** (custody / return funds) and the **vault admin** (whitelist, start epoch).
- **`/admin`** — deploy a new vault from parameters (name, allocator, deposit cap, fees). Only the
  factory owner can create vaults.

## Stack

wagmi v2 + viem + TanStack Query, Tailwind. Wallet via the injected connector (MetaMask). Monochrome
stone/zinc palette, no vibrant colors.

> Demo only — unaudited contracts.
