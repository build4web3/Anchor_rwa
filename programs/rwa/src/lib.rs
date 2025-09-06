use anchor_lang::prelude::*;

declare_id!("AMhfXoXiuxiBUkMTSmhhatA8wqYVjamNMdawqv87gAXk");

#[program]
pub mod vault_receipt {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, vault_name: String) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(vault_name.as_bytes().len() <= 64, ErrorCode::NameTooLong);
        vault.custodian = ctx.accounts.custodian.key();
        vault.vault_name = vault_name;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Custodian issues a redeemable token (ItemRecord) for a deposited physical item.
    pub fn deposit_and_issue(
        ctx: Context<DepositAndIssue>,
        item_id: String,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        let item = &mut ctx.accounts.item;
        let vault = &ctx.accounts.vault;

        require!(item_id.as_bytes().len() <= 64, ErrorCode::IdTooLong);
        
        item.item_id = item_id;
        item.custodian = vault.custodian;
        item.depositor = ctx.accounts.depositor.key();
        item.deposit_ts = Clock::get()?.unix_timestamp;
        item.redeemed = false;
        item.metadata = metadata_uri;
        item.redeem_ts = None;
        item.bump = ctx.bumps.item;

        emit!(ItemDeposited {
            item_account: item.key(),
            item_id: item.item_id.clone(),
            depositor: item.depositor,
            custodian: item.custodian,
        });

        Ok(())
    }

    /// Transfer the on-chain claim (owner) to another wallet. Signed by current owner.
    pub fn transfer_claim(ctx: Context<TransferClaim>, new_owner: Pubkey) -> Result<()> {
        let item = &mut ctx.accounts.item;
        require!(!item.redeemed, ErrorCode::AlreadyRedeemed);
        
        let old_owner = item.depositor;
        item.depositor = new_owner;

        emit!(ClaimTransferred {
            item_account: item.key(),
            old_owner,
            new_owner,
        });

        Ok(())
    }

    /// Custodian redeems the item — marks it redeemed so it can't be transferred again.
    pub fn redeem_item(ctx: Context<RedeemItem>) -> Result<()> {
        let item = &mut ctx.accounts.item;
        require!(!item.redeemed, ErrorCode::AlreadyRedeemed);
        
        item.redeemed = true;
        item.redeem_ts = Some(Clock::get()?.unix_timestamp);

        emit!(ItemRedeemed {
            item_account: item.key(),
            item_id: item.item_id.clone(),
            redeemer: ctx.accounts.redeemer.key(),
            custodian: ctx.accounts.custodian.key(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(vault_name: String)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub custodian: Signer<'info>,

    #[account(
        init,
        payer = custodian,
        space = VaultAccount::SPACE,
        seeds = [b"vault", custodian.key().as_ref(), vault_name.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, VaultAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(item_id: String)]
pub struct DepositAndIssue<'info> {
    /// Custodian signs to confirm acceptance of the physical item
    #[account(mut)]
    pub custodian: Signer<'info>,

    /// The depositor who will receive the on-chain claim
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        seeds = [b"vault", vault.custodian.as_ref(), vault.vault_name.as_bytes()], 
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        init,
        payer = depositor,
        space = ItemRecord::SPACE,
        seeds = [b"item", vault.key().as_ref(), item_id.as_bytes()],
        bump,
    )]
    pub item: Account<'info, ItemRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferClaim<'info> {
    /// Current owner (depositor field) must sign
    #[account(mut)]
    pub current_owner: Signer<'info>,

    #[account(
        seeds = [b"vault", vault.custodian.as_ref(), vault.vault_name.as_bytes()], 
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        seeds = [b"item", vault.key().as_ref(), item.item_id.as_bytes()], 
        bump = item.bump,
        constraint = item.depositor == current_owner.key() @ ErrorCode::UnauthorizedTransfer,
        constraint = !item.redeemed @ ErrorCode::AlreadyRedeemed
    )]
    pub item: Account<'info, ItemRecord>,
}

#[derive(Accounts)]
pub struct RedeemItem<'info> {
    /// Custodian signs to confirm physical release
    #[account(mut)]
    pub custodian: Signer<'info>,

    /// The wallet presenting the token (redeemer)
    pub redeemer: Signer<'info>,

    #[account(
        seeds = [b"vault", vault.custodian.as_ref(), vault.vault_name.as_bytes()], 
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultAccount>,

    #[account(
        mut,
        seeds = [b"item", vault.key().as_ref(), item.item_id.as_bytes()], 
        bump = item.bump,
        constraint = item.custodian == custodian.key() @ ErrorCode::UnauthorizedRedemption,
        constraint = !item.redeemed @ ErrorCode::AlreadyRedeemed
    )]
    pub item: Account<'info, ItemRecord>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct VaultAccount {
    pub custodian: Pubkey,      // 32 bytes
    pub vault_name: String,     // 4 + 64 bytes (max)
    pub bump: u8,               // 1 byte
}

impl VaultAccount {
    pub const SPACE: usize = 8 + 32 + 4 + 64 + 1; // discriminator + fields = 109 bytes
}

#[account]
pub struct ItemRecord {
    pub item_id: String,        // 4 + 64 bytes (max)
    pub custodian: Pubkey,      // 32 bytes
    pub depositor: Pubkey,      // 32 bytes
    pub deposit_ts: i64,        // 8 bytes
    pub redeemed: bool,         // 1 byte
    pub metadata: Option<String>, // 1 + 4 + 200 bytes (max)
    pub redeem_ts: Option<i64>, // 1 + 8 bytes
    pub bump: u8,               // 1 byte
}

impl ItemRecord {
    pub const SPACE: usize = 8 + 4 + 64 + 32 + 32 + 8 + 1 + 1 + 4 + 200 + 1 + 8 + 1; // discriminator + fields = 364 bytes
}

#[event]
pub struct ItemDeposited {
    pub item_account: Pubkey,
    pub item_id: String,
    pub depositor: Pubkey,
    pub custodian: Pubkey,
}

#[event]
pub struct ClaimTransferred {
    pub item_account: Pubkey,
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct ItemRedeemed {
    pub item_account: Pubkey,
    pub item_id: String,
    pub redeemer: Pubkey,
    pub custodian: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Vault name too long")]
    NameTooLong,
    #[msg("Item id too long")]
    IdTooLong,
    #[msg("Item already redeemed")]
    AlreadyRedeemed,
    #[msg("Unauthorized transfer attempt")]
    UnauthorizedTransfer,
    #[msg("Unauthorized redemption attempt")]
    UnauthorizedRedemption,
}