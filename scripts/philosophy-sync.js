#!/usr/bin/env node
// scripts/philosophy-sync.js — Sync philosophy .docx changes into Supabase modules
// Phase 7 of the Philosophy Engine build
// Run: node scripts/philosophy-sync.js --docx-path "/path/to/IronZ_Philosophy_Engine_Spec_v1.0.docx"

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Configuration ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const STATIC_JSON_PATH = path.resolve(__dirname, '../sources-of-truth/philosophy/modules_static.json');
const MODULES_JSON_PATH = path.resolve(__dirname, '../sources-of-truth/philosophy/philosophy_modules.json');

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function syncPhilosophy(docxPath) {
  console.log('\n=== PHILOSOPHY SYNC PIPELINE ===\n');

  // Step 1: Convert .docx to text
  console.log('Step 1: Converting .docx to text...');
  const text = convertDocxToText(docxPath);
  if (!text) {
    console.error('Failed to convert .docx file. Ensure the file exists and textutil/pandoc is available.');
    process.exit(1);
  }
  console.log(`  Converted: ${text.length} characters`);

  // Step 2: Parse into module objects
  console.log('\nStep 2: Parsing modules from document...');
  const parsedModules = parseModulesFromText(text);
  console.log(`  Found ${parsedModules.length} modules in document`);

  // Step 3: Fetch current modules
  console.log('\nStep 3: Loading current modules...');
  const currentModules = loadCurrentModules();
  console.log(`  Current: ${currentModules.length} modules`);

  // Step 4: Diff
  console.log('\nStep 4: Comparing...');
  const diff = diffModules(parsedModules, currentModules);

  // Step 5: Report
  console.log('\n=== SYNC REPORT ===');
  console.log(`  New modules:       ${diff.added.length}`);
  console.log(`  Updated modules:   ${diff.changed.length}`);
  console.log(`  Unchanged modules: ${diff.unchanged.length}`);
  console.log(`  Removed modules:   ${diff.removed.length}`);

  if (diff.added.length > 0) {
    console.log('\n  New modules:');
    for (const m of diff.added) {
      console.log(`    + ${m.id} (${m.category})`);
    }
  }

  if (diff.changed.length > 0) {
    console.log('\n  Changed modules:');
    for (const change of diff.changed) {
      console.log(`    ~ ${change.id}: ${change.summary}`);
    }
  }

  if (diff.removed.length > 0) {
    console.log('\n  Removed modules (will be deactivated, not deleted):');
    for (const m of diff.removed) {
      console.log(`    - ${m.id}`);
    }
  }

  if (diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0) {
    console.log('\n  No changes detected. Everything is in sync.');
    return;
  }

  // Step 6: Confirm
  const confirmed = await promptConfirm('\nProceed with sync?');
  if (!confirmed) {
    console.log('Sync cancelled.');
    return;
  }

  // Step 7: Apply changes
  console.log('\nStep 6: Applying changes...');
  applyChanges(diff, currentModules);
  console.log('  Changes applied to local JSON files.');

  // Step 8: Regenerate static JSON
  console.log('\nStep 7: Regenerating static JSON...');
  regenerateStaticJSON();
  console.log(`  Written to ${STATIC_JSON_PATH}`);

  // Step 9: Flag outdated plans (if Supabase available)
  if (diff.changed.length > 0 && SUPABASE_URL && SUPABASE_KEY) {
    console.log('\nStep 8: Flagging outdated plans...');
    await flagOutdatedPlans(diff.changed.map(c => c.id));
  }

  console.log('\n=== SYNC COMPLETE ===\n');
}

// ── Document Conversion ─────────────────────────────────────────────────────

