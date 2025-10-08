// codePatcher.ts - Core Patching Engine with Flexible Format Support

export interface PatchInput {
  search: string;
  replace: string;
}

export interface Match {
  startLine: number;
  endLine: number;
  baseIndent: string;
  confidence: number;
  contextBefore: string[];
  contextAfter: string[];
  similarity: number;
}

export interface PatchResult {
  success: boolean;
  matches: Match[];
  error?: string;
}

export interface PatchOptions {
  fuzzyMatch?: boolean;
  minConfidence?: number;
  contextLines?: number;
}

export class CodePatcher {
  /**
   * Parse input - supports multiple formats:
   * 1. Simple format: OLD:\n...\n\nNEW:\n...
   * 2. Legacy format: <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE
   */
  static parsePatchInput(input: string): PatchInput | null {
    // Try simple OLD/NEW format first
    const simpleFormat = this.parseSimpleFormat(input);
    if (simpleFormat) {
      return simpleFormat;
    }

    // Try legacy SEARCH/REPLACE format
    const legacyFormat = this.parseLegacyFormat(input);
    if (legacyFormat) {
      return legacyFormat;
    }

    return null;
  }

  /**
   * Parse simple format:
   * OLD:
   * [code]
   *
   * NEW:
   * [code]
   */
  private static parseSimpleFormat(input: string): PatchInput | null {
    // Look for OLD: and NEW: markers (case insensitive)
    const oldMatch = input.match(/(?:^|\n)\s*OLD\s*:\s*\n([\s\S]*?)(?=\n\s*NEW\s*:|$)/i);
    const newMatch = input.match(/(?:^|\n)\s*NEW\s*:\s*\n([\s\S]*?)$/i);

    if (oldMatch && newMatch) {
      return {
        search: oldMatch[1].trim(),
        replace: newMatch[1].trim()
      };
    }

    // Also try [OLD] and [NEW] markers
    const bracketOldMatch = input.match(/(?:^|\n)\s*\[OLD\]\s*\n([\s\S]*?)(?=\n\s*\[NEW\]|$)/i);
    const bracketNewMatch = input.match(/(?:^|\n)\s*\[NEW\]\s*\n([\s\S]*?)$/i);

    if (bracketOldMatch && bracketNewMatch) {
      return {
        search: bracketOldMatch[1].trim(),
        replace: bracketNewMatch[1].trim()
      };
    }

    return null;
  }

  /**
   * Parse legacy format:
   * <<<<<<< SEARCH
   * [code]
   * =======
   * [code]
   * >>>>>>> REPLACE
   */
  private static parseLegacyFormat(input: string): PatchInput | null {
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
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
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
      const maxLen = Math.max(lines1.length, lines2.length);
      const minLen = Math.min(lines1.length, lines2.length);
      const lengthPenalty = 1 - ((maxLen - minLen) / maxLen) * 0.5;

      const minLines = Math.min(lines1.length, lines2.length);
      let totalSim = 0;
      for (let i = 0; i < minLines; i++) {
        totalSim += this.similarityRatio(lines1[i], lines2[i]);
      }
      return (totalSim / minLines) * lengthPenalty;
    }

    let totalSim = 0;
    for (let i = 0; i < lines1.length; i++) {
      totalSim += this.similarityRatio(lines1[i], lines2[i]);
    }
    return totalSim / lines1.length;
  }

  /**
   * Detect indentation style and amount from a line
   */
  static detectIndent(line: string): string {
    const match = line.match(/^(\s+)/);
    return match ? match[1] : '';
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

    if (this.linesMatch(normalizedOriginal, normalizedSearch)) {
      return { confidence: 1.0, similarity: 1.0 };
    }

    if (!options.fuzzyMatch) {
      return { confidence: 0.0, similarity: 0.0 };
    }

    const similarity = this.linesSimilarity(normalizedOriginal, normalizedSearch);
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

    for (let i = 0; i <= fileLines.length - searchLines.length; i++) {
      const slice = fileLines.slice(i, i + searchLines.length);
      const { confidence, similarity } = this.calculateConfidence(
        slice,
        searchLines,
        defaultOptions
      );

      if (confidence >= defaultOptions.minConfidence!) {
        const baseIndent = slice[0] ? this.detectIndent(slice[0]) : '';

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

    const indentedReplace = replaceLines.map((line) => {
      if (line.trim() === '') {
        return line;
      }
      return match.baseIndent + line.trim();
    });

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
        error: 'Invalid patch format. Use OLD:\\n...\\n\\nNEW:\\n... or <<<<<<< SEARCH format'
      };
    }

    const matches = this.findMatches(fileContent, parsed.search, options);

    if (matches.length === 0) {
      return {
        success: false,
        matches: [],
        error: 'No matches found for search block (try lowering minConfidence or enabling fuzzy matching)'
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

    if (match.contextBefore.length > 0) {
      preview += '  ' + match.contextBefore.join('\n  ') + '\n';
    }

    const removedLines = fileLines.slice(match.startLine, match.endLine);
    preview += removedLines.map(line => `- ${line}`).join('\n') + '\n';

    const indentedReplace = replaceLines.map(line =>
      line.trim() === '' ? line : match.baseIndent + line.trim()
    );
    preview += indentedReplace.map(line => `+ ${line}`).join('\n') + '\n';

    if (match.contextAfter.length > 0) {
      preview += '  ' + match.contextAfter.join('\n  ') + '\n';
    }

    return preview;
  }
}
