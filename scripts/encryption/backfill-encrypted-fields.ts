/**
 * scripts/encryption/backfill-encrypted-fields.ts
 *
 * Safe data-backfill script to encrypt existing plaintext credentials in the Account table.
 * Defaults to dry-run mode. Protects production environments from accidental runs.
 *
 * Usage:
 *   npx tsx scripts/encryption/backfill-encrypted-fields.ts           # Dry-run
 *   npx tsx scripts/encryption/backfill-encrypted-fields.ts --apply   # Execute changes
 */

import { runWithAuthAdapterContext } from '../../lib/auth/adapterContext';
import { prisma } from '../../lib/prisma';
import { isEncryptedField, encryptField } from '../../lib/security/encryption/envelope';

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const forceProd = args.includes('--force-production');

  const isProdEnv = process.env.NODE_ENV === 'production';
  const isProdDb =
    process.env.DATABASE_URL?.includes('prod') || process.env.DATABASE_URL?.includes('production');

  console.log('================================================================');
  console.log('🔐 Database Field Encryption Backfill Utility');
  console.log('================================================================');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Dry-run mode: ${isApply ? 'DISABLED (Applying changes)' : 'ENABLED'}`);

  // Safety boundaries
  if ((isProdEnv || isProdDb) && isApply && !forceProd) {
    console.error('\n❌ ERROR: Production database or environment detected.');
    console.error(
      'To run this backfill in production, you must explicitly supply the --force-production override flag.'
    );
    process.exit(1);
  }

  await runWithAuthAdapterContext(
    { operation: 'migration.backfill_encryption', models: ['Account'] },
    async () => {
      console.log('\nScanning Account table for existing plaintext secrets...');
      const accounts = await prisma.account.findMany();

      const totalAccounts = accounts.length;
      let accountsToUpdate = 0;
      let fieldsEncryptedCount = 0;
      let alreadyEncryptedCount = 0;

      for (const account of accounts) {
        let needsUpdate = false;
        const updateData: Record<string, string | null> = {};

        const fields = {
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          id_token: account.id_token,
        };

        for (const [fieldName, val] of Object.entries(fields)) {
          if (!val) continue;

          if (isEncryptedField(val)) {
            alreadyEncryptedCount++;
          } else {
            fieldsEncryptedCount++;
            needsUpdate = true;

            if (isApply) {
              const encryptedVal = await encryptField(val, {
                model: 'Account',
                field: fieldName,
                recordId: `${account.provider}:${account.providerAccountId}`,
              });
              updateData[fieldName] = encryptedVal;
            }
          }
        }

        if (needsUpdate) {
          accountsToUpdate++;
          if (isApply) {
            await prisma.account.update({
              where: { id: account.id },
              data: updateData,
            });
          }
        }
      }

      console.log('----------------------------------------------------------------');
      console.log(`Total Account records:     ${totalAccounts}`);
      console.log(`Plaintext secret fields:    ${fieldsEncryptedCount}`);
      console.log(`Already encrypted fields:  ${alreadyEncryptedCount}`);
      console.log(`Records requiring update:  ${accountsToUpdate}`);
      console.log('----------------------------------------------------------------');

      if (isApply) {
        console.log(
          `\n✅ SUCCESS: Successfully backfilled and encrypted ${accountsToUpdate} records.`
        );
      } else {
        console.log('\n💡 Dry-run complete. No database changes were made.');
        if (accountsToUpdate > 0) {
          console.log(
            'Run the command with the "--apply" flag to perform the encryption backfill.'
          );
        } else {
          console.log('All fields are already fully encrypted.');
        }
      }
    }
  );
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error during backfill execution:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
