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
    id: 'pti',
    name: 'PTI',
    group: 'Command plane',
    status: 'Live',
    branch: 'main',
    workingTree: 'dirty during CEO refresh publish',
    localPath: 'F:\\Workspace\\Programs\\Independent-Products\\PTI',
    repo: 'https://github.com/Wolfrine/PTI',
    deployment: 'pti-app-2ab59.web.app via GitHub Actions + Firebase',
    standing: 'CEO COE is live; PM pilot now adds upward project reports and downward task allocation.',
    nextAction: 'Promote PM pilot, keep PTI as allocation surface, and fix token-gated MCP route.',
    tone: 'ok',
  },
  {
    id: 'gtop-app',
    name: 'gtop-app',
    group: 'Growth Tutorials',
    status: 'Active',
    branch: 'main',
    workingTree: 'dirty',
    localPath: 'F:\\Workspace\\Programs\\Growth-Tutorials\\gtop-app',
    repo: 'https://github.com/Wolfrine/gtop-app',
    deployment: 'gtop-app.web.app and dev-gtop-app.web.app',
    standing: 'PM verdict: blocked-for-execution. GTOP is in product-memory and execution-unblock mode: practice intelligence is clearer, but builder automation cannot pass the git index-lock branch-switch step.',
    nextAction: 'Repair the GTOP builder checkout, resume Live Quiz control room first, and run question-bank truth snapshot in parallel.',
    tone: 'critical',
  },
  {
    id: 'growth-tutorials',
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
    id: 'gt-shared-services',
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
    id: 'central-aesthetic-india',
    name: 'Central / Aesthetic India',
    group: 'Central workspace',
    status: 'Control',
    branch: 'main',
    workingTree: 'dirty',
    localPath: 'F:\\Central',
    repo: 'https://github.com/Wolfrine/Central',
    deployment: 'not detected',
    standing: 'PM verdict: active but yellow. Replacement full-access automation needs observed proof before it is treated as stable.',
    nextAction: 'Observe or trigger replacement supervisor, confirm one approved backlog item publishes, then review dirty source/docs/assets.',
    tone: 'warn',
  },
  {
    id: 'ops-forge',
    name: 'ops-forge (archived)',
    group: 'Archived',
    status: 'Archived',
    branch: 'main',
    workingTree: 'archived clean',
    localPath: 'F:\\Workspace\\Archive\\legacy\\Codex-Operations\\ops-forge',
    repo: 'https://github.com/Wolfrine/ops-forge',
    deployment: 'archived',
    standing: 'Legacy operations experiment. PTI is now the CEO COE and operating source of truth.',
    nextAction: 'Do not use for current process, dashboard, MCP, or refresh work unless explicitly revived.',
    tone: 'muted',
  },
  {
    id: 'orynth',
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
    id: 'novel-encyclopedia',
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
    id: 'novasaga',
    name: 'NovaSaga',
    group: 'Creative writing',
    status: 'Active',
    branch: 'main',
    workingTree: 'clean',
    localPath: 'F:\\Workspace\\NovaSaga',
    repo: 'https://github.com/Wolfrine/NovaSaga',
    deployment: 'not detected',
    standing: 'PM verdict: foundation refresh complete, but Book 1 protagonist and plot-spine decisions remain open.',
    nextAction: 'Run a focused protagonist-definition and Book 1 spine session before broad archive curation continues.',
    tone: 'warn',
  },
  {
    id: 'chatgpt',
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
    id: 'storyforge',
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
    id: 'luminar-robotics',
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
    id: 'growthwebsite',
    name: 'GrowthWebsite',
    group: 'Archived',
    status: 'Archived',
    branch: 'main',
    workingTree: 'remote archived',
    localPath: 'F:\\Workspace\\Archive\\legacy\\GrowthWebsite',
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
