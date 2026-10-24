# Rotary Lottery — Smart Contracts

## RotaryLotteryVRF.sol

A 5/39 community lottery that accepts **USDC or USDT** and draws winning numbers
with **cryptographic randomness via Chainlink VRF v2**. No operator can influence
the draw — the winning numbers come from Chainlink's verifiable randomness oracle.

### Features
- ERC20 ticket purchases (USDC/USDT) via `safeTransferFrom` (approve first).
- Configurable revenue split (platform fee / charity / prize pool) in basis points.
- Prize tiers: **5/5 jackpot** (with rollover reserve), **4/5**, **3/5**.
- `lockAndRequestDraw()` → Chainlink VRF request → `fulfillRandomWords` derives
  5 distinct numbers from 1..39 using rejection sampling on a keccak-expanded seed.
- `claimPrize(drawId, ticketIndex)` pays winners directly in the payment token.
- Admin setters mirror the off-chain Configuration Registry (PCR workflow).

### Deploy

```bash
npm i @chainlink/contracts @openzeppelin/contracts
```

Use Hardhat or Foundry. Constructor args:

| Arg | Example (Ethereum mainnet) |
|---|---|
| `_paymentToken` | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| `_coordinator` | VRF Coordinator v2 (see Chainlink docs for your chain) |
| `_gasLane` | 30 gwei key hash (chain-specific) |
| `_subscriptionId` | your v2 subscription id |
| `_callbackGasLimit` | `500000` |
| `_requestConfirmations` | `3` |
| `_ticketPrice` | `1000000` (= 1 USDC, 6 decimals) |
| `_platformWallet` | platform treasury (EOA or multisig) |
| `_charityWallet` | charity treasury |

### Chainlink VRF setup
1. Go to https://vrf.chain.link and create a VRF v2 subscription.
2. Fund it with LINK.
3. Add the deployed `RotaryLotteryVRF` address as a consumer.
4. Call `lockAndRequestDraw()` to run a draw; randomness is fulfilled on-chain.

### Chain coordinators (verify against current Chainlink docs)
- Ethereum: `0x2718a868...` (see docs)
- BNB Chain, Polygon: use the chain-specific coordinator + gas lane.

> Addresses, coordinators and gas lanes change over time — always confirm against
> https://docs.chain.link/vrf/v2 before deploying.

### Notes
- The contract holds funds only between purchase and settlement/claim.
- For production, wrap admin calls in a multisig (e.g. Safe) and gate with the
  on-chain equivalent of the platform's PCR timelock.
- This contract is a deployable artifact; the Base44 web app reads balances and
  records tickets off-chain via the platform-managed wallet, while settlement and
  prize payouts execute on-chain through this contract.