function convertDocxToText(docxPath) {
  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docxPath}`);
    return null;
  }

  try {
    // Try textutil (macOS)
    return execSync(`textutil -convert txt -stdout "${docxPath}"`, { encoding: 'utf-8' });
  } catch {
    try {
      // Try pandoc
      return execSync(`pandoc -t plain "${docxPath}"`, { encoding: 'utf-8' });
    } catch {
      console.error('Neither textutil nor pandoc available for .docx conversion');
      return null;
    }
  }
}

// ── Module Parsing ──────────────────────────────────────────────────────────

function parseModulesFromText(text) {
  // This is a simplified parser that looks for module markers in the text.
  // A full implementation would parse the structured sections of the spec.
  // For now, it extracts module IDs and their content sections.
  const modules = [];
  const modulePattern = /Module:\s*([\w_]+)/g;
  let match;

  while ((match = modulePattern.exec(text)) !== null) {
    const moduleId = match[1].toUpperCase();
    const startIdx = match.index;
    const nextMatch = modulePattern.exec(text);
    const endIdx = nextMatch ? nextMatch.index : text.length;
    modulePattern.lastIndex = match.index + match[0].length; // Reset to continue

    const content = text.substring(startIdx, endIdx).trim();
    modules.push({
      id: moduleId,
      rawContent: content,
      contentHash: simpleHash(content)
    });
  }

  return modules;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

// ── Module Diffing ──────────────────────────────────────────────────────────

function diffModules(parsedModules, currentModules) {
  const currentMap = new Map(currentModules.map(m => [m.id, m]));
  const parsedMap = new Map(parsedModules.map(m => [m.id, m]));

  const added = [];
  const changed = [];
  const unchanged = [];
  const removed = [];

  // Check parsed against current
  for (const [id, parsed] of parsedMap) {
    const current = currentMap.get(id);
    if (!current) {
      added.push(parsed);
    } else {
      // Compare content hash (simplified)
      const currentHash = simpleHash(JSON.stringify(current));
      if (parsed.contentHash !== currentHash) {
        changed.push({
          id,
          summary: 'Content differs from document',
          parsed,
          current
        });
      } else {
        unchanged.push(current);
      }
    }
  }

  // Check for removed modules
  for (const [id, current] of currentMap) {
    if (!parsedMap.has(id)) {
      removed.push(current);
    }
  }

  return { added, changed, unchanged, removed };
}

// ── Apply Changes ───────────────────────────────────────────────────────────

function applyChanges(diff, currentModules) {
  const modules = [...currentModules];

  // Update changed modules
  for (const change of diff.changed) {
    const idx = modules.findIndex(m => m.id === change.id);
    if (idx >= 0) {
      const current = modules[idx];
      // Bump minor version
      const parts = (current.version || '1.0').split('.');
      parts[1] = String(parseInt(parts[1] || 0) + 1);
      current.version = parts.join('.');
      current.updated_at = new Date().toISOString();
      current.change_log = `Updated via sync pipeline at ${new Date().toISOString()}`;
    }
  }

  // Deactivate removed modules
  for (const removed of diff.removed) {
    const idx = modules.findIndex(m => m.id === removed.id);
    if (idx >= 0) {
      modules[idx].is_active = false;
      modules[idx].change_log = `Deactivated via sync pipeline at ${new Date().toISOString()}`;
    }
  }

  // Save
  fs.writeFileSync(MODULES_JSON_PATH, JSON.stringify(modules, null, 2));
}

function regenerateStaticJSON() {
  const modules = JSON.parse(fs.readFileSync(MODULES_JSON_PATH, 'utf-8'));
  const active = modules.filter(m => m.is_active !== false);
  fs.writeFileSync(STATIC_JSON_PATH, JSON.stringify(active, null, 2));
}

// ── Local Module Loading ────────────────────────────────────────────────────

function loadCurrentModules() {
  if (fs.existsSync(MODULES_JSON_PATH)) {
    return JSON.parse(fs.readFileSync(MODULES_JSON_PATH, 'utf-8'));
  }
  return [];
}

// ── Outdated Plan Flagging ──────────────────────────────────────────────────

async function flagOutdatedPlans(changedModuleIds) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  Supabase credentials not configured. Skipping plan flagging.');
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/generated_plans?is_active=eq.true&is_outdated=eq.false&select=id,philosophy_module_ids`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const plans = await response.json();

    const outdated = plans.filter(p =>
      p.philosophy_module_ids && p.philosophy_module_ids.some(id => changedModuleIds.includes(id))
    );

    if (outdated.length > 0) {
      const ids = outdated.map(p => p.id);
      await fetch(`${SUPABASE_URL}/rest/v1/generated_plans?id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ is_outdated: true })
      });

      console.log(`  Flagged ${outdated.length} active plans as outdated.`);
      console.log(`  Users will see a "Your plan has been updated — regenerate?" prompt.`);
    } else {
      console.log('  No active plans need flagging.');
    }
  } catch (e) {
    console.warn(`  Plan flagging failed: ${e.message}`);
  }
}

// ── CLI Prompt ──────────────────────────────────────────────────────────────

function promptConfirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (y/n) `, answer => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

// ── Entry Point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let docxPath = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--docx-path' && args[i + 1]) {
    docxPath = args[i + 1];
    break;
  }
}

if (!docxPath) {
  // Default path
  docxPath = path.resolve(__dirname, '../Training Philosophy/Most Updated Source of Truth/IronZ_Philosophy_Engine_Spec_v1.0.docx');
}

syncPhilosophy(docxPath).catch(e => {
  console.error('Sync failed:', e);
  process.exit(1);
});
