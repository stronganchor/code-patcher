// codePatcher.ts - Context-Based Code Matching Engine

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
   * Higher confidence = better match
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

    // If fuzzy matching is disabled, no partial matches
    if (!options.fuzzyMatch) {
      return { confidence: 0.0, similarity: 0.0 };
    }

    // Calculate line-by-line similarity
    const similarity = this.linesSimilarity(normalizedOriginal, normalizedSearch);

    // Penalize length differences
    const lengthDiff = Math.abs(originalLines.length - searchLines.length);
    const lengthPenalty = lengthDiff > 0 ? 0.1 * lengthDiff : 0;
    const confidence = Math.max(0, similarity - lengthPenalty);

    return { confidence, similarity };
  }

  /**
   * Find all potential matches for a code block in the file
   */
  static findMatches(
    fileContent: string,
    codeBlock: string,
    options: PatchOptions = {}
  ): Match[] {
    const defaultOptions: PatchOptions = {
      fuzzyMatch: true,
      minConfidence: 0.6, // Lower threshold since we're doing context-based matching
      contextLines: 2,
      ...options
    };

    const fileLines = fileContent.split('\n');
    const blockLines = codeBlock.trim().split('\n');

    if (blockLines.length === 0) {
      return [];
    }

    const matches: Match[] = [];

    // Try to find matches for the exact block length first
    for (let i = 0; i <= fileLines.length - blockLines.length; i++) {
      const slice = fileLines.slice(i, i + blockLines.length);
      const { confidence, similarity } = this.calculateConfidence(
        slice,
        blockLines,
        defaultOptions
      );

      if (confidence >= defaultOptions.minConfidence!) {
        const baseIndent = slice[0] ? this.detectIndent(slice[0]) : '';

        const contextBefore = fileLines.slice(
          Math.max(0, i - defaultOptions.contextLines!),
          i
        );
        const contextAfter = fileLines.slice(
          i + blockLines.length,
          Math.min(fileLines.length, i + blockLines.length + defaultOptions.contextLines!)
        );

        matches.push({
          startLine: i,
          endLine: i + blockLines.length,
          baseIndent,
          confidence,
          similarity,
          contextBefore,
          contextAfter
        });
      }
    }

    // Also try with +/- 1 line to handle minor length differences
    for (let lengthAdjust = -1; lengthAdjust <= 1; lengthAdjust++) {
      if (lengthAdjust === 0) continue; // Already checked exact length

      const adjustedLength = blockLines.length + lengthAdjust;
      if (adjustedLength <= 0) continue;

      for (let i = 0; i <= fileLines.length - adjustedLength; i++) {
        const slice = fileLines.slice(i, i + adjustedLength);
        const { confidence, similarity } = this.calculateConfidence(
          slice,
          blockLines,
          defaultOptions
        );

        // Use slightly higher threshold for length-adjusted matches
        if (confidence >= defaultOptions.minConfidence! + 0.05) {
          const baseIndent = slice[0] ? this.detectIndent(slice[0]) : '';

          const contextBefore = fileLines.slice(
            Math.max(0, i - defaultOptions.contextLines!),
            i
          );
          const contextAfter = fileLines.slice(
            i + adjustedLength,
            Math.min(fileLines.length, i + adjustedLength + defaultOptions.contextLines!)
          );

          matches.push({
            startLine: i,
            endLine: i + adjustedLength,
            baseIndent,
            confidence,
            similarity,
            contextBefore,
            contextAfter
          });
        }
      }
    }

    // Remove duplicate matches (same line numbers)
    const uniqueMatches = matches.filter((match, index, self) =>
      index === self.findIndex((m) => m.startLine === match.startLine && m.endLine === match.endLine)
    );

    // Sort by confidence (highest first)
    uniqueMatches.sort((a, b) => b.confidence - a.confidence);

    return uniqueMatches;
  }

  /**
   * Apply replacement at a specific match location
   */
  static applyReplacement(
    fileContent: string,
    match: Match,
    codeBlock: string
  ): string {
    const fileLines = fileContent.split('\n');
    const blockLines = codeBlock.trim().split('\n');

    // Re-indent the code block to match the original location
    const indentedBlock = blockLines.map((line) => {
      if (line.trim() === '') {
        return line;
      }
      return match.baseIndent + line.trim();
    });

    // Replace the matched section
    fileLines.splice(
      match.startLine,
      match.endLine - match.startLine,
      ...indentedBlock
    );

    return fileLines.join('\n');
  }

  /**
   * Main entry point: find matches for a code block
   */
  static patch(
    fileContent: string,
    codeBlock: string,
    options?: PatchOptions
  ): PatchResult {
    const trimmedBlock = codeBlock.trim();

    if (!trimmedBlock) {
      return {
        success: false,
        matches: [],
        error: 'Empty code block provided'
      };
    }

    const matches = this.findMatches(fileContent, trimmedBlock, options);

    if (matches.length === 0) {
      return {
        success: false,
        matches: [],
        error: 'No matches found. Try including more context lines or lowering minConfidence setting.'
      };
    }

    return {
      success: true,
      matches
    };
  }

  /**
   * Apply code block to file content using a specific match
   */
  static applyPatch(
    fileContent: string,
    codeBlock: string,
    matchIndex: number = 0,
    options?: PatchOptions
  ): string | null {
    const result = this.patch(fileContent, codeBlock, options);

    if (!result.success || result.matches.length === 0) {
      return null;
    }

    if (matchIndex >= result.matches.length) {
      return null;
    }

    return this.applyReplacement(fileContent, result.matches[matchIndex], codeBlock);
  }

  /**
   * Generate a preview showing what will change
   */
  static previewPatch(
    fileContent: string,
    codeBlock: string,
    matchIndex: number = 0,
    options?: PatchOptions
  ): string | null {
    const result = this.patch(fileContent, codeBlock, options);

    if (!result.success || result.matches.length === 0 || matchIndex >= result.matches.length) {
      return null;
    }

    const match = result.matches[matchIndex];
    const fileLines = fileContent.split('\n');
    const blockLines = codeBlock.trim().split('\n');

    let preview = `Match at lines ${match.startLine + 1}-${match.endLine} (confidence: ${(match.confidence * 100).toFixed(1)}%, similarity: ${(match.similarity * 100).toFixed(1)}%)\n\n`;

    // Show context before
    if (match.contextBefore.length > 0) {
      preview += '  ' + match.contextBefore.join('\n  ') + '\n';
    }

    // Show what will be removed
    const removedLines = fileLines.slice(match.startLine, match.endLine);
    preview += removedLines.map(line => `- ${line}`).join('\n') + '\n';

    // Show what will be added
    const indentedBlock = blockLines.map(line =>
      line.trim() === '' ? line : match.baseIndent + line.trim()
    );
    preview += indentedBlock.map(line => `+ ${line}`).join('\n') + '\n';

    // Show context after
    if (match.contextAfter.length > 0) {
      preview += '  ' + match.contextAfter.join('\n  ') + '\n';
    }

    return preview;
  }
}
