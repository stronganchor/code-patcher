// AI Code Patcher - Phase 2: Enhanced Fuzzy Matching

interface PatchInput {
  search: string;
  replace: string;
}

interface Match {
  startLine: number;
  endLine: number;
  baseIndent: string;
  confidence: number;
  contextBefore: string[];
  contextAfter: string[];
  similarity: number; // 0-1, how similar the match is
}

interface PatchResult {
  success: boolean;
  matches: Match[];
  error?: string;
}

interface PatchOptions {
  fuzzyMatch?: boolean;
  minConfidence?: number; // Minimum confidence to consider a match (0-1)
  contextLines?: number; // Number of context lines to show
}

class CodePatcher {
  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate similarity ratio between two strings (0-1)
   */
  static similarityRatio(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  /**
   * Calculate similarity between two arrays of lines
   */
  static linesSimilarity(lines1: string[], lines2: string[]): number {
    if (lines1.length !== lines2.length) {
      // Penalize different lengths heavily
      const maxLen = Math.max(lines1.length, lines2.length);
      const minLen = Math.min(lines1.length, lines2.length);
      const lengthPenalty = 1 - ((maxLen - minLen) / maxLen) * 0.5;

      // Compare only the overlapping lines
      const minLines = Math.min(lines1.length, lines2.length);
      let totalSim = 0;
      for (let i = 0; i < minLines; i++) {
        totalSim += this.similarityRatio(lines1[i], lines2[i]);
      }
      return (totalSim / minLines) * lengthPenalty;
    }

    // Same length - average similarity of each line
    let totalSim = 0;
    for (let i = 0; i < lines1.length; i++) {
      totalSim += this.similarityRatio(lines1[i], lines2[i]);
    }
    return totalSim / lines1.length;
  }

  /**
   * Parse input in SEARCH/REPLACE format
   */
  static parsePatchInput(input: string): PatchInput | null {
    const searchMarker = '<<<<<<< SEARCH';
    const dividerMarker = '=======';
    const replaceMarker = '>>>>>>> REPLACE';

    if (!input.includes(searchMarker) || !input.includes(dividerMarker) || !input.includes(replaceMarker)) {
      return null;
    }

    const searchStart = input.indexOf(searchMarker) + searchMarker.length;
    const dividerPos = input.indexOf(dividerMarker);
    const replaceStart = dividerPos + dividerMarker.length;
    const replaceEnd = input.indexOf(replaceMarker);

    const search = input.substring(searchStart, dividerPos).trim();
    const replace = input.substring(replaceStart, replaceEnd).trim();

    return { search, replace };
  }

  /**
   * Detect indentation style and amount from a line
   */
  static detectIndent(line: string): string {
    const match = line.match(/^(\s+)/);
    return match ? match[1] : '';
  }

  /**
   * Detect the most common indentation in file content
   */
  static detectFileIndentStyle(content: string): { char: string; size: number } {
    const lines = content.split('\n');
    const indents: string[] = [];

    for (const line of lines) {
      const indent = this.detectIndent(line);
      if (indent.length > 0) {
        indents.push(indent);
      }
    }

    const usesTabs = indents.some(indent => indent.includes('\t'));
    const char = usesTabs ? '\t' : ' ';

    if (usesTabs) {
      return { char, size: 1 };
    }

    const sizes = indents.map(indent => indent.length);
    const nonZeroSizes = sizes.filter(s => s > 0);
    if (nonZeroSizes.length === 0) {
      return { char: ' ', size: 2 };
    }

    const minIndent = Math.min(...nonZeroSizes);
    return { char, size: minIndent };
  }

  /**
   * Normalize lines by removing indentation for comparison
   */
  static normalizeLines(lines: string[]): string[] {
    return lines.map(line => line.trim());
  }

  /**
   * Check if two arrays of normalized lines match exactly
   */
  static linesMatch(lines1: string[], lines2: string[]): boolean {
    if (lines1.length !== lines2.length) return false;
    return lines1.every((line, i) => line === lines2[i]);
  }

  /**
   * Calculate confidence score for a match (0-1)
   */
  static calculateConfidence(
    originalLines: string[],
    searchLines: string[],
    options: PatchOptions
  ): { confidence: number; similarity: number } {
    const normalizedOriginal = this.normalizeLines(originalLines);
    const normalizedSearch = this.normalizeLines(searchLines);

    // Exact match = perfect confidence
    if (this.linesMatch(normalizedOriginal, normalizedSearch)) {
      return { confidence: 1.0, similarity: 1.0 };
    }

    // If fuzzy matching is disabled, no match
    if (!options.fuzzyMatch) {
      return { confidence: 0.0, similarity: 0.0 };
    }

    // Calculate similarity
    const similarity = this.linesSimilarity(normalizedOriginal, normalizedSearch);

    // Confidence is similarity adjusted for length differences
    const lengthDiff = Math.abs(originalLines.length - searchLines.length);
    const lengthPenalty = lengthDiff > 0 ? 0.1 * lengthDiff : 0;
    const confidence = Math.max(0, similarity - lengthPenalty);

    return { confidence, similarity };
  }

  /**
   * Find all matches of search block in file content
   */
  static findMatches(
    fileContent: string,
    searchBlock: string,
    options: PatchOptions = {}
  ): Match[] {
    const defaultOptions: PatchOptions = {
      fuzzyMatch: true,
      minConfidence: 0.7,
      contextLines: 2,
      ...options
    };

    const fileLines = fileContent.split('\n');
    const searchLines = searchBlock.split('\n');
    const matches: Match[] = [];

    // Slide through file looking for matches
    for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
      const slice = fileLines.slice(i, i + searchLines.length);
      const { confidence, similarity } = this.calculateConfidence(
        slice,
        searchLines,
        defaultOptions
      );

      // Only include matches above minimum confidence
      if (confidence >= defaultOptions.minConfidence!) {
        const baseIndent = slice[0] ? this.detectIndent(slice[0]) : '';

        // Get context for display
        const contextBefore = fileLines.slice(
          Math.max(0, i - defaultOptions.contextLines!),
          i
        );
        const contextAfter = fileLines.slice(
          i + searchLines.length,
          Math.min(fileLines.length, i + searchLines.length + defaultOptions.contextLines!)
        );

        matches.push({
          startLine: i,
          endLine: i + searchLines.length,
          baseIndent,
          confidence,
          similarity,
          contextBefore,
          contextAfter
        });
      }
    }

    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  /**
   * Apply replacement at a specific match location
   */
  static applyReplacement(
    fileContent: string,
    match: Match,
    replaceBlock: string
  ): string {
    const fileLines = fileContent.split('\n');
    const replaceLines = replaceBlock.split('\n');

    // Re-indent replacement lines to match the original location
    const indentedReplace = replaceLines.map((line) => {
      if (line.trim() === '') {
        return line;
      }
      return match.baseIndent + line.trim();
    });

    // Replace the matched section
    fileLines.splice(
      match.startLine,
      match.endLine - match.startLine,
      ...indentedReplace
    );

    return fileLines.join('\n');
  }

  /**
   * Main entry point: find and apply patch
   */
  static patch(
    fileContent: string,
    patchInput: string,
    options?: PatchOptions
  ): PatchResult {
    const parsed = this.parsePatchInput(patchInput);

    if (!parsed) {
      return {
        success: false,
        matches: [],
        error: 'Invalid patch format. Expected <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE'
      };
    }

    const matches = this.findMatches(fileContent, parsed.search, options);

    if (matches.length === 0) {
      return {
        success: false,
        matches: [],
        error: 'No matches found for search block (try enabling fuzzy matching or lowering minConfidence)'
      };
    }

    return {
      success: true,
      matches
    };
  }

  /**
   * Apply patch to file content using a specific match
   */
  static applyPatch(
    fileContent: string,
    patchInput: string,
    matchIndex: number = 0,
    options?: PatchOptions
  ): string | null {
    const result = this.patch(fileContent, patchInput, options);

    if (!result.success || result.matches.length === 0) {
      return null;
    }

    if (matchIndex >= result.matches.length) {
      return null;
    }

    const parsed = this.parsePatchInput(patchInput)!;
    return this.applyReplacement(fileContent, result.matches[matchIndex], parsed.replace);
  }

  /**
   * Generate a preview showing what will change
   */
  static previewPatch(
    fileContent: string,
    patchInput: string,
    matchIndex: number = 0,
    options?: PatchOptions
  ): string | null {
    const result = this.patch(fileContent, patchInput, options);

    if (!result.success || result.matches.length === 0 || matchIndex >= result.matches.length) {
      return null;
    }

    const match = result.matches[matchIndex];
    const fileLines = fileContent.split('\n');
    const parsed = this.parsePatchInput(patchInput)!;
    const replaceLines = parsed.replace.split('\n');

    let preview = `Match at lines ${match.startLine + 1}-${match.endLine} (confidence: ${(match.confidence * 100).toFixed(1)}%, similarity: ${(match.similarity * 100).toFixed(1)}%)\n\n`;

    // Show context before
    if (match.contextBefore.length > 0) {
      preview += '  ' + match.contextBefore.join('\n  ') + '\n';
    }

    // Show removed lines
    const removedLines = fileLines.slice(match.startLine, match.endLine);
    preview += removedLines.map(line => `- ${line}`).join('\n') + '\n';

    // Show added lines
    const indentedReplace = replaceLines.map(line =>
      line.trim() === '' ? line : match.baseIndent + line.trim()
    );
    preview += indentedReplace.map(line => `+ ${line}`).join('\n') + '\n';

    // Show context after
    if (match.contextAfter.length > 0) {
      preview += '  ' + match.contextAfter.join('\n  ') + '\n';
    }

    return preview;
  }
}

// ============= TEST EXAMPLES =============

console.log('=== PHASE 2: Enhanced Fuzzy Matching Tests ===\n');

// Example 1: Exact match (same as Phase 1)
const testFile1 = `function greet(name) {
  console.log("Hello");
  return name;
}`;

const patch1 = `<<<<<<< SEARCH
function greet(name) {
  console.log("Hello");
  return name;
}
=======
function greet(name) {
  console.log("Hello, " + name + "!");
  return name.toUpperCase();
}
>>>>>>> REPLACE`;

console.log('TEST 1: Exact match (baseline)');
const result1 = CodePatcher.patch(testFile1, patch1);
console.log(`✓ Found ${result1.matches.length} match(es)`);
if (result1.matches.length > 0) {
  console.log(`  Confidence: ${(result1.matches[0].confidence * 100).toFixed(1)}%`);
  console.log(`  Similarity: ${(result1.matches[0].similarity * 100).toFixed(1)}%`);
}

// Example 2: Fuzzy match with minor typo
const testFile2 = `function greet(name) {
  console.log("Hello World");
  return name;
}`;

const patch2 = `<<<<<<< SEARCH
function greet(name) {
  console.log("Hello");
  return name;
}
=======
function greet(name) {
  console.log("Hello, " + name + "!");
  return name.toUpperCase();
}
>>>>>>> REPLACE`;

console.log('\nTEST 2: Fuzzy match with minor difference');
const result2 = CodePatcher.patch(testFile2, patch2, { fuzzyMatch: true, minConfidence: 0.7 });
console.log(`✓ Found ${result2.matches.length} match(es) with fuzzy matching`);
if (result2.matches.length > 0) {
  console.log(`  Confidence: ${(result2.matches[0].confidence * 100).toFixed(1)}%`);
  console.log(`  Similarity: ${(result2.matches[0].similarity * 100).toFixed(1)}%`);
}

// Example 3: Preview functionality
console.log('\nTEST 3: Preview before applying');
const preview = CodePatcher.previewPatch(testFile2, patch2, 0, { fuzzyMatch: true });
if (preview) {
  console.log(preview);
}

// Example 4: Multiple matches with different confidence scores
const testFile3 = `function process(data) {
  console.log(data);
}

function handle(data) {
  console.log(data);
}

function manage(info) {
  console.log(data);
}`;

const patch3 = `<<<<<<< SEARCH
console.log(data);
=======
console.log("Debug:", data);
>>>>>>> REPLACE`;

console.log('TEST 4: Multiple matches ranked by confidence');
const result3 = CodePatcher.patch(testFile3, patch3, { fuzzyMatch: true });
console.log(`✓ Found ${result3.matches.length} match(es)`);
result3.matches.forEach((match, idx) => {
  console.log(`  Match ${idx + 1}: Line ${match.startLine + 1}, Confidence: ${(match.confidence * 100).toFixed(1)}%, Similarity: ${(match.similarity * 100).toFixed(1)}%`);
});

// Example 5: Fuzzy disabled - should not find mismatches
console.log('\nTEST 5: Fuzzy matching disabled');
const result5 = CodePatcher.patch(testFile2, patch2, { fuzzyMatch: false });
console.log(`✓ Found ${result5.matches.length} match(es) (expected 0)`);
console.log(`  Success: ${result5.success}, Error: ${result5.error || 'none'}`);

// Example 6: Adjusting confidence threshold
console.log('\nTEST 6: Adjusting confidence threshold');
const result6a = CodePatcher.patch(testFile2, patch2, { fuzzyMatch: true, minConfidence: 0.9 });
console.log(`  With 90% threshold: ${result6a.matches.length} match(es)`);
const result6b = CodePatcher.patch(testFile2, patch2, { fuzzyMatch: true, minConfidence: 0.6 });
console.log(`  With 60% threshold: ${result6b.matches.length} match(es)`);

console.log('\n=== All Phase 2 tests complete! ===');

export { CodePatcher, PatchInput, Match, PatchResult, PatchOptions };
