# Keep browser availability scoped to the invocation

The owner asked whether PTI Owner Chrome was necessary and required autonomous completion using existing chats. It is not needed for desktop-owned Chrome control.

## Observed cause

An app-native continuation of existing chat 01a1b9a7-6bfb-7092-9574-6f4862d0cd84 (turn 01a1b9e9-f83b-7ee1-81ac-901671fd780a) had the official cua tool declared but refused to initialize it because a previous bridge turn had persisted a blanket developer prohibition. The standalone preflight had escaped its intended invocation scope.

## Correction

Worker 0.4.10 explicitly scopes its preflight to the standalone invocation and permits a later desktop-owned continuation to check its actual official tools through normal authorization. It does not grant browser access, transfer identities or weaken URL policy. PTI Owner Chrome was disabled through its own unregister script, preserving files and history. New jobs receive no provider MCP configuration. Plugin 0.4.12 directs browser work to the existing desktop-owned project/module chat and keeps task records and native chats distinct.

Keep existing writer ownership. The bridge must finish before an app-owned continuation, and no lock deletion or replacement chat is authorized to evade a writer. Hosted protocol 0.4.7 is unchanged. Build/syntax checks establish source validity; actual chat/browser evidence and maintenance activation receipts establish runtime behavior separately.
