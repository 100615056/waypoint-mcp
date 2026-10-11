// Decides whether a .waypoint/ artifact has actually been thought through,
// rather than just scaffolded. Templates mark every spot Claude must fill
// with a <!-- fill: ... --> comment; filling a section means replacing it.

const FILL_COMMENT = /<!--\s*fill:[\s\S]*?-->/;
const LATER_MARKER = '<!-- waypoint:later -->';
const EMPTY_BULLET = /^\s*-\s*(\[[ x]\]\s*)?$/;
const MIN_SECTION_CHARS = 20;

export function checkCompleteness(content) {
  const issues = [];
  const [preamble, ...rest] = content.split(/^(?=## )/m);
  const sections = preamble.startsWith('## ') ? [preamble, ...rest] : rest;

  // Text above the first section (e.g. the goal statement itself) is checked too.
  if (!preamble.startsWith('## ') && FILL_COMMENT.test(preamble)) {
    const title = preamble.match(/^#\s+(.+)/m)?.[1]?.trim() ?? 'Introduction';
    issues.push(`"${title}" still has its fill-in instructions`);
  }

  for (const section of sections) {
    const [headingLine, ...rest] = section.split('\n');
    const heading = headingLine.replace(/^##\s+/, '').trim();
    const body = rest.join('\n');

    // Sections filled in during or after the build (e.g. "Changes made") are not gated.
    if (body.includes(LATER_MARKER)) continue;

    if (FILL_COMMENT.test(body)) {
      issues.push(`"${heading}" still has its fill-in instructions`);
      continue;
    }

    const substance = body
      .replace(/<!--[\s\S]*?-->/g, '')
      .split('\n')
      .filter((line) => line.trim() && !EMPTY_BULLET.test(line))
      .join('\n')
      .trim();

    if (substance.length < MIN_SECTION_CHARS) {
      issues.push(`"${heading}" is empty`);
    }
  }

  return issues;
}
