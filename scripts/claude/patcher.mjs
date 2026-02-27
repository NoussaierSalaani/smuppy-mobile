#!/usr/bin/env node
/**
 * Claude CI Patcher — reads CI failure artifacts and produces a minimal fix.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY   — required
 *   CI_ARTIFACTS_DIR    — path to extracted CI artifacts (default: ci-failure-bundle)
 *   MAX_FILES           — max files the patch may touch (default: 12)
 *   FAILURE_SIGNATURE   — short failure description from the workflow
 *
 * Output:
 *   - Applies file edits directly to the working tree
 *   - Writes ci-failure-bundle/patch-summary.txt with a human-readable summary
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

// ── Config ──────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set');
  process.exit(1);
}

const CI_ARTIFACTS_DIR = process.env.CI_ARTIFACTS_DIR || 'ci-failure-bundle';
const MAX_FILES = parseInt(process.env.MAX_FILES || '12', 10);
const FAILURE_SIGNATURE = process.env.FAILURE_SIGNATURE || 'unknown';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;

// Red zone paths — patcher must NEVER modify these
const RED_ZONES = [
  /^aws-migration\/infrastructure\//,
  /^aws-migration\/lambda\/shared\/db\.ts$/,
  /^\.github\/workflows\//,
  /^scripts\/claude\//,
  /^eas\.json$/,
  /^app\.config\./,
  /\.env/,
  /^CLAUDE\.md$/,
  /^CLAUDE-WORKFLOW\.md$/,
  /cognito/i,
  /secret/i,
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectArtifacts(dir) {
  const result = {};
  if (!existsSync(dir)) return result;

  function walk(current, prefix) {
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry);
      const relPath = prefix ? `${prefix}/${entry}` : entry;
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, relPath);
      } else if (stat.isFile() && stat.size < 100_000) {
        // Only read text files under 100KB
        try {
          result[relPath] = readFileSync(fullPath, 'utf8');
        } catch {
          // skip binary files
        }
      }
    }
  }

  walk(dir, '');
  return result;
}

function getRepoTree() {
  try {
    const output = execSync('git ls-files --cached --others --exclude-standard', {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readSourceFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    // Truncate very large files
    const lines = content.split('\n');
    if (lines.length > 500) {
      return lines.slice(0, 500).join('\n') + `\n... (truncated, ${lines.length} total lines)`;
    }
    return content;
  } catch {
    return null;
  }
}

function parseFileEdits(response) {
  /**
   * Expects Claude to return file edits in this format:
   *
   * === FILE: path/to/file.ts ===
   * ```typescript
   * full file content
   * ```
   *
   * Or for targeted edits:
   *
   * === EDIT: path/to/file.ts ===
   * SEARCH:
   * ```
   * old code
   * ```
   * REPLACE:
   * ```
   * new code
   * ```
   */
  const edits = [];

  // Parse full file replacements
  const filePattern = /=== FILE: (.+?) ===([\s\S]*?)(?==== (?:FILE|EDIT):|$)/g;
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    const filePath = match[1].trim();
    const block = match[2];
    const codeMatch = block.match(/```\w*\n([\s\S]*?)```/);
    if (codeMatch) {
      edits.push({ type: 'write', path: filePath, content: codeMatch[1] });
    }
  }

  // Parse search/replace edits
  const editPattern = /=== EDIT: (.+?) ===([\s\S]*?)(?==== (?:FILE|EDIT):|$)/g;
  while ((match = editPattern.exec(response)) !== null) {
    const filePath = match[1].trim();
    const block = match[2];

    const searchMatch = block.match(/SEARCH:\s*```\w*\n([\s\S]*?)```/);
    const replaceMatch = block.match(/REPLACE:\s*```\w*\n([\s\S]*?)```/);

    if (searchMatch && replaceMatch) {
      edits.push({
        type: 'edit',
        path: filePath,
        search: searchMatch[1],
        replace: replaceMatch[1],
      });
    }
  }

  return edits;
}

