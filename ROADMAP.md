# AfriCred - Technical Roadmap

Technical adaptation of the official strategic roadmap
"From Web3 Vaults MVP to the African Yield Engine" (Base-first MVP -> Private
launch -> Regional scale -> Pan-African infrastructure).

Status legend:
- `[Done]` deployed or implemented
- `[Partial]` partially delivered, see notes
- `[Todo]` not started

## Trajectory overview

| Phase | Horizon | Objective | Key product | Status |
|---|---|---|---|---|
| 0. Final scoping | Week 0 | Lock down the perimeter | Base-first MVP | `[Done]` |
| 1. MVP build | Business days 1-42 | Build the private platform | Web3 Vaults MVP | `[Done]` |
| 2. Private MVP launch | Months 2-3 | Test with selected investors | SME Credit Vault | `[Todo]` |
| 3. Product-Market Fit | Months 3-6 | Validate repayment, risk and impact | SME Credit + Productive Assets pilot | `[Todo]` |
| 4. Controlled public launch | Months 6-12 | Open to more investors | 2 capped vaults | `[Todo]` |
| 5. Regional expansion | Year 2 | Deploy across UEMOA/ECOWAS | Multi-country vaults | `[Todo]` |
| 6. Pan-African infrastructure | Year 3 | Become the African Yield Engine | API, specialised vaults, institutional capital | `[Todo]` |

**Current position**: Phases 0 and 1 delivered. The contract core and the
investor dApp are validated on testnet, with an AgriCo Senegal pilot vault
deployed on Base Sepolia. Ready for Phase 2 (private MVP on mainnet) once the
hardening workstreams (emergency pause, multisig, external audit) are finalised.

## Guiding principles

- Base as the sole settlement chain for the MVP; multi-chain remains a progressive extension.
- USDC as the main settlement and reporting asset.
- SME Credit Vault as the first public product; Productive Assets Vault as a pilot; SME Equity Vault in private access.
- Controlled access via allow-list (`depositorWhitelist`) on the vaults that require it.
- Operational transparency: investor dashboard, admin dashboard, impact dashboard and periodic reporting.
- Ramp gated by repayments, security audit and quality of field data.

---

## Phase 0 - Final MVP scoping

**Horizon**: Week 0
**Status**: `[Done]`
**Objective**: Lock down product, technical, treasury and security decisions before any development.

### Priority actions

- `[Done]` Confirm Base as the sole settlement chain for the MVP (Base Sepolia today, Base mainnet in Phase 2).
- `[Done]` Adopt USDC as the main asset (MockUSDC on testnet, Circle USDC on mainnet via `HelperConfig`).
- `[Done]` Define vault parameters for the MVP: `maxDeposits` (global cap), `whitelistEnabled` (optional allow-list), `tranched` (senior/junior tranching), `repaymentType` (bullet / interest periodic / amortizing). Minimum ticket, per-wallet caps and lock-up are scheduled as Phase 2 extensions.
- `[Done]` Launch the SME Credit Vault first (`AfriCredVault` with `repaymentType` 0/1/2). Productive Assets Vault and SME Equity Vault remain in the Phase 3+ backlog.
- `[Done]` Technical dependencies: Base Sepolia RPC, deployment wallets, Vercel hosting, domains, IPFS pinning (Pinata). Safe multisig planned for mainnet go-live in Phase 2.

### Deliverables

- `[Done]` Functional and technical specifications (`af-contracts/README.md`, `af-frontend/README.md`, `af-frontend/public/architecture.svg`).
- `[Done]` Risk register: clean slither report after the CEI fix on `_settleCustody` + manual review of the 78 tests.
- `[Done]` On-chain role matrix: factory owner, admin (loan NFT holder), allocator. Off-chain roles (treasury, management, investors) will be managed via the Safe multisig in Phase 2.
- `[Done]` Go for the MVP build.

### KPIs

| Indicator | Target | Status |
|---|---|---|
| MVP scope | 100% validated | `[Done]` |
| Vault parameters | Validated per product | `[Done]` |
| Technical dependencies | Access available | `[Done]` |

### Gating decision

`[Done]` Product, treasury, security and data model rules are approved. Phase 1 build is authorised.

---

## Phase 1 - Build the Web3 Vaults MVP

**Horizon**: Business days 1 to 42
**Status**: `[Done]`
**Objective**: Deliver a private platform that supports wallet connection, vault deposits, position tracking and redemption workflows.

### Priority actions

