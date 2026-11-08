import { defineConfig, devices } from '@playwright/test';

const testPort=Number(process.env.ASTERLOOM_TEST_PORT||4319);
if(!Number.isInteger(testPort)||testPort<1024||testPort>65535)throw Error('ASTERLOOM_TEST_PORT must be a local port from 1024 to 65535.');
const testOrigin=`http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: ['gameSessionPresentation.e2e.spec.ts','scenarioWorld.e2e.spec.ts','localModelConnection.e2e.spec.ts','asterTransitionAudio.e2e.spec.ts','gameOverview.e2e.spec.ts','sourceLibrary.e2e.spec.ts','asterAI.e2e.spec.ts','missionArena.e2e.spec.ts','sourceDownloads.e2e.spec.ts','asterDownloads.e2e.spec.ts','budgetBoard.e2e.spec.ts','missionExperience.e2e.spec.ts','practiceJourney.e2e.spec.ts','asterAudio.e2e.spec.ts','asterEntrance.e2e.spec.ts','aiActivity.e2e.spec.ts','asterAwareness.e2e.spec.ts','asterStructuredIntegration.e2e.spec.ts','aiToolUsage.e2e.spec.ts','constructionWorkbench.e2e.spec.ts','beginnerJourney.e2e.spec.ts','aiLearningPlan.e2e.spec.ts','asterGuide.e2e.spec.ts','worldArtwork.e2e.spec.ts','asterRecallScope.e2e.spec.ts','notebookDeletion.e2e.spec.ts','musicDirector.e2e.spec.ts','sourceSelection.e2e.spec.ts','sequenceWorkshop.e2e.spec.ts','providerConnectionRaces.e2e.spec.ts','gameplayHud.e2e.spec.ts','providerConnection.e2e.spec.ts','campaignExperience.e2e.spec.ts','dataInvestigation.e2e.spec.ts','lessonWorkbench.e2e.spec.ts','completionWorkbench.e2e.spec.ts','modelWorkspace.e2e.spec.ts','e2e.spec.ts','retrieval.e2e.spec.ts','playerCommit.e2e.spec.ts','learningJourney.e2e.spec.ts','musicExperience.e2e.spec.ts','recordingStudio.e2e.spec.ts','mediaFlow.e2e.spec.ts','visualCapture.e2e.spec.ts','thirdPartyNotices.e2e.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '.qa/playwright-report', open: 'never' }]],
  // Keep diagnostics for failures without retaining large generated fixtures from every passing case.
  preserveOutput: 'failures-only',
  outputDir: '.qa/playwright-results',
  use: { baseURL: testOrigin, trace: 'retain-on-failure', screenshot: 'only-on-failure', ...devices['Desktop Chrome'] },
  webServer: { command: 'npm start', url: testOrigin+'/api/health', reuseExistingServer: !process.env.ASTERLOOM_TEST_PORT, timeout: 30_000, env: {PORT:String(testPort)} },
});
