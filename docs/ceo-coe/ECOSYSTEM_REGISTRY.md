# Ecosystem Registry

Last refreshed locally: 2026-06-05.

This registry tracks GitHub repos and relevant F-drive project roots. PTI is the CEO COE and operating source of truth.

## Active And Controlled Roots

| Project | Role | Local path | GitHub | Branch at scan | State at scan | CEO standing |
| --- | --- | --- | --- | --- | --- | --- |
| PTI | CEO COE / hosted command plane | `F:\Workspace\Programs\Independent-Products\PTI` | `https://github.com/Wolfrine/PTI.git` | `main` | dirty | Owns dashboard, registry, instructions, tracker, and PTI MCP. |
| Central / Aesthetic India | Control workspace | `F:\Central` and `F:\Central\workbench\01_active\aesthetic-india` | `https://github.com/Wolfrine/Central.git` | `main` | dirty | Aesthetic India is visible from mobile, but source control belongs to Central. |
| gtop-app | Growth Tutorials product | `F:\Workspace\Programs\Growth-Tutorials\gtop-app` | `https://github.com/Wolfrine/gtop-app.git` | `main` | dirty | Product-memory progress is strong, but implementation is blocked before app edits by GTOP builder git index-lock branch-switch failures. |
| growth-tutorials | Growth Tutorials hub/platform | `F:\Workspace\Programs\Growth-Tutorials\growth-tutorials` | `https://github.com/Wolfrine/growth-tutorials.git` | `dev-hub` | dirty | Hub/platform repo with active local work. |
| GT-shared-services | Growth Tutorials shared services | `F:\Workspace\Programs\Growth-Tutorials\GT-shared-services` | `https://github.com/Wolfrine/GT-shared-services.git` | `main` | dirty | Shared service root; changes can affect multiple GT surfaces. |
| Orynth | Independent product | `F:\Workspace\Programs\Independent-Products\Orynth` | `https://github.com/Wolfrine/Orynth.git` | `main` | clean | Study tracker product with Firebase routes. |
| Novel-Encyclopedia | Independent product | `F:\Workspace\Programs\Independent-Products\Novel-Encyclopedia` | `https://github.com/Wolfrine/Novel-Encyclopedia.git` | `main` | clean | Independent knowledge/product line. |
| NovaSaga | Creative writing | `F:\Workspace\NovaSaga` | `https://github.com/Wolfrine/NovaSaga.git` | `main` | clean | First-class novel-writing and worldbuilding workspace. |
| ChatGPT | Other / exports | `F:\Workspace\Programs\Other\ChatGPT` | `https://github.com/Wolfrine/ChatGPT.git` | `main` | clean | Conversation/export utility repo; classify before active product work. |
| StoryForge | Other / creative production | `F:\Workspace\Programs\Other\StoryForge` | `https://github.com/Wolfrine/StoryForge.git` | `main` | clean | Creative production/product draft stream. |
| luminar_robotics | Other / R&D | `F:\Workspace\Programs\Other\luminar_robotics` | `https://github.com/Wolfrine/luminar_robotics.git` | `main` | clean | Robotics and automation R&D root. |

## Local Scratch Or Non-GitHub Roots

| Project | Local path | State | Rule |
| --- | --- | --- | --- |
| local-test | `F:\Workspace\Programs\local-test` | Git root without GitHub remote at scan time | Treat as scratch. Do not include in CEO portfolio unless explicitly promoted. |

## Archived Roots

| Project | Archived path | GitHub | Rule |
| --- | --- | --- | --- |
| ops-forge | `F:\Workspace\Archive\legacy\Codex-Operations\ops-forge` | `https://github.com/Wolfrine/ops-forge.git` | Archived legacy operations experiment. Do not use for CEO process, dashboard, MCP, or refresh work unless explicitly revived. |
| GrowthWebsite | `F:\Workspace\Archive\legacy\GrowthWebsite` | `https://github.com/Wolfrine/GrowthWebsite` | Historical reference only. |
| legacy Growth Tutorials roots | `F:\Workspace\Archive\legacy\Growth-Tutorials\*` | mixed legacy repos | Historical reference only. |

## Maintenance Rule

When a project is added, archived, renamed, or moved, update:

- `docs/ceo-coe/ecosystem-registry.json`
- this file
- dashboard project data under `pti-app/src/app/components/codex-project-detail/codex-projects.data.ts`
- dashboard project data under `pti-app/src/app/components/new-codex-command/new-codex-command.component.ts`

For UI/dashboard-visible changes, run the visual verification gate before claiming completion.

## PM-Enabled Pilot

As of 2026-06-05, PM spaces are piloted for projects with committed or modified work in the last 10 days:

| Project | PM space | Activity reason |
| --- | --- | --- |
| PTI | `F:\Workspace\Programs\Independent-Products\PTI\.pm` | CEO COE/dashboard/wiki commits in the last 10 days. |
| Central / Aesthetic India | `F:\Central\.pm` | Recent dirty Aesthetic India docs/assets plus Central control state. |
| gtop-app | `F:\Workspace\Programs\Growth-Tutorials\gtop-app\.pm` | GTOP wiki/raw-note commits and dirty automation/app artifacts in the last 10 days. |
| NovaSaga | `F:\Workspace\NovaSaga\.pm` | NovaSaga wiki/lore curation commits in the last 10 days. |

PM agents may write only inside the project `.pm` directory.