- `[Done]` Wallet onboarding via the injected connector (MetaMask, Rabby, Phantom) with auto-switch to Base Sepolia on connect. Coinbase Smart Wallet and WalletConnect can be added on demand.
- `[Done]` Base-first contracts:
  - ERC-4626 (`AfriCredVault`)
  - Caps (`maxDeposits`, adjustable via `setMaxDeposits`)
  - Depositor whitelist (`whitelistEnabled` + `setDepositorWhitelist`)
  - Senior/junior tranching with first-loss buffer
  - Full lifecycle `Closed -> Funding -> Custody -> OpenWithdrawal`
  - NAV frozen during custody
  - On-chain restructure and recovery
  - LayerZero OFTCore integrated (peers off by default, lock/unlock model)
- `[Done]` Dashboards:
  - Investor: `/`, `/vaults`, `/vault/[address]` (deposit/redeem, position, IPFS dossier, testnet faucet)
  - Admin: `/admin` (3-step Create Loan wizard, Manage Loan tab, lifecycle, custody, restructure, recovery, hide-from-/vaults toggle)
  - Borrower: `/borrow` (loan application form, IPFS pinning)
- `[Done]` Security and quality:
  - 78 forge tests (unit + integration via `Lifecycle.t.sol`)
  - GitHub Actions CI (`forge fmt`/`build --sizes`/`test`)
  - Slither static analysis, clean after the CEI fix on `_settleCustody`
  - Documentation: READMEs, ROADMAP, architecture diagram in SVG/PNG/Mermaid
- `[Done]` Transactional UX: one-click Approve+Deposit and Approve+Repay flows, pending tx hash surfaced to the user, 120s timeout on `waitForTransactionReceipt`, revert detection via `receipt.status`, chain-mismatch banner with manual fallback.

### Deliverables

| Deliverable | Status | Notes |
|---|---|---|
| Working investor dApp | `[Done]` | Next.js 14 on Vercel; live |
| Vault contracts deployed on testnet | `[Done]` | Factory, LoanRegistryNFT, VaultDeployer, Router, 1 pilot vault (AgriCo Senegal) on Base Sepolia (`0x027c0dA455141827a76B5Aa2Dda2e85FB222001C`) |
| Operational dashboards | `[Done]` | Investor + Admin complete for the Phase 1 scope; Treasury and Impact dashboards planned for Phase 3-5 |
| Serverless backend | `[Done]` | Vercel routes `/api/ipfs`, `/api/ipfs/list`, `/api/loan-request` |
| Contracts + frontend documentation | `[Done]` | READMEs, ROADMAP, ARCHITECTURE diagram |

### KPIs

| Indicator | Target | Status |
|---|---|---|
| Critical tests (cap, whitelist, lifecycle, tranching, recovery) | Covered | `[Done]` |
| Critical security incident | 0 | `[Done]` |
| Documentation | Available before go-live | `[Done]` |

### Gating decision

`[Done]` Testnet validated, end-to-end demo successful (vault creation, LP deposit, custody, repayments, settlement). Phase 2 transition authorised subject to the hardening listed in the 90-day plan.

---

## Phase 2 - Private MVP launch

**Horizon**: Months 2 to 3
**Objective**: Test the system with a limited number of investors, prudent caps and real but controlled allocations.

### Priority actions

- `[Todo]` Launch a private beta with selected investors via the vault's `depositorWhitelist`.
- `[Todo]` Activate the SME Credit Vault in limited production on Base mainnet.
- `[Todo]` Set a pilot TVL of 50,000 to 250,000 USD with strict tickets and caps. Add `minDeposit` and `maxDepositPerWallet` to the `AfriCredVault` contract.
- `[Todo]` Fund 5 to 10 pilot operations: working capital, inventory, agricultural campaign or trade finance.
- `[Todo]` Test the full chain in production: deposit, allocation, tracking, repayment, impact reporting.
- `[Todo]` Produce a first monthly performance, risk and impact report.

### Deliverables

- `[Todo]` Private beta live (mainnet, allow-list).
- `[Todo]` First SME Credit allocations (5 to 10 real loans).
- `[Todo]` Incident and exception log.
- `[Todo]` Monthly investor and management report.
- `[Todo]` Repayment process validated in production.

### KPIs

| Indicator | Target |
|---|---|
| Deposits without critical incident | 95% + |
| Pilot repayment rate | 95% + |
| Impact report | Published monthly |

### Gating decision

Cautious cap increases only if deposits, allocations and first repayments are under control.

---

## Phase 3 - Product-Market Fit validation

**Horizon**: Months 3 to 6
**Objective**: Prove that investors understand the product, that SMEs use the funds correctly and that risk controls work.

### Priority actions

