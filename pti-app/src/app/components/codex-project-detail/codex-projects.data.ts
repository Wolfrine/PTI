export type CodexProjectTone = 'ok' | 'warn' | 'critical' | 'muted';
export type CodexProjectStatus = 'Live' | 'Active' | 'Support' | 'Control' | 'Archived' | 'Unknown';

export interface CodexPortfolioProject {
  id?: string;
  name: string;
  group: string;
  status: CodexProjectStatus;
  branch: string;
  workingTree: string;
  localPath: string;
  repo: string;
  deployment: string;
  standing: string;
  nextAction: string;
  tone: CodexProjectTone;
}

export const CODEX_PORTFOLIO_PROJECTS: CodexPortfolioProject[] = [
  {
    name: 'PTI',
    group: 'Command plane',
    status: 'Live',
    branch: 'main',
    workingTree: 'clean before this dashboard revision',
    localPath: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
    repo: 'https://github.com/Wolfrine/PTI',
    deployment: 'pti-app-2ab59.web.app via GitHub Actions + Firebase',
    standing: 'Primary hosted interface for Codex operating visibility.',
    nextAction: 'Publish dashboard revision and verify route.',
    tone: 'ok',
  },
  {
    name: 'gtop-app',
    group: 'Growth Tutorials',
    status: 'Active',
    branch: 'codex/new-gtop-v2-lab',
    workingTree: 'dirty',
    localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
    repo: 'https://github.com/Wolfrine/gtop-app',
    deployment: 'gtop-app.web.app and dev-gtop-app.web.app',
    standing: 'Primary GTOP product and CI workflow hub.',
    nextAction: 'Inspect dirty files before any new GTOP implementation.',
    tone: 'warn',
  },
  {
    name: 'growth-tutorials',
    group: 'Growth Tutorials',
    status: 'Active',
    branch: 'dev-hub',
    workingTree: 'dirty',
    localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\growth-tutorials',
    repo: 'https://github.com/Wolfrine/growth-tutorials',
    deployment: 'growth-tutorials.web.app, hub-growthtutorials.web.app, GTAI chat targets',
    standing: 'Hub and platform repo with active local changes.',
    nextAction: 'Confirm scope and branch before touching hub or MCP behavior.',
    tone: 'warn',
  },
  {
    name: 'GT-shared-services',
    group: 'Growth Tutorials',
    status: 'Active',
    branch: 'main',
    workingTree: 'dirty',
    localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\GT-shared-services',
    repo: 'https://github.com/Wolfrine/GT-shared-services',
    deployment: 'asia-south1 shared service API and gt-shared-service.web.app',
    standing: 'Shared service layer; changes can affect multiple GT surfaces.',
    nextAction: 'Review the one dirty change before service work.',
    tone: 'warn',
  },
  {
    name: 'Central / Aesthetic India',
    group: 'Central workspace',
    status: 'Control',
    branch: 'main',
    workingTree: 'dirty',
    localPath: 'F:\\Central\\workbench\\01_active\\aesthetic-india',
    repo: 'https://github.com/Wolfrine/Central',
    deployment: 'repo workflow; separate publish route not detected',
    standing: 'Visible mobile project context, but source control belongs to Central.',
    nextAction: 'Use Central repo boundaries for commits and automation.',
    tone: 'warn',
  },
  {
    name: 'ops-forge',
    group: 'Operations',
    status: 'Active',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Codex-Operations\\ops-forge',
    repo: 'https://github.com/Wolfrine/ops-forge',
    deployment: 'lumio-forge Firebase project inferred from config',
    standing: 'Process tooling and operations standardization root.',
    nextAction: 'Use for reusable scripts and Codex operating process only.',
    tone: 'ok',
  },
  {
    name: 'Orynth',
    group: 'Independent product',
    status: 'Active',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Independent-Products\\Orynth',
    repo: 'https://github.com/Wolfrine/Orynth',
    deployment: 'orynth-io.web.app and dev-orynth-io.web.app',
    standing: 'Study tracker product with detected Firebase routes.',
    nextAction: 'Keep product work repo-specific.',
    tone: 'ok',
  },
  {
    name: 'Novel-Encyclopedia',
    group: 'Independent product',
    status: 'Active',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Independent-Products\\Novel-Encyclopedia',
    repo: 'https://github.com/Wolfrine/Novel-Encyclopedia',
    deployment: 'luminary-universe Firebase project from workflow',
    standing: 'Independent knowledge/product line.',
    nextAction: 'Revive only with explicit product scope and deploy target.',
    tone: 'ok',
  },
  {
    name: 'NovaSaga',
    group: 'Independent product',
    status: 'Support',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Independent-Products\\NovaSaga',
    repo: 'https://github.com/Wolfrine/NovaSaga',
    deployment: 'not detected',
    standing: 'Worldbuilding/content product in support posture.',
    nextAction: 'Define active outcome before implementation.',
    tone: 'muted',
  },
  {
    name: 'ChatGPT',
    group: 'Other',
    status: 'Unknown',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Other\\ChatGPT',
    repo: 'https://github.com/Wolfrine/ChatGPT',
    deployment: 'not detected',
    standing: 'Conversation/export utility repo; operational role needs confirmation.',
    nextAction: 'Classify before treating as active product work.',
    tone: 'muted',
  },
  {
    name: 'StoryForge',
    group: 'Other',
    status: 'Support',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Other\\StoryForge',
    repo: 'https://github.com/Wolfrine/StoryForge',
    deployment: 'not detected',
    standing: 'Creative production/product draft stream.',
    nextAction: 'Use only with a clear creative workflow objective.',
    tone: 'muted',
  },
  {
    name: 'luminar_robotics',
    group: 'Other',
    status: 'Support',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\Programs\\Other\\luminar_robotics',
    repo: 'https://github.com/Wolfrine/luminar_robotics',
    deployment: 'not detected',
    standing: 'Robotics and automation R&D root.',
    nextAction: 'Keep experiments isolated from production lanes.',
    tone: 'muted',
  },
  {
    name: 'GrowthWebsite',
    group: 'Archived',
    status: 'Archived',
    branch: 'main',
    workingTree: 'remote archived',
    localPath: 'not present in F:\\Workspace scan',
    repo: 'https://github.com/Wolfrine/GrowthWebsite',
    deployment: 'archived',
    standing: 'Historical reference only.',
    nextAction: 'Do not use as active execution root.',
    tone: 'critical',
  },
];

export function codexProjectId(project: CodexPortfolioProject): string {
  const raw = project.id?.trim() || project.name.toLowerCase();
  return raw
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
