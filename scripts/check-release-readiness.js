'use strict';
const fs = require('node:fs');
const path = require('node:path');
const report = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/staging/release-readiness.json'), 'utf8'));
const reasons = [...report.blockers];
if (!report.releaseApproved) reasons.push('Release approval is not recorded');
if (report.apiChecks.failed !== 0 || report.apiChecks.passed < 31) reasons.push('Staging API checks are incomplete or failing');
if (report.browserQa !== 'passed') reasons.push('Browser QA has not passed');
if (reasons.length) {
  console.error('Production release is held:\n' + reasons.map(reason => '- ' + reason).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Recorded staging and review gates are clear. Chase retains the merge decision.');
}