- `[Todo]` Gradually raise the caps as repayments perform (the on-chain `setMaxDeposits` lever is already in place; the policy needs definition).
- `[Todo]` First Productive Assets pilot: cold rooms, storage, solar irrigation or processing equipment. Requires either extending the `LoanRegistryNFT` schema or introducing a new `ProductiveAssetNFT`.
- `[Todo]` Standardised allocation sheets: beneficiary, amount, maturity, risk, collateral, repayment source. Currently a free-text `description` field + IPFS dossier.
- `[Todo]` Internal committee: risk, treasury, tech and impact.
- `[Todo]` External smart-contract audit (Spearbit / Cantina / Sherlock) before any significant ramp.
- `[Todo]` Formalise off-chain contracts with funded beneficiaries and field partners.

### Deliverables

- `[Todo]` Standardised beneficiary sheets.
- `[Todo]` Productive Assets pilot activated.
- `[Todo]` Governance committee operational.
- `[Todo]` Strengthened reporting framework.
- `[Todo]` External audit plan.

### KPIs

| Indicator | Target |
|---|---|
| TVL | 500,000 to 1,000,000 USD |
| Actors financed | 25 to 50 |
| Productive assets | 1 to 3 pilots |
| Arrears > 30 days | < 5% |
| Repayment rate | 95% + |

### Gating decision

Transition to the controlled public launch only if repayment, reporting and governance are robust enough.

---

## Phase 4 - Controlled public launch

**Horizon**: Months 6 to 12
**Objective**: Turn the private MVP into a credible commercial platform, opened progressively to a broader investor base.

### Priority actions

- `[Todo]` Gradually open access to more eligible investors (lift the manual allow-list).
- `[Todo]` Activate two public, capped vaults: SME Credit Vault and Productive Assets Vault.
- `[Todo]` Keep the SME Equity Vault in private access until legal structuring, valuation, liquidity and reporting are adapted.
- `[Todo]` Field partners: cooperatives, aggregators, exporting SMEs, cold-chain operators, mobile-money fintechs.
- `[Todo]` Quarterly reports on performance, risk, defaults, repayments and impact.
- `[Todo]` Partnerships: Base, Circle, Polygon/trails.build, DePIN/cold chain, impact investors.

### Deliverables

- `[Todo]` Platform open in a controlled way.
- `[Todo]` Two capped commercial vaults.
- `[Todo]` Standard quarterly report.
- `[Todo]` Documented field partnerships.
- `[Todo]` Strengthened audit file.

### KPIs

| Indicator | Target |
|---|---|
| TVL | 2 to 5 M USD |
| SMEs/actors financed | 100 to 250 |
| Productive assets | 5 to 15 |
| Active countries | Mali + Côte d'Ivoire or Senegal |
| Repayment | 94% + |

### Gating decision

Move to regional expansion only if the platform demonstrates stability, repeatable reporting, portfolio quality and a field pipeline.

---

## Phase 5 - Regional expansion and progressive multi-chain

**Horizon**: Year 2
**Objective**: Make AfriCred a UEMOA/ECOWAS regional infrastructure with multiple countries, multiple partners and progressive multi-chain capability.

### Priority actions

- `[Todo]` Extend operations to 3-5 priority countries: Mali, Côte d'Ivoire, Senegal, Ghana or Benin.
- `[Todo]` Enable multi-chain rails only after the Base-first model is validated:
  - Configure LayerZero peers between Base and Arbitrum/Optimism/Ethereum.
  - Deploy `RemoteShareInventory` per remote chain to manage redemption liquidity.
  - Dedicated audit of the OFT configuration before enabling.
- `[Todo]` Integrate new liquidity sources: stablecoin issuers, DeFi funds, impact funds, family offices, diaspora capital.
- `[Todo]` Strengthen on-chain/off-chain reporting: allocation proofs (allocator signatures), repayment proofs (oracle), impact proofs (EAS).
- `[Todo]` Mobile-money integration for local cash-in/cash-out (Wave, Orange Money, MTN rails, etc.).
- `[Todo]` Risk governance by country, sector, beneficiary, asset and partner.

### Deliverables

- `[Todo]` Country playbook.
- `[Todo]` Progressive multi-chain architecture (Base + 1 to 2 L2s).
- `[Todo]` Auditable impact reporting (`OnChainImpactRegistry` + EAS).
- `[Todo]` Regional partner network.
- `[Todo]` Mobile-money model prepared.

### KPIs

| Indicator | Target |
|---|---|
| TVL | 10 to 20 M USD |
| Countries covered | 3 to 5 |
| Actors financed | 1,000 + |
| Productive assets | 50 + |
| Blockchain partners | 3 to 5 ecosystems |

### Gating decision

Move to pan-African infrastructure stage after validation of country replication, portfolio quality and institutional capacity.

---

## Phase 6 - Pan-African productive finance infrastructure

