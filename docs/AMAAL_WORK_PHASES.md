# Amaal Work Phases

**Status:** Active delivery roadmap  
**Phase currently active:** Phase 1 — Amaal Setup deep closure  
**Date:** 1 October 2026

## Purpose

Amaal is being delivered in controlled phases. Each phase has a clear exit condition. Later phases must not be used to bypass an earlier foundation gate.

The approved Amaal specifications remain the primary product/domain authority. The current repository is the implementation source. Historical prototypes and provider-specific documents are reference material unless explicitly marked current.

## Phase map

| Phase | Name | Primary outcome |
|---|---|---|
| 0 | Foundation & Architecture Freeze | Provider boundaries, transaction/event rules, terminology, deployment contract and live baseline are frozen and validated |
| 1 | Amaal Setup | First-run organization bootstrap: company root, Master Warehouse verification, four main regions, standard regional warehouses, pending CEO definition, policy-readiness markers and atomic audit/outbox completion |
| 2A | Neon Auth End-to-End | Login → session → JWT → Render `/v1/me`; development MFA remains disabled |
| 2B | Organization & Identity Model | CEO, Admin, RM, Manager, Team Leader, Agent, Shop Owner, Recovery Officer and organizational hierarchy |
| 2C | Authorization & Governance | Role/scope enforcement, approvals, suspension/reinstatement, audit and negative authorization tests |
| 3 | Products, IMEI & Inventory Custody | Product/variant/IMEI, master/regional warehouses, allocation, transfer, receipt and custody ledger |
| 4 | Sales, Customers, Payments & Commission | Atomic sales, customer records, receipts, payments, reversals and commission ledger |
| 5 | Aging, Recovery & Suspension | CEO aging policy, recovery workflow, recovery officer, escalation and suspension engine |
| 6 | Role Workspaces & Realtime Dashboards | Agent/TL/Manager/RM/Admin/CEO workspaces, comparisons, dashboards and realtime operations |
| 7 | Reporting & Operational Intelligence | Multi-period reporting, performance comparisons, aging, recovery, stock and commission intelligence |
| 8 | Amaal AI | Governed AI reasoning, reporting, action preparation and approval-aware orchestration |
| 9 | Predictive Intelligence | Python/ML forecasting, anomaly/risk signals and recovery/sales prediction |
| 10 | Hardening & Launch | Security, E2E, load, resilience, backups, observability, disaster recovery and production MFA |

## Phase rule

A later phase may depend on a previous phase, but may not redefine its source-of-truth rules silently. Any architecture change must be reconciled against the approved specifications and recorded in the current documentation.
