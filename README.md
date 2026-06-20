# AfriCred Frontend

Next.js (App Router) demo UI for the AfriCred protocol on Base Sepolia.

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
NEXT_PUBLIC_ROUTER_ADDRESS=0x...    # AfriCredRouter (optional)
NEXT_PUBLIC_USDC_ADDRESS=0x...      # USDC (or MockUSDC on testnet)
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org

# Server-side only. Used by /api/ipfs to pin borrower dossier files via Pinata.
PINATA_JWT=
```

## Pages

- `/` overview of the funding, custody, and open-withdrawal lifecycle.
- `/vaults` lists every vault from the factory; each card shows phase, TVL, and share price.
- `/vault/[address]` vault detail. LP deposit and redeem, plus a USDC faucet on testnet. Role-gated panels appear for the allocator (custody, recovery) and the vault admin (whitelist, lifecycle transitions, buffer for tranched vaults).
- `/admin` create a new loan vault from on-chain parameters (loan terms, allocator, deposit cap, tranching, whitelist). Only the factory owner can create vaults.
- `/borrow` borrower application form. Submits to `/api/loan-request`, which pins the dossier to IPFS via Pinata.

## API routes

- `POST /api/loan-request` accepts a borrower dossier and pins it to IPFS through Pinata. Requires `PINATA_JWT`.
- `GET /api/ipfs/list` and `GET /api/ipfs/[cid]` read pinned dossier files for the admin UI.

## Stack

Next.js 14, wagmi v2, viem, TanStack Query, Tailwind. Wallet via the injected connector (MetaMask). Monochrome stone / zinc palette with a light / dark theme toggle.

Demo only. The contracts are unaudited.