**Horizon**: Year 3
**Objective**: Position AfriCred as the African Yield Engine: recognised infrastructure for financing real African assets at scale.

### Priority actions

- `[Todo]` Launch an institutional programme for DFIs, banks, impact funds, family offices and foundations.
- `[Todo]` Create specialised vaults: agriculture, cold chain, trade finance, solar productive assets, SME working capital. Requires `MultiLoanPortfolioVault` and per-sector variants.
- `[Todo]` Integrate oracles, automated scoring, ESG reporting, proof of impact and on-chain attestations.
- `[Todo]` Build an AfriCred API so fintechs and partners can plug their SME portfolios in.
- `[Todo]` Prepare tokenised governance only after real traction: utility, staking, governance, incentives and reputation.
- `[Todo]` Position AfriCred as the reference African use case for stablecoins, RWA, DePIN and impact finance.

### Deliverables

- `[Todo]` Institutional programme.
- `[Todo]` AfriCred API.
- `[Todo]` Sector-specialised vaults.
- `[Todo]` Advanced ESG/on-chain reporting.
- `[Todo]` Post-traction tokenomics design.

### KPIs

| Indicator | Target |
|---|---|
| TVL | 50 M USD + |
| Countries | 5 to 8 |
| SMEs/actors financed | 10,000 + |
| Farmers reached | 100,000 + |
| Productive assets | 250 + |
| Jobs supported | 25,000 + |

### Gating decision

AfriCred becomes a pan-African productive finance infrastructure once the platform combines liquidity, measurable impact and regional distribution.

---

## 3. Governance, risks and safeguards

| Risk | Recommended safeguard | Owner | Current status |
|---|---|---|---|
| Smart-contract risk | Full tests, Safe multisig, emergency pause, external audit before any cap increase | CTO / Blockchain | Tests `[Done]`; slither clean `[Done]`; multisig, pause, audit `[Todo]` |
| Liquidity risk | Clear lock-up, asynchronous redemptions, liquidity buffer | Treasury | Implicit lock-up via `state`; synchronous redemptions in `OpenWithdrawal`; no buffer |
| Portfolio risk | SME scoring, sector/country diversification, concentration limits, arrears monitoring | Risk committee | `risk` field (Low/Medium/High) on the LoanNFT; no scoring or concentration limits |
| Impact/data risk | Verifiable field data, allocation proofs, monthly then quarterly reporting | Impact / Operations | IPFS dossier `[Done]`; allocation proofs `[Todo]`; reporting `[Todo]` |
| Reputation risk | No guaranteed-yield promise, signed disclosure, prudent communication | Management / Legal | `DisclaimerDialog` `[Done]`; signed disclosure `[Todo]` |

## 4. Next 90-day execution plan (Phase 2 ramp)

| Period | Priority | Actions | Expected output |
|---|---|---|---|
| Days 1-15 | Phase 2 scoping | Size the Safe multisig (2/3 then 3/5), lock the pilot investor list via allow-list, sign off on the mainnet scope | Pilot build authorised |
| Days 16-35 | Contract hardening | Add `Pausable` (OZ), `minDeposit`, `maxDepositPerWallet`, richer events for reporting | Contracts ready for audit |
| Days 36-55 | External audit + fixes | Run the audit on Vault, Factory, LoanRegistryNFT, Router; fix findings; optional Immunefi/Cantina bug bounty | Clean audit report |
| Days 56-70 | Monitoring + runbooks | Configure Tenderly (alerts on lifecycle transitions, custodyFunds, recordRecovery); write admin and treasury runbooks | Production-ready ops stack |
| Days 71-80 | Mainnet deploy | Deploy Factory + Router on Base mainnet via the Safe; whitelist USDC; deploy the first pilot vault | MVP live on mainnet (closed allow-list) |
| Days 81-90 | Private beta | Onboard pilot investors (5 to 10), first SME loan in production, first monthly report | First repayment recorded on-chain |

## 5. Conclusion

The most credible path is to prove a simple, mastered loop first: **stablecoin on Base -> AfriCred vault -> productive SME allocation -> repayment -> impact reporting**. That loop is **validated on testnet today** via the AgriCo Senegal pilot vault at `0x027c0dA455141827a76B5Aa2Dda2e85FB222001C`. Phases 0 and 1 are closed.

To move into Phase 2 (private MVP on mainnet), two blocking technical workstreams remain:

1. **Security**: `Pausable` (emergency pause), Safe multisig on the factory, external audit.
2. **Operations**: on-chain monitoring (Tenderly), signed runbooks, mainnet Safe and deployment configuration.

Once those workstreams ship and the mainnet pilot is stable, AfriCred can accelerate toward productive assets, multi-country, multi-chain, mobile money and institutional capital.
