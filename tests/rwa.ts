import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultReceipt } from "../target/types/vault_receipt";
import { expect } from "chai";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

describe("vault_receipt", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.VaultReceipt as Program<VaultReceipt>;

  // Test accounts
  let custodian: Keypair;
  let depositor: Keypair;
  let newOwner: Keypair;
  let redeemer: Keypair;

  // Test data
  const vaultName = "TestVault";
  const itemId = "ITEM001";

  // PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  let itemPda: PublicKey;
  let itemBump: number;

  before(async () => {
    // Initialize test keypairs
    custodian = Keypair.generate();
    depositor = Keypair.generate();
    newOwner = Keypair.generate();
    redeemer = Keypair.generate();

    // Airdrop SOL to test accounts
    const airdropAmount = 2 * anchor.web3.LAMPORTS_PER_SOL;
    await Promise.all([
      provider.connection.requestAirdrop(custodian.publicKey, airdropAmount),
      provider.connection.requestAirdrop(depositor.publicKey, airdropAmount),
      provider.connection.requestAirdrop(newOwner.publicKey, airdropAmount),
      provider.connection.requestAirdrop(redeemer.publicKey, airdropAmount),
    ]);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Calculate PDAs
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), custodian.publicKey.toBuffer(), Buffer.from(vaultName)],
      program.programId
    );

    [itemPda, itemBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId)],
      program.programId
    );
  });

  describe("initialize_vault", () => {
    it("Successfully initializes a vault", async () => {
      const tx = await program.methods
        .initializeVault(vaultName)
        .accounts({
          custodian: custodian.publicKey,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian])
        .rpc();

      // Verify vault account
      const vaultAccount = await program.account.vaultAccount.fetch(vaultPda);
      expect(vaultAccount.custodian.toString()).to.equal(custodian.publicKey.toString());
      expect(vaultAccount.vaultName).to.equal(vaultName);
      expect(vaultAccount.bump).to.equal(vaultBump);
    });

    // it("Fails with name too long", async () => {
    //   const longName = "a".repeat(65); // 65 chars, max is 64
    //   const custodian2 = Keypair.generate();
      
    //   // Airdrop to new custodian
    //   await provider.connection.requestAirdrop(custodian2.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    //   await new Promise(resolve => setTimeout(resolve, 500));

    //   const [longVaultPda] = PublicKey.findProgramAddressSync(
    //     [Buffer.from("vault"), custodian2.publicKey.toBuffer(), Buffer.from("short")],
    //     program.programId
    //   );

    //   try {
    //     await program.methods
    //       .initializeVault(longName)
    //       .accounts({
    //         custodian: custodian2.publicKey,
    //         vault: longVaultPda,
    //         systemProgram: SystemProgram.programId,
    //       })
    //       .signers([custodian2])
    //       .rpc();
        
    //     expect.fail("Should have failed with NameTooLong error");
    //   } catch (error) {
    //     expect(error.error?.errorCode?.code || error.error?.errorMessage).to.include("NameTooLong");
    //   }
    // });

    it("Fails when trying to initialize same vault twice", async () => {
      try {
        await program.methods
          .initializeVault(vaultName)
          .accounts({
            custodian: custodian.publicKey,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([custodian])
          .rpc();
        
        expect.fail("Should have failed when trying to initialize existing vault");
      } catch (error) {
        // Should fail because account already exists
        expect(error.message).to.include("already in use");
      }
    });
  });

  describe("deposit_and_issue", () => {
    it("Successfully deposits an item and issues receipt", async () => {
      const metadataUri = "metadata-item001.json";
      
      const tx = await program.methods
        .depositAndIssue(itemId, metadataUri)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      // Verify item account
      const itemAccount = await program.account.itemRecord.fetch(itemPda);
      expect(itemAccount.itemId).to.equal(itemId);
      expect(itemAccount.custodian.toString()).to.equal(custodian.publicKey.toString());
      expect(itemAccount.depositor.toString()).to.equal(depositor.publicKey.toString());
      expect(itemAccount.redeemed).to.equal(false);
      expect(itemAccount.metadata).to.equal(metadataUri);
      expect(itemAccount.bump).to.equal(itemBump);
      expect(itemAccount.redeemTs).to.be.null;
      
      // Handle timestamp - it should be a valid Unix timestamp
      const depositTs = itemAccount.depositTs;
      if (depositTs instanceof anchor.BN) {
        expect(depositTs.toNumber()).to.be.greaterThan(0);
      } else {
        expect(depositTs).to.be.greaterThan(0);
      }
    });

    it("Successfully deposits an item without metadata", async () => {
      const itemId2 = "ITEM002";
      const [itemPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId2)],
        program.programId
      );

      await program.methods
        .depositAndIssue(itemId2, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPda2,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      // Verify item account
      const itemAccount = await program.account.itemRecord.fetch(itemPda2);
      expect(itemAccount.metadata).to.be.null;
    });

    // it("Fails with item ID too long", async () => {
    //   const longItemId = "a".repeat(65); // 65 chars, max is 64
    //   const [tempItemPda] = PublicKey.findProgramAddressSync(
    //     [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from("temp")],
    //     program.programId
    //   );

    //   try {
    //     await program.methods
    //       .depositAndIssue(longItemId, null)
    //       .accounts({
    //         custodian: custodian.publicKey,
    //         depositor: depositor.publicKey,
    //         vault: vaultPda,
    //         item: tempItemPda,
    //         systemProgram: SystemProgram.programId,
    //       })
    //       .signers([custodian, depositor])
    //       .rpc();
        
    //     expect.fail("Should have failed with IdTooLong error");
    //   } catch (error) {
    //     expect(error.error?.errorCode?.code || error.error?.errorMessage).to.include("IdTooLong");
    //   }
    // });

    it("Fails when custodian doesn't sign", async () => {
      const itemId3 = "ITEM003";
      const [itemPda3] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId3)],
        program.programId
      );

      try {
        await program.methods
          .depositAndIssue(itemId3, null)
          .accounts({
            custodian: custodian.publicKey,
            depositor: depositor.publicKey,
            vault: vaultPda,
            item: itemPda3,
            systemProgram: SystemProgram.programId,
          })
          .signers([depositor]) // Missing custodian signature
          .rpc();
        
        expect.fail("Should have failed without custodian signature");
      } catch (error) {
        expect(error.message).to.include("Signature verification failed");
      }
    });

    it("Fails when depositor doesn't sign", async () => {
      const itemId4 = "ITEM004";
      const [itemPda4] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId4)],
        program.programId
      );

      try {
        await program.methods
          .depositAndIssue(itemId4, null)
          .accounts({
            custodian: custodian.publicKey,
            depositor: depositor.publicKey,
            vault: vaultPda,
            item: itemPda4,
            systemProgram: SystemProgram.programId,
          })
          .signers([custodian]) // Missing depositor signature
          .rpc();
        
        expect.fail("Should have failed without depositor signature");
      } catch (error) {
        expect(error.message).to.include("Signature verification failed");
      }
    });

    it("Emits ItemDeposited event", async () => {
      const itemId5 = "ITEM005";
      const [itemPda5] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId5)],
        program.programId
      );

      let eventReceived = false;
      const listener = program.addEventListener("itemDeposited", (event) => {
        expect(event.itemAccount.toString()).to.equal(itemPda5.toString());
        expect(event.itemId).to.equal(itemId5);
        expect(event.depositor.toString()).to.equal(depositor.publicKey.toString());
        expect(event.custodian.toString()).to.equal(custodian.publicKey.toString());
        eventReceived = true;
      });

      await program.methods
        .depositAndIssue(itemId5, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPda5,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      // Wait a bit for event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await program.removeEventListener(listener);
      expect(eventReceived).to.be.true;
    });
  });

  describe("transfer_claim", () => {
    it("Successfully transfers claim to new owner", async () => {
      await program.methods
        .transferClaim(newOwner.publicKey)
        .accounts({
          currentOwner: depositor.publicKey,
          vault: vaultPda,
          item: itemPda,
        })
        .signers([depositor])
        .rpc();

      // Verify item account updated
      const itemAccount = await program.account.itemRecord.fetch(itemPda);
      expect(itemAccount.depositor.toString()).to.equal(newOwner.publicKey.toString());
      expect(itemAccount.redeemed).to.equal(false);
    });

    it("Fails when wrong current owner tries to transfer", async () => {
      try {
        await program.methods
          .transferClaim(depositor.publicKey)
          .accounts({
            currentOwner: depositor.publicKey, // Wrong current owner (should be newOwner now)
            vault: vaultPda,
            item: itemPda,
          })
          .signers([depositor])
          .rpc();
        
        expect.fail("Should have failed with unauthorized transfer");
      } catch (error) {
        expect(error.error?.errorCode?.code || error.message).to.include("UnauthorizedTransfer");
      }
    });

    it("Fails when trying to transfer redeemed item", async () => {
      // First redeem the item
      await program.methods
        .redeemItem()
        .accounts({
          custodian: custodian.publicKey,
          redeemer: redeemer.publicKey,
          vault: vaultPda,
          item: itemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, redeemer])
        .rpc();

      // Now try to transfer - should fail
      try {
        await program.methods
          .transferClaim(depositor.publicKey)
          .accounts({
            currentOwner: newOwner.publicKey,
            vault: vaultPda,
            item: itemPda,
          })
          .signers([newOwner])
          .rpc();
        
        expect.fail("Should have failed when trying to transfer redeemed item");
      } catch (error) {
        expect(error.error?.errorCode?.code || error.message).to.include("AlreadyRedeemed");
      }
    });

    it("Emits ClaimTransferred event", async () => {
      // Create a new item for this test
      const itemIdTransfer = "TRANSFER_TEST";
      const [itemPdaTransfer] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemIdTransfer)],
        program.programId
      );

      // First deposit the item
      await program.methods
        .depositAndIssue(itemIdTransfer, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPdaTransfer,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      let eventReceived = false;
      const listener = program.addEventListener("claimTransferred", (event) => {
        expect(event.itemAccount.toString()).to.equal(itemPdaTransfer.toString());
        expect(event.oldOwner.toString()).to.equal(depositor.publicKey.toString());
        expect(event.newOwner.toString()).to.equal(newOwner.publicKey.toString());
        eventReceived = true;
      });

      // Transfer the claim
      await program.methods
        .transferClaim(newOwner.publicKey)
        .accounts({
          currentOwner: depositor.publicKey,
          vault: vaultPda,
          item: itemPdaTransfer,
        })
        .signers([depositor])
        .rpc();

      // Wait a bit for event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await program.removeEventListener(listener);
      expect(eventReceived).to.be.true;
    });
  });

  describe("redeem_item", () => {
    let redeemTestItemPda: PublicKey;
    const redeemTestItemId = "REDEEM_TEST";

    before(async () => {
      // Create a new item for redemption tests
      [redeemTestItemPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(redeemTestItemId)],
        program.programId
      );

      await program.methods
        .depositAndIssue(redeemTestItemId, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: redeemTestItemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();
    });

    it("Successfully redeems item", async () => {
      await program.methods
        .redeemItem()
        .accounts({
          custodian: custodian.publicKey,
          redeemer: redeemer.publicKey,
          vault: vaultPda,
          item: redeemTestItemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, redeemer])
        .rpc();

      // Verify item account updated
      const itemAccount = await program.account.itemRecord.fetch(redeemTestItemPda);
      expect(itemAccount.redeemed).to.equal(true);
      expect(itemAccount.redeemTs).to.not.be.null;
      
      // Handle timestamp
      const redeemTs = itemAccount.redeemTs;
      if (redeemTs instanceof anchor.BN) {
        expect(redeemTs.toNumber()).to.be.greaterThan(0);
      } else if (redeemTs !== null) {
        expect(redeemTs).to.be.greaterThan(0);
      }
    });

    it("Allows different redeemer than depositor", async () => {
      // Create another item
      const itemId6 = "ITEM006";
      const [itemPda6] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId6)],
        program.programId
      );

      // Deposit with depositor
      await program.methods
        .depositAndIssue(itemId6, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPda6,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      // Redeem with different redeemer
      const differentRedeemer = Keypair.generate();
      await provider.connection.requestAirdrop(differentRedeemer.publicKey, anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      await program.methods
        .redeemItem()
        .accounts({
          custodian: custodian.publicKey,
          redeemer: differentRedeemer.publicKey,
          vault: vaultPda,
          item: itemPda6,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, differentRedeemer])
        .rpc();

      const itemAccount = await program.account.itemRecord.fetch(itemPda6);
      expect(itemAccount.redeemed).to.equal(true);
    });

    it("Fails when wrong custodian tries to redeem", async () => {
      const itemId7 = "ITEM007";
      const [itemPda7] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemId7)],
        program.programId
      );

      // Deposit item
      await program.methods
        .depositAndIssue(itemId7, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPda7,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      // Try to redeem with wrong custodian
      const wrongCustodian = Keypair.generate();
      await provider.connection.requestAirdrop(wrongCustodian.publicKey, anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
        await program.methods
          .redeemItem()
          .accounts({
            custodian: wrongCustodian.publicKey,
            redeemer: redeemer.publicKey,
            vault: vaultPda,
            item: itemPda7,
            systemProgram: SystemProgram.programId,
          })
          .signers([wrongCustodian, redeemer])
          .rpc();
        
        expect.fail("Should have failed with wrong custodian");
      } catch (error) {
        expect(error.error?.errorCode?.code || error.message).to.include("UnauthorizedRedemption");
      }
    });

    it("Fails when trying to redeem already redeemed item", async () => {
      try {
        await program.methods
          .redeemItem()
          .accounts({
            custodian: custodian.publicKey,
            redeemer: redeemer.publicKey,
            vault: vaultPda,
            item: redeemTestItemPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([custodian, redeemer])
          .rpc();
        
        expect.fail("Should have failed when trying to redeem already redeemed item");
      } catch (error) {
        expect(error.error?.errorCode?.code || error.message).to.include("AlreadyRedeemed");
      }
    });

    it("Emits ItemRedeemed event", async () => {
      // Create a new item for this test
      const itemIdRedeem = "REDEEM_EVENT_TEST";
      const [itemPdaRedeem] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), vaultPda.toBuffer(), Buffer.from(itemIdRedeem)],
        program.programId
      );

      // First deposit the item
      await program.methods
        .depositAndIssue(itemIdRedeem, null)
        .accounts({
          custodian: custodian.publicKey,
          depositor: depositor.publicKey,
          vault: vaultPda,
          item: itemPdaRedeem,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, depositor])
        .rpc();

      let eventReceived = false;
      const listener = program.addEventListener("itemRedeemed", (event) => {
        expect(event.itemAccount.toString()).to.equal(itemPdaRedeem.toString());
        expect(event.itemId).to.equal(itemIdRedeem);
        expect(event.redeemer.toString()).to.equal(redeemer.publicKey.toString());
        expect(event.custodian.toString()).to.equal(custodian.publicKey.toString());
        eventReceived = true;
      });

      // Redeem the item
      await program.methods
        .redeemItem()
        .accounts({
          custodian: custodian.publicKey,
          redeemer: redeemer.publicKey,
          vault: vaultPda,
          item: itemPdaRedeem,
          systemProgram: SystemProgram.programId,
        })
        .signers([custodian, redeemer])
        .rpc();

      // Wait a bit for event to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await program.removeEventListener(listener);
      expect(eventReceived).to.be.true;
    });
  });

  describe("Complex workflow", () => {
    it("Full workflow: initialize, deposit, transfer, redeem", async () => {
      // Setup new accounts for clean test
      const newCustodian = Keypair.generate();
      const newDepositor = Keypair.generate();
      const intermediateOwner = Keypair.generate();
      const finalRedeemer = Keypair.generate();

      // Airdrop SOL
      await Promise.all([
        provider.connection.requestAirdrop(newCustodian.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
        provider.connection.requestAirdrop(newDepositor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
        provider.connection.requestAirdrop(intermediateOwner.publicKey, anchor.web3.LAMPORTS_PER_SOL),
        provider.connection.requestAirdrop(finalRedeemer.publicKey, anchor.web3.LAMPORTS_PER_SOL),
      ]);

      await new Promise(resolve => setTimeout(resolve, 1000));

      const workflowVaultName = "WorkflowVault";
      const workflowItemId = "WORKFLOW001";

      // Calculate PDAs
      const [workflowVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), newCustodian.publicKey.toBuffer(), Buffer.from(workflowVaultName)],
        program.programId
      );

      const [workflowItemPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("item"), workflowVaultPda.toBuffer(), Buffer.from(workflowItemId)],
        program.programId
      );

      // 1. Initialize vault
      await program.methods
        .initializeVault(workflowVaultName)
        .accounts({
          custodian: newCustodian.publicKey,
          vault: workflowVaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([newCustodian])
        .rpc();

      // 2. Deposit and issue
      await program.methods
        .depositAndIssue(workflowItemId, "workflow-metadata.json")
        .accounts({
          custodian: newCustodian.publicKey,
          depositor: newDepositor.publicKey,
          vault: workflowVaultPda,
          item: workflowItemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([newCustodian, newDepositor])
        .rpc();

      // Verify initial state
      let itemAccount = await program.account.itemRecord.fetch(workflowItemPda);
      expect(itemAccount.depositor.toString()).to.equal(newDepositor.publicKey.toString());
      expect(itemAccount.redeemed).to.equal(false);

      // 3. Transfer claim
      await program.methods
        .transferClaim(intermediateOwner.publicKey)
        .accounts({
          currentOwner: newDepositor.publicKey,
          vault: workflowVaultPda,
          item: workflowItemPda,
        })
        .signers([newDepositor])
        .rpc();

      // Verify transfer
      itemAccount = await program.account.itemRecord.fetch(workflowItemPda);
      expect(itemAccount.depositor.toString()).to.equal(intermediateOwner.publicKey.toString());

      // 4. Redeem item
      await program.methods
        .redeemItem()
        .accounts({
          custodian: newCustodian.publicKey,
          redeemer: finalRedeemer.publicKey,
          vault: workflowVaultPda,
          item: workflowItemPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([newCustodian, finalRedeemer])
        .rpc();

      // Verify final state
      itemAccount = await program.account.itemRecord.fetch(workflowItemPda);
      expect(itemAccount.redeemed).to.equal(true);
      expect(itemAccount.redeemTs).to.not.be.null;
      
      // Handle timestamp
      const redeemTs = itemAccount.redeemTs;
      if (redeemTs instanceof anchor.BN) {
        expect(redeemTs.toNumber()).to.be.greaterThan(0);
      } else if (redeemTs !== null) {
        expect(redeemTs).to.be.greaterThan(0);
      }

      // Verify cannot transfer after redemption
      try {
        await program.methods
          .transferClaim(newDepositor.publicKey)
          .accounts({
            currentOwner: intermediateOwner.publicKey,
            vault: workflowVaultPda,
            item: workflowItemPda,
          })
          .signers([intermediateOwner])
          .rpc();
        
        expect.fail("Should not be able to transfer after redemption");
      } catch (error) {
        expect(error.error?.errorCode?.code || error.message).to.include("AlreadyRedeemed");
      }
    });
  });
});
