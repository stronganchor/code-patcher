// AI Code Patcher - Phase 1: Core Engine

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
}

interface PatchResult {
  success: boolean;
  matches: Match[];
  error?: string;
}

class CodePatcher {
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

    // Detect if tabs or spaces
    const usesTabs = indents.some(indent => indent.includes('\t'));
    const char = usesTabs ? '\t' : ' ';

    // Find most common indent size
    if (usesTabs) {
      return { char, size: 1 };
    }

    const sizes = indents.map(indent => indent.length);
    const nonZeroSizes = sizes.filter(s => s > 0);
    if (nonZeroSizes.length === 0) {
      return { char: ' ', size: 2 }; // default
    }

    // Find GCD-like common indent
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
   * Check if two arrays of normalized lines match
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
    normalizedSearch: string[]
  ): number {
    // For now, exact match = 1.0
    // In Phase 2, we'll add fuzzy matching
    return this.linesMatch(
      this.normalizeLines(originalLines),
      normalizedSearch
    ) ? 1.0 : 0.0;
  }

  /**
   * Find all matches of search block in file content
   */
  static findMatches(fileContent: string, searchBlock: string): Match[] {
    const fileLines = fileContent.split('\n');
    const searchLines = searchBlock.split('\n');
    const normalizedSearch = this.normalizeLines(searchLines);
    const matches: Match[] = [];

    // Slide through file looking for matches
    for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
      const slice = fileLines.slice(i, i + searchLines.length);
      const normalizedSlice = this.normalizeLines(slice);

      if (this.linesMatch(normalizedSlice, normalizedSearch)) {
        const baseIndent = slice[0] ? this.detectIndent(slice[0]) : '';
        const confidence = this.calculateConfidence(slice, normalizedSearch);

        // Get context for display
        const contextBefore = fileLines.slice(Math.max(0, i - 2), i);
        const contextAfter = fileLines.slice(
          i + searchLines.length,
          Math.min(fileLines.length, i + searchLines.length + 2)
        );

        matches.push({
          startLine: i,
          endLine: i + searchLines.length,
          baseIndent,
          confidence,
          contextBefore,
          contextAfter
        });
      }
    }

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
    const indentedReplace = replaceLines.map((line, idx) => {
      // If line is already just whitespace, keep it
      if (line.trim() === '') {
        return line;
      }
      // Apply base indentation to each line
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
  static patch(fileContent: string, patchInput: string): PatchResult {
    const parsed = this.parsePatchInput(patchInput);

    if (!parsed) {
      return {
        success: false,
        matches: [],
        error: 'Invalid patch format. Expected <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE'
      };
    }

    const matches = this.findMatches(fileContent, parsed.search);

    if (matches.length === 0) {
      return {
        success: false,
        matches: [],
        error: 'No matches found for search block'
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
    matchIndex: number = 0
  ): string | null {
    const result = this.patch(fileContent, patchInput);

    if (!result.success || result.matches.length === 0) {
      return null;
    }

    if (matchIndex >= result.matches.length) {
      return null;
    }

    const parsed = this.parsePatchInput(patchInput)!;
    return this.applyReplacement(fileContent, result.matches[matchIndex], parsed.replace);
  }
}

// ============= TEST EXAMPLES =============

// Example 1: Simple function replacement
const testFile1 = `function greet(name) {
  console.log("Hello");
  return name;
}

function goodbye() {
  console.log("Bye");
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

console.log('=== TEST 1: Simple function replacement ===');
const result1 = CodePatcher.patch(testFile1, patch1);
console.log('Matches found:', result1.matches.length);
if (result1.success && result1.matches.length > 0) {
  const patched1 = CodePatcher.applyPatch(testFile1, patch1);
  console.log('Patched result:\n', patched1);
}

// Example 2: Indentation handling
const testFile2 = `class MyClass {
  constructor() {
    this.value = 0;
  }

  getValue() {
    return this.value;
  }
}`;

const patch2 = `<<<<<<< SEARCH
getValue() {
return this.value;
}
=======
getValue() {
// Added comment
return this.value * 2;
}
>>>>>>> REPLACE`;

console.log('\n=== TEST 2: Indentation handling ===');
const result2 = CodePatcher.patch(testFile2, patch2);
console.log('Matches found:', result2.matches.length);
if (result2.success && result2.matches.length > 0) {
  console.log('Base indent detected:', JSON.stringify(result2.matches[0].baseIndent));
  const patched2 = CodePatcher.applyPatch(testFile2, patch2);
  console.log('Patched result:\n', patched2);
}

// Example 3: Multiple matches
const testFile3 = `function process(data) {
  console.log(data);
}

function handle(data) {
  console.log(data);
}`;

const patch3 = `<<<<<<< SEARCH
console.log(data);
=======
console.log("Processing:", data);
>>>>>>> REPLACE`;

console.log('\n=== TEST 3: Multiple matches ===');
const result3 = CodePatcher.patch(testFile3, patch3);
console.log('Matches found:', result3.matches.length);
result3.matches.forEach((match, idx) => {
  console.log(`Match ${idx + 1}: Line ${match.startLine + 1}, Confidence: ${match.confidence}`);
});

// Example 4: No match found
const patch4 = `<<<<<<< SEARCH
function nonexistent() {
  return false;
}
=======
function nonexistent() {
  return true;
}
>>>>>>> REPLACE`;

console.log('\n=== TEST 4: No match scenario ===');
const result4 = CodePatcher.patch(testFile1, patch4);
console.log('Success:', result4.success);
console.log('Error:', result4.error);

export { CodePatcher, PatchInput, Match, PatchResult };
