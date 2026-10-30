# 10 Architecture and deployment

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-10 | 0.1 | draft | {date} | application-definition {definition_version} |

Deployment category: {deployment}

## Overview and boundaries
<What runs where; a component diagram (Mermaid) if there is more than one component.>

## Components
Built from is a catalogue asset (`CAT-nnn` and version) or `custom`.

| CMP | Component | Role | Built from | Runtime |
|---|---|---|---|---|

## Integrations
External systems, and every interface between two components.

| INT | Integration | Kind | From | To | Data | FRs | Failure behaviour |
|---|---|---|---|---|---|---|---|

## Technology and rationale
<The stack the template brings, and anything added with the requirement that needs it.>

## Environments and configuration
<Development and deployment (state both when they differ); configuration names, never secret values.>

## Running it
<Start, stop, update, backup, restore, reset; data locations and volumes; health checks. For a simple app, how to open it.>

## Logging, observability and releases
<Or "Not applicable: reason".>

## Cost drivers and limitations
<Or "Not applicable: reason".>
