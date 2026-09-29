# Amaal Documentation Preservation Rule

Status: Active engineering rule

## Purpose

Until the final documentation and production-release stage, approved Amaal Markdown and Word documentation must not be silently lost during repository synchronization.

## Repository rule

The ZIP remains the source package for the current implementation. When a new ZIP contains an updated document at the same path, the new version replaces the old version.

When a new ZIP omits an existing `.md`, `.markdown`, `.doc`, or `.docx` file, the GitHub ZIP-sync workflow restores the existing file after extraction.

This protects:

- architecture specifications
- domain decisions
- database and authorization design
- event catalogues
- state machines
- implementation status
- infrastructure decisions
- repository blueprints
- future engineering handoff documents

## Exceptions

The final documentation cleanup/release stage may intentionally retire or archive documents. Until that stage is explicitly declared, the preservation rule remains active.

## Source of truth

The three approved Amaal specifications remain the primary product/architecture source of truth. Repository documentation records implementation decisions and must not silently overwrite the approved specification without an explicit reconciliation decision.
