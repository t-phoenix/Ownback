/**
 * Thin entry — implementation lives in backend/scripts/workflow-harness.ts.
 *
 *   cd backend && npm run smoke:workflow
 *   HARNESS_FE_URL=http://127.0.0.1:3000 npm run smoke:workflow
 */
await import('../../backend/scripts/workflow-harness.ts');
