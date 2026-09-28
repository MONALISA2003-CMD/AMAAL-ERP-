import { validateRecoveryTransition } from '../../../../services/recovery/src/index.js';

validateRecoveryTransition({ caseId:'case-1', imeiId:'imei-1', actorUserId:'user-1', fromState:'OPEN', toState:'ASSIGNED' });
validateRecoveryTransition({ caseId:'case-1', imeiId:'imei-1', actorUserId:'user-1', fromState:'ASSIGNED', toState:'IN_PROGRESS' });
validateRecoveryTransition({ caseId:'case-1', imeiId:'imei-1', actorUserId:'user-1', fromState:'PROMISED_RETURN', toState:'RECOVERED' });
validateRecoveryTransition({ caseId:'case-1', imeiId:'imei-1', actorUserId:'user-1', fromState:'RECOVERED', toState:'CLOSED' });

let rejected = false;
try {
  validateRecoveryTransition({ caseId:'case-1', imeiId:'imei-1', actorUserId:'user-1', fromState:'CLOSED', toState:'OPEN' });
} catch {
  rejected = true;
}
if (!rejected) throw new Error('Closed recovery cases must not reopen.');
