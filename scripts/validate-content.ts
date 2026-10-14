// Validates a content repository checkout: npm run content:validate -- <dir>
// Exits 1 when there are errors; warnings alone exit 0.
import { loadContent } from '../src/lib/content/index';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run content:validate -- <content-directory>');
  process.exit(2);
}

const { model, issues } = await loadContent(dir);
for (const issue of issues) {
  const location = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
  console.log(`${issue.severity.toUpperCase().padEnd(7)} ${location}  [${issue.code}] ${issue.message}`);
}

const errors = issues.filter((issue) => issue.severity === 'error').length;
const warnings = issues.length - errors;
if (model) {
  const parts = model.lectures.reduce((sum, lecture) => sum + lecture.parts.length, 0);
  console.log(
    `\nOK: "${model.title}" — ${model.lectures.length} lectures, ${parts} parts, ${model.exercises.size} exercises, ${warnings} warnings.`,
  );
} else {
  console.log(`\nFAILED: ${errors} errors, ${warnings} warnings. This revision cannot be published.`);
  process.exit(1);
}