function applyEdits(edits) {
  const applied = [];
  const blocked = [];

  for (const edit of edits) {
    // Red zone check
    if (RED_ZONES.some(re => re.test(edit.path))) {
      console.warn(`BLOCKED: ${edit.path} is in a red zone — skipping`);
      blocked.push(edit.path);
      continue;
    }

    try {
      if (edit.type === 'write') {
        writeFileSync(edit.path, edit.content, 'utf8');
        applied.push(edit.path);
        console.log(`WROTE: ${edit.path}`);
      } else if (edit.type === 'edit') {
        const existing = readFileSync(edit.path, 'utf8');
        if (!existing.includes(edit.search)) {
          console.warn(`SKIP: search string not found in ${edit.path}`);
          continue;
        }
        const updated = existing.replace(edit.search, edit.replace);
        writeFileSync(edit.path, updated, 'utf8');
        applied.push(edit.path);
        console.log(`EDITED: ${edit.path}`);
      }
    } catch (err) {
      console.error(`ERROR applying edit to ${edit.path}: ${err.message}`);
    }
  }

  return { applied, blocked };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Claude CI Patcher ===');
  console.log(`Failure: ${FAILURE_SIGNATURE}`);
  console.log(`Max files: ${MAX_FILES}`);

  // 1. Collect failure artifacts
  const artifacts = collectArtifacts(CI_ARTIFACTS_DIR);
  const artifactKeys = Object.keys(artifacts);
  console.log(`Collected ${artifactKeys.length} artifact files`);

  if (artifactKeys.length === 0) {
    console.error('No artifacts found — cannot produce a fix');
    process.exit(1);
  }

  // 2. Build artifact summary (truncate to stay within token limits)
  let artifactSummary = '';
  for (const [name, content] of Object.entries(artifacts)) {
    const truncated = content.length > 3000
      ? content.slice(-3000) + '\n... (truncated to last 3000 chars)'
      : content;
    artifactSummary += `\n\n--- ${name} ---\n${truncated}`;
  }

  // Cap total artifact text
  if (artifactSummary.length > 30000) {
    artifactSummary = artifactSummary.slice(-30000);
  }

  // 3. Get repo tree for context
  const repoFiles = getRepoTree();
  const repoTree = repoFiles.slice(0, 200).join('\n');

  // 4. Identify likely relevant source files from error messages
  const allArtifactText = Object.values(artifacts).join('\n');
  const fileRefs = new Set();
  const fileRefPattern = /(?:src|aws-migration)\/[\w/.-]+\.(?:ts|tsx|js|jsx)/g;
  let fileRefMatch;
  while ((fileRefMatch = fileRefPattern.exec(allArtifactText)) !== null) {
    fileRefs.add(fileRefMatch[0]);
  }

  // Read referenced source files for context
  let sourceContext = '';
  const maxSourceFiles = 10;
  let sourceCount = 0;
  for (const ref of fileRefs) {
    if (sourceCount >= maxSourceFiles) break;
    const content = readSourceFile(ref);
    if (content) {
      sourceContext += `\n\n--- ${ref} ---\n${content}`;
      sourceCount++;
    }
  }

  // Cap source context
  if (sourceContext.length > 40000) {
    sourceContext = sourceContext.slice(0, 40000) + '\n... (truncated)';
  }

  // 5. Build the prompt
  const systemPrompt = `You are a CI-fixing bot for the Smuppy mobile app (React Native + Expo + AWS Lambda backend).

Your ONLY goal: make CI pass with the smallest, safest change possible.

## Hard constraints — NEVER violate:
- Do NOT refactor or reformat unrelated code
- Do NOT add comments, docstrings, or type annotations to code you didn't change
- Modify at most ${MAX_FILES} files
- Do NOT touch infrastructure (CDK, CloudFormation), Cognito settings, secrets, env files, or workflow files
- Do NOT touch: eas.json, app.config.js/ts, .env*, CLAUDE.md, CLAUDE-WORKFLOW.md
- If you fix a bug, add/adjust a regression test when feasible
- Use parameterized SQL ($1, $2...) — never string interpolation
- Use proper TypeScript types — no \`any\`
- Follow existing code style and naming conventions

## Output format:
Respond with ONLY file edits in this exact format:

For search/replace edits (preferred — smaller diff):
=== EDIT: path/to/file.ts ===
SEARCH:
\`\`\`typescript
exact old code to find
\`\`\`
REPLACE:
\`\`\`typescript
new code to replace it with
\`\`\`

For full file writes (only if necessary):
=== FILE: path/to/file.ts ===
\`\`\`typescript
full file content
\`\`\`

After ALL edits, add a summary block:
=== SUMMARY ===
One paragraph explaining what failed and what the fix does.`;

  const userPrompt = `## CI Failure
Failure signature: ${FAILURE_SIGNATURE}

## CI Logs & Artifacts
${artifactSummary}

## Referenced Source Files
${sourceContext}

## Repo File Tree (partial)
${repoTree}

Now produce a minimal patch to fix this CI failure. Use EDIT blocks (search/replace) when possible.`;

  console.log(`\nPrompt size: system=${systemPrompt.length}, user=${userPrompt.length}`);

  // 6. Call Claude API
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  console.log('Calling Claude API...');
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n');

  console.log(`\nResponse length: ${responseText.length}`);

  // 7. Parse and apply edits
  const edits = parseFileEdits(responseText);
  console.log(`Parsed ${edits.length} edits`);

  if (edits.length === 0) {
    console.error('No edits parsed from Claude response — dumping response:');
    console.log(responseText.slice(0, 2000));
    process.exit(1);
  }

  if (edits.length > MAX_FILES) {
    console.error(`Too many edits (${edits.length} > ${MAX_FILES}) — aborting`);
    process.exit(1);
  }

  const { applied, blocked } = applyEdits(edits);
  console.log(`\nApplied: ${applied.length}, Blocked: ${blocked.length}`);

  if (applied.length === 0) {
    console.error('No edits were successfully applied');
    process.exit(1);
  }

  // 8. Extract summary for PR comment
  const summaryMatch = responseText.match(/=== SUMMARY ===([\s\S]*?)$/);
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : `Applied ${applied.length} file edits to fix CI failure.`;

  const patchSummary = [
    summary,
    '',
    `**Files modified:** ${applied.join(', ')}`,
    blocked.length > 0 ? `**Files blocked (red zone):** ${blocked.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  writeFileSync(join(CI_ARTIFACTS_DIR, 'patch-summary.txt'), patchSummary, 'utf8');
  console.log('\n=== Patch Summary ===');
  console.log(patchSummary);
}

main().catch(err => {
  console.error('Patcher failed:', err.message);
  process.exit(1);
});
