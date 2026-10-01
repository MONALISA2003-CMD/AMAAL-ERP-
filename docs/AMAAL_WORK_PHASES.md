# Amaal Work Phases

**Status:** Active delivery roadmap  
**Phase currently active:** Phase 0 — Foundation & Architecture Freeze  
**Date:** 1 October 2026

## Purpose

Amaal is being delivered in controlled phases. Each phase has a clear exit condition. Later phases must not be used to bypass an earlier foundation gate.

The approved Amaal specifications remain the primary product/domain authority. The current repository is the implementation source. Historical prototypes and provider-specific documents are reference material unless explicitly marked current.

## Phase map

| Phase | Name | Primary outcome |
|---|---|---|
| 0 | Foundation & Architecture Freeze | One agreed source-of-truth architecture, provider boundaries, security rules, deployment contract and production baseline |
| 1 | Amaal Setup | Real first-run organization/bootstrap/setup experience |
| 2 | Identity & Security | Amaal authentication, sessions, CEO/Admin MFA and privileged access controls without Supabase Auth |
| 3 | Neon Migration Completion | Neon is the complete transactional source of truth and application packages have no Supabase database dependency |
| 4 | Events & Realtime | Outbox, worker, projections and realtime delivery operate without Supabase Realtime |
| 5 | Organization & Authorization | Full role, scope, ownership, permission and approval enforcement |
| 6 | Products, Variants & IMEI | Complete product, variant, IMEI and inventory custody lifecycle |
| 7 | Sales, Payments & Finance | Atomic sale/payment/receipt/reversal/commission/bonus workflows |
| 8 | Recovery & Aging | Aging, recovery, reassignment and recovery closure workflows |
| 9 | Management ERP | Production-ready role-specific ERP workspace and management views |
| 10 | Jarvis | Governed AI tools, approvals and orchestration over authorized Amaal truth |
| 11 | Predictive Intelligence | Forecasting, anomaly/risk signals and ML workloads over verified Amaal data |
| 12 | Hardening & Launch | Security, E2E, recovery, performance and operational release gate |

## Phase rule

A later phase may depend on a previous phase, but may not redefine its source-of-truth rules silently. Any architecture change must be reconciled against the approved specifications and recorded in the current documentation.
