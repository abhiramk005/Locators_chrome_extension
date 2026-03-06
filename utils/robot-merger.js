// utils/robot-merger.js
// Ported from writer.py — merges Robot Framework files, never duplicates

const RobotMerger = {

  // ── Extract variable names e.g. ${BROWSER} ──
  parseVariableNames(content) {
    const names = new Set();
    for (const line of content.split('\n')) {
      const match = line.trim().match(/^(\$\{[^}]+\})/);
      if (match) names.add(match[1]);
    }
    return names;
  },

  // ── Extract keyword names (non-indented, non-header lines) ──
  parseKeywordNames(content) {
    const names = new Set();
    for (const line of content.split('\n')) {
      const stripped = line.trim();
      if (!stripped) continue;
      if (line.startsWith(' ') || line.startsWith('\t')) continue;
      if (stripped.startsWith('*')) continue;
      if (stripped.startsWith('#')) continue;
      if (stripped.startsWith('Library') || stripped.startsWith('Resource')) continue;
      names.add(stripped);
    }
    return names;
  },

  // ── Extract test case names ──
  parseTestNames(content) {
    const names = new Set();
    let inTestSection = false;
    for (const line of content.split('\n')) {
      if (line.includes('*** Test Cases ***')) { inTestSection = true; continue; }
      if (line.startsWith('***')) { inTestSection = false; continue; }
      if (inTestSection && line && !line.startsWith(' ') && !line.startsWith('\t')) {
        names.add(line.trim());
      }
    }
    return names;
  },

  // ── Merge variables.robot ──
  mergeVariables(existing, newContent) {
    if (!existing) return newContent;

    const existingNames = this.parseVariableNames(existing);
    const newLines = [];

    for (const line of newContent.split('\n')) {
      const stripped = line.trim();
      const match = stripped.match(/^(\$\{[^}]+\})/);
      if (match) {
        if (!existingNames.has(match[1])) newLines.push(line);
      } else if (stripped.startsWith('***')) {
        continue; // skip section headers from new content
      }
    }

    if (newLines.length > 0) {
      return existing.trimEnd() + '\n' + newLines.join('\n') + '\n';
    }
    return existing;
  },

  // ── Merge keywords.robot ──
  mergeKeywords(existing, newContent) {
    if (!existing) return newContent;

    const existingNames = this.parseKeywordNames(existing);

    // Extract keyword blocks from new content
    const newBlocks = [];
    let currentBlock = [];
    let inKeywordsSection = false;

    for (const line of newContent.split('\n')) {
      if (line.includes('*** Keywords ***')) { inKeywordsSection = true; continue; }
      if (line.startsWith('***')) { inKeywordsSection = false; continue; }
      if (!inKeywordsSection) continue;

      if (line && !line.startsWith(' ') && !line.startsWith('\t')) {
        if (currentBlock.length > 0) newBlocks.push([...currentBlock]);
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) newBlocks.push(currentBlock);

    const toAdd = newBlocks.filter(block => !existingNames.has(block[0].trim()));

    if (toAdd.length > 0) {
      const additions = toAdd.map(b => b.join('\n')).join('\n\n');
      return existing.trimEnd() + '\n\n' + additions + '\n';
    }
    return existing;
  },

  // ── Merge tests.robot ──
  mergeTests(existing, newContent) {
    if (!existing) return newContent;

    const existingNames = this.parseTestNames(existing);

    const newBlocks = [];
    let currentBlock = [];
    let inTestSection = false;

    for (const line of newContent.split('\n')) {
      if (line.includes('*** Test Cases ***')) { inTestSection = true; continue; }
      if (line.startsWith('***')) { inTestSection = false; continue; }
      if (!inTestSection) continue;

      if (line && !line.startsWith(' ') && !line.startsWith('\t')) {
        if (currentBlock.length > 0) newBlocks.push([...currentBlock]);
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }
    if (currentBlock.length > 0) newBlocks.push(currentBlock);

    const toAdd = newBlocks.filter(block => !existingNames.has(block[0].trim()));

    if (toAdd.length > 0) {
      const additions = toAdd.map(b => b.join('\n')).join('\n\n');
      return existing.trimEnd() + '\n\n' + additions + '\n';
    }
    return existing;
  },

  // ── Main merge dispatcher ──
  merge(filename, existing, newContent) {
    switch (filename) {
      case 'variables.robot': return this.mergeVariables(existing, newContent);
      case 'keywords.robot':  return this.mergeKeywords(existing, newContent);
      case 'tests.robot':     return this.mergeTests(existing, newContent);
      default: return newContent;
    }
  },

  // ── Stats: how many new items were added ──
  countNew(filename, existing, merged) {
    if (!existing) return 'created fresh';
    if (existing === merged) return 'nothing new';
    const existingLines = existing.split('\n').length;
    const mergedLines   = merged.split('\n').length;
    return `+${mergedLines - existingLines} lines added`;
  }
};