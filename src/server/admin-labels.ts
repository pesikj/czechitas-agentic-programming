import type { User } from './auth/accounts';
import { formatDateTime } from './format';

export const accountStatusLabel = (user: Pick<User, 'status'>) =>
  ({ pending: 'čeká na aktivaci', active: 'aktivní', deactivated: 'deaktivován' })[user.status];

export const invitationStatusLabel = (user: Pick<User, 'invitationStatus' | 'invitationSentAt' | 'invitationError'>) =>
  ({
    not_sent: 'neodesláno',
    sending: 'odesílá se',
    sent: `odesláno ${formatDateTime(user.invitationSentAt)}`,
    failed: `selhalo: ${user.invitationError ?? ''}`,
  })[user.invitationStatus];

export const roleLabel = (user: Pick<User, 'role'>) => (user.role === 'admin' ? 'administrátor' : 'studující');
