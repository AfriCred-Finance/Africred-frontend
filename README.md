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

Cross-chain deposits are opt-in and stay hidden until configured. See [Cross-chain deposits](#cross-chain-deposits-from-bnb-chain).

```
# Home chain (Base). AfriCredComposer receives cross-chain deposits.
NEXT_PUBLIC_MAINNET_COMPOSER_ADDRESS=0x...
NEXT_PUBLIC_SEPOLIA_COMPOSER_ADDRESS=0x...

# Source chain (BNB). AfriCredDepositGateway is the LP entry point.
NEXT_PUBLIC_BNB_GATEWAY_ADDRESS=0x...
NEXT_PUBLIC_BNB_USDC_ADDRESS=0x...          # defaults to Binance-Peg USDC (18 decimals)
NEXT_PUBLIC_BNB_SHARE_OFT_ADDRESS=0x...     # optional, only if shares bridge back
NEXT_PUBLIC_BNB_RPC_URL=

NEXT_PUBLIC_BNB_TESTNET_GATEWAY_ADDRESS=0x...
NEXT_PUBLIC_BNB_TESTNET_USDC_ADDRESS=0x...  # required on testnet, no sensible default
NEXT_PUBLIC_BNB_TESTNET_SHARE_OFT_ADDRESS=0x...
NEXT_PUBLIC_BNB_TESTNET_RPC_URL=
```

## Pages

- `/` overview of the funding, custody, and open-withdrawal lifecycle.
- `/vaults` lists every vault from the factory; each card shows phase, TVL, and share price.
- `/vault/[address]` vault detail. LP deposit and redeem, plus a USDC faucet on testnet. Role-gated panels appear for the allocator (custody, recovery) and the vault admin (whitelist, lifecycle transitions, buffer for tranched vaults). Also hosts the cross-chain deposit and order-recovery panels.
- `/admin` create a new loan vault from on-chain parameters (loan terms, allocator, deposit cap, tranching, whitelist). Only the factory owner can create vaults.
- `/borrow` borrower application form. Submits to `/api/loan-request`, which pins the dossier to IPFS via Pinata.

## Cross-chain deposits from BNB Chain

Lets an LP fund a Base vault with USDC held on BNB Chain. Contract side is documented in [af-contracts](../af-contracts/README.md#cross-chain-deposits-bnb-chain-first).

The UI spans two chains at once, which drives most of its design:

- **Vault reads are pinned to the home chain.** `useVault` takes an optional `chainId` and the vault page always passes it. Without that, every number on the page would break the moment the wallet switched to BNB, because the vault does not exist there.
- **BNB is a source, not a deployment.** `ChainSwitcher` groups BNB entries under a "Deposit from" heading so nobody reads them as a second deployment of the protocol.
- **The direct deposit panel is replaced, not duplicated.** On a source chain, `LpPanel` is hidden and [`CrossChainDepositPanel`](src/components/vault/CrossChainDepositPanel.tsx) takes its place. Showing both would mean showing one that cannot work.

### Two decimal domains

Binance-Peg USDC is 18 decimals; Base USDC is 6. The panel takes input in source decimals and derives the home-chain floor by rescaling between the two, since the bridge normalises through 6 shared decimals. Getting this wrong by a factor of 1e12 would either make the floor a no-op or park every deposit, so it is computed rather than approximated.

The bridge can only carry whole units of its shared precision. Anything finer is returned in the same transaction, and the panel shows it as "returned as dust" so the debited amount is never a surprise.

### Slippage and floors

The chosen tolerance becomes `minBridgedOut`, enforced on-chain as a floor on what the bridge delivers, and `minAssetsOut`, a floor on what the vault accepts after any home-chain swap.

`minSharesOut` is deliberately left at zero. The meaningful protection is `minAssetsOut`, which bounds what the bridge and any swap can take. A hard share floor on top of that mostly risks parking a deposit the LP wanted filled.

### Order recovery is the important part

A cross-chain message lands whenever it lands, but a vault only accepts deposits during its funding window and under its cap. The composer never reverts on that: it holds the funds as a claimable order instead. [`CrossChainOrdersPanel`](src/components/vault/CrossChainOrdersPanel.tsx) is where an LP acts on one.

| Status | What the LP sees | Actions |
|---|---|---|
| no record yet | In transit | none, still bridging |
| `Pending` | Waiting on the vault | Retry deposit, or Refund me |
| `AwaitingBridge` | Shares waiting | Pay bridge fee, or Keep shares on Base |
| `Settled` / `Refunded` | done | dismiss |

Orders come from three places, in descending trustworthiness:

1. **A log scan of the source chain** ([useDiscoveredOrders.ts](src/lib/useDiscoveredOrders.ts)). The gateway's `CrossChainDepositSent` indexes `sender` and `vault`, so deposits are discoverable from chain state regardless of which device sent them.
2. **`localStorage`**, a cache that carries the amount as the LP typed it. Never treated as truth.
3. **A manual message-id input**, the last resort for a deposit outside the readable range or sent by direct contract call.

There is no `ordersOf(account)` on-chain, so a guid cannot be derived from an address alone. That is why all three paths exist, and why the confirmation screen tells the LP to keep the guid.

Actions are writes to the composer on the home chain, so the panel offers a chain switch rather than failing when the wallet is still on BNB.

### Log discovery needs a real RPC, and free ones will not do

This was measured, not assumed. Every free public BNB Chain endpoint cripples `eth_getLogs` in a different way:

| Endpoint | Behaviour |
|---|---|
| `bsc-dataseed.binance.org` | rejects `eth_getLogs` outright, even a 500-block span |
| `bsc.meowrpc.com` | method not supported |
| `1rpc.io/bnb` | 50-block maximum |
| `bsc.blockrazor.xyz` | 25-block maximum |
| `bsc-mainnet.public.blastapi.io` | API key required |
| `bsc-rpc.publicnode.com` | serves 5000-block spans, but 403s once a range is deep enough to count as archive |

publicnode is the default because it is the only one that handles useful spans. It still cannot reach far back, so the scan walks backwards from the head in chunks and **stops at whatever wall the endpoint puts up, keeping everything it already read**. A partial scan still surfaces the deposit an LP just made, which is the case that matters. Reaching the wall sets `truncated`, which the panel states plainly rather than swallowing, because a silent cap reads as "you have no other deposits".

Tune with `NEXT_PUBLIC_BNB_LOG_CHUNK` (default 5000) and `NEXT_PUBLIC_BNB_LOG_MAX_CHUNKS` (default 12). For real coverage, point `NEXT_PUBLIC_BNB_RPC_URL` at a paid RPC or an indexer. Until then the manual message-id input is the reliable path for older deposits, and it is verified to resolve a real mainnet deposit against the live composer.

### Guards before sending

The panel checks upfront and warns rather than letting a doomed deposit through: an allow-list vault where the LP is not listed, a vault outside its funding window, and a gateway with no composer wired. None of these are hard blocks, since a parked deposit is always recoverable, but they are all cheaper to avoid than to unwind.

## API routes

- `POST /api/loan-request` accepts a borrower dossier and pins it to IPFS through Pinata. Requires `PINATA_JWT`.
- `GET /api/ipfs/list` and `GET /api/ipfs/[cid]` read pinned dossier files for the admin UI.

## Stack

Next.js 14, wagmi v2, viem, TanStack Query, Tailwind. Wallet via the injected connector (MetaMask). Monochrome stone / zinc palette with a light / dark theme toggle.

Demo only. The contracts are unaudited.
