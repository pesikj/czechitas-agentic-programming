// Creates an administrator account and sends its invitation: npm run admin:create -- <email>
// Run from the server shell; this is how the first administrator is provisioned.
// Running it again for an admin who has not activated yet resends the invitation.
import { createAccount, findUserByEmail, sendInvitation, type InvitationResult } from '../src/server/auth/accounts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:create -- <email>');
  process.exit(2);
}

let invitation: InvitationResult;
const result = await createAccount({ email, role: 'admin' });
if (result.created) {
  console.log(`Account created: ${result.user.email} (administrator, awaiting activation).`);
  invitation = result.invitation;
} else {
  const existing = result.reason === 'duplicate' ? await findUserByEmail(email) : undefined;
  if (!existing || existing.role !== 'admin' || existing.status !== 'pending') {
    console.error(`Account not created: ${result.message}`);
    process.exit(1);
  }
  console.log(`${existing.email} is an administrator awaiting activation; sending a new invitation.`);
  invitation = await sendInvitation(existing.id);
}

if (invitation.sent) {
  console.log('Invitation accepted by the SMTP server. Any earlier one-time password no longer works.');
  process.exit(0);
}
console.error(`Invitation NOT sent: ${invitation.error}`);
console.error('Fix the SMTP settings in .env and run this command again.');
process.exit(1);
