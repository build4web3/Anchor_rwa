# 🏦 Real World Asset Tokenization on Solana (Vault Receipts)

This project implements a **Real World Asset (RWA) tokenization system** on the Solana blockchain using the Anchor framework. The program enables custodians to issue on-chain, transferable claims for deposited **physical assets**, effectively creating **redeemable tokenized receipts**.

## ✨ Features

- **Vault Initialization** - A custodian creates a unique vault where physical assets can be deposited.
- **Deposit & Issue** - When a depositor deposits a physical item, the custodian issues an **ItemRecord** (an on-chain claim/receipt) to the depositor.
- **Transfer Claim** - Depositors can transfer their on-chain claim (ownership of the asset receipt) to another wallet.
- **Redeem Item** - Custodians mark items as redeemed once the depositor (or claim holder) physically redeems the asset. The claim becomes non-transferable after redemption.

## 📦 Accounts

### VaultAccount
Stores vault-level information.
- `custodian: Pubkey` → Authority who controls the vault.
- `vault_name: String` → Unique name (max 64 chars).
- `bump: u8` → PDA bump.

### ItemRecord
Represents the tokenized claim for a deposited physical item.
- `item_id: String` → Unique identifier (max 64 chars).
- `custodian: Pubkey` → Custodian managing the vault.
- `depositor: Pubkey` → Current claim owner.
- `deposit_ts: i64` → Timestamp of deposit.
- `redeemed: bool` → Redemption status.
- `metadata: Option<String>` → Optional URI for off-chain metadata (e.g., image, certificate).
- `redeem_ts: Option<i64>` → Timestamp of redemption.
- `bump: u8` → PDA bump.

## ⚙️ Instructions

### 1. Initialize Vault

```rust
initialize_vault(ctx, vault_name: String)
```

Creates a new vault account under a custodian.

### 2. Deposit & Issue

```rust
deposit_and_issue(ctx, item_id: String, metadata_uri: Option<String>)
```

- Custodian confirms receipt of a physical item.
- A new `ItemRecord` is issued to the depositor.

### 3. Transfer Claim

```rust
transfer_claim(ctx, new_owner: Pubkey)
```

- Current depositor transfers ownership of the claim to another wallet.
- Fails if the item is already redeemed.

### 4. Redeem Item

```rust
redeem_item(ctx)
```

- Custodian confirms release of the physical asset.
- Marks the claim as **redeemed**.
- Prevents further transfers.

## 📡 Events

- **ItemDeposited** → Triggered when a depositor receives a claim.
- **ClaimTransferred** → Triggered when ownership is transferred.
- **ItemRedeemed** → Triggered when an item is redeemed.

## 🚨 Error Codes

- `NameTooLong` → Vault name > 64 chars.
- `IdTooLong` → Item ID > 64 chars.
- `AlreadyRedeemed` → Item already redeemed.
- `UnauthorizedTransfer` → Transfer attempted by non-owner.
- `UnauthorizedRedemption` → Redemption attempted by non-custodian.

## 🛠️ Setup & Deployment

### Prerequisites
- Rust
- Solana CLI
- Anchor

### Build

```bash
anchor build
```

### Deploy

```bash
anchor deploy
```

### Run Tests

```bash
anchor test
```

## 🌍 Example Use Case

Imagine a custodian (vault operator) managing **concert tickets, art pieces, or gold deposits**:

1. Custodian initializes a **vault**.
2. Depositor deposits a **physical item** (e.g., a gold bar, painting).
3. Custodian issues a **tokenized claim (ItemRecord)** to the depositor.
4. Depositor can **transfer** this claim to another buyer on-chain.
5. Buyer redeems the item by presenting the claim to the custodian.

This creates a **trust-minimized, verifiable on-chain record** of real-world asset ownership.

## 📜 License

MIT License – free to use, modify, and distribute.