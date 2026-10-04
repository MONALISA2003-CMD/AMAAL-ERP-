import assert from 'node:assert/strict';
import { policyConditionsMatch, saleLineAmountsAreValid, validateSalePaymentContract } from '../../services/finance/src/phase4-finance-rules.ts';

const cases = [];
function test(name, fn){ try { fn(); cases.push(`PASS ${name}`); } catch (e) { cases.push(`FAIL ${name}: ${e.message}`); throw e; } }

test('cash sale must be fully paid', () => validateSalePaymentContract({paymentType:'CASH',totalAmount:100,depositAmount:100,financedAmount:0}));
test('loan sale must reconcile deposit and financed amount', () => validateSalePaymentContract({paymentType:'LOAN',totalAmount:100,depositAmount:20,financedAmount:80,loanProviderId:'p',loanReference:'L-1'}));
test('cash sale rejects financed amount', () => assert.throws(() => validateSalePaymentContract({paymentType:'CASH',totalAmount:100,depositAmount:80,financedAmount:20}), /CASH sale/));
test('loan sale rejects non-reconciling finance', () => assert.throws(() => validateSalePaymentContract({paymentType:'LOAN',totalAmount:100,depositAmount:20,financedAmount:70,loanProviderId:'p',loanReference:'L-1'}), /equal/));
test('sale line math is enforced', () => saleLineAmountsAreValid({listPrice:110,discountAmount:10,finalPrice:100,minimumPrice:90,discountLimit:20}));
test('sale line rejects final price mismatch', () => assert.throws(() => saleLineAmountsAreValid({listPrice:110,discountAmount:5,finalPrice:100}), /minus discount/));
test('commission conditions accept eligible cash sale', () => assert.equal(policyConditionsMatch({conditions:{minSaleAmount:100,paymentTypes:['CASH']},saleAmount:120,paymentType:'CASH'}), true));
test('commission conditions reject wrong payment type', () => assert.equal(policyConditionsMatch({conditions:{paymentTypes:['CASH']},saleAmount:120,paymentType:'LOAN'}), false));
test('commission conditions reject below minimum', () => assert.equal(policyConditionsMatch({conditions:{minSaleAmount:150},saleAmount:120,paymentType:'CASH'}), false));

console.log(`Phase 4 rule tests passed: ${cases.length}`);
