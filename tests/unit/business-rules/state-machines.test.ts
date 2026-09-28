import {
  canTransitionAllocation,
  canTransitionImei,
  canTransitionRecovery,
  canTransitionSale,
} from "@amaal/business-rules";

if (!canTransitionImei("ALLOCATED_TO_AGENT", "SOLD")) throw new Error("Expected Agent-held IMEI to be sellable.");
if (canTransitionImei("SOLD", "ALLOCATED_TO_AGENT")) throw new Error("SOLD -> field allocation must be rejected.");
if (!canTransitionSale("CONFIRMED", "COMPLETED")) throw new Error("Expected sale completion transition.");
if (canTransitionSale("COMPLETED", "CANCELLED")) throw new Error("Completed sales cannot cancel directly.");
if (!canTransitionAllocation("APPROVED", "IN_TRANSIT")) throw new Error("Expected approved allocation to enter transit.");
if (!canTransitionRecovery("RECOVERED", "CLOSED")) throw new Error("Expected recovered case to close.");

if (!canTransitionAllocation("REQUESTED", "APPROVED")) throw new Error("Expected requested allocation approval transition.");
if (!canTransitionAllocation("IN_TRANSIT", "RECEIVED")) throw new Error("Expected in-transit allocation receipt transition.");
if (canTransitionAllocation("RECEIVED", "CANCELLED")) throw new Error("Received allocations cannot cancel directly.");
if (!canTransitionRecovery("OPEN", "ASSIGNED")) throw new Error("Expected recovery assignment transition.");
if (!canTransitionRecovery("ASSIGNED", "IN_PROGRESS")) throw new Error("Expected recovery start transition.");
if (!canTransitionRecovery("PROMISED_RETURN", "RECOVERED")) throw new Error("Expected promised-return recovery completion transition.");
if (canTransitionRecovery("CLOSED", "OPEN")) throw new Error("Closed recovery cases cannot reopen.");
