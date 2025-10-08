// codePatcher.ts - Smart Context-Based Matching

export interface Match {
  startLine: number;
  endLine: number;
  baseIndent: string;
  confidence: number;
  contextBefore: string[];
  contextAfter: string[];
  similarity: number;
  contextMatchLength: number; // How many context lines matched
}

export interface PatchResult {
  success: boolean;
  matches: Match[];
  error?: string;
  debug?: string;
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
   * Detect indentation style and amount from a line
   */
  static detectIndent(line: string): string {
    const match = line.match(/^(\s+)/);
    return match ? match[1] : '';
  }

  /**
   * Normalize a line for comparison
   */
  static normalizeLine(line: string): string {
    return line.trim();
  }

  /**
   * Check if two lines match (normalized)
   */
  static linesMatch(line1: string, line2: string, fuzzy: boolean = true): boolean {
    const norm1 = this.normalizeLine(line1);
    const norm2 = this.normalizeLine(line2);

    if (norm1 === norm2) return true;

    if (fuzzy) {
      const similarity = this.similarityRatio(norm1, norm2);
      return similarity >= 0.9;
    }

    return false;
  }

  /**
   * Find the longest common prefix between code block and a file location
   */
  static findCommonPrefix(blockLines: string[], fileLines: string[], startIndex: number, fuzzy: boolean): number {
    let matchCount = 0;
    const maxCheck = Math.min(blockLines.length, fileLines.length - startIndex);

    for (let i = 0; i < maxCheck; i++) {
      if (this.linesMatch(blockLines[i], fileLines[startIndex + i], fuzzy)) {
        matchCount++;
      } else {
        break;
      }
    }

    return matchCount;
  }

  /**
   * Find the longest common suffix between code block and a file location
   */
  static findCommonSuffix(blockLines: string[], fileLines: string[], endIndex: number, fuzzy: boolean): number {
    let matchCount = 0;
    const blockEnd = blockLines.length - 1;
    const fileEnd = endIndex;

    for (let i = 0; i <= Math.min(blockEnd, fileEnd); i++) {
      if (this.linesMatch(blockLines[blockEnd - i], fileLines[fileEnd - i], fuzzy)) {
        matchCount++;
      } else {
        break;
      }
    }

    return matchCount;
  }

  /**
   * Normalize line endings (handle Windows \r\n, Unix \n, Mac \r)
   */
  static normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Find best match by looking for longest context match
   */
  static findMatches(
    fileContent: string,
    codeBlock: string,
    options: PatchOptions = {}
  ): Match[] {
    const defaultOptions: PatchOptions = {
      fuzzyMatch: true,
      minConfidence: 0.5,
      contextLines: 2,
      ...options
    };

    // Normalize line endings for both file and code block
    const normalizedFile = this.normalizeLineEndings(fileContent);
    const normalizedBlock = this.normalizeLineEndings(codeBlock.trim());

    const fileLines = normalizedFile.split('\n');
    const blockLines = normalizedBlock.split('\n');

    if (blockLines.length === 0) {
      return [];
    }

    const matches: Match[] = [];
    const debugInfo: string[] = [];

    debugInfo.push(`Searching for ${blockLines.length} lines in ${fileLines.length} line file`);
    debugInfo.push(`First block line: "${blockLines[0].substring(0, 50)}"`);
    debugInfo.push(`Last block line: "${blockLines[blockLines.length - 1].substring(0, 50)}"`);

    // Try different window sizes (from exact match to much smaller)
    for (let windowSize = blockLines.length; windowSize >= Math.max(3, Math.floor(blockLines.length / 2)); windowSize--) {
      for (let fileStart = 0; fileStart <= fileLines.length - windowSize; fileStart++) {
        // Check prefix match
        const prefixMatch = this.findCommonPrefix(blockLines, fileLines, fileStart, defaultOptions.fuzzyMatch!);

        // Check suffix match
        const fileEnd = fileStart + windowSize - 1;
        const suffixMatch = this.findCommonSuffix(blockLines, fileLines, fileEnd, defaultOptions.fuzzyMatch!);

        // Total context lines that match
        const contextMatchLength = prefixMatch + suffixMatch;

        // Must have at least 2 matching context lines (1 before + 1 after, or 2 before, or 2 after)
        if (contextMatchLength >= 2 && (prefixMatch >= 1 || suffixMatch >= 1)) {
          // Calculate confidence based on context match quality
          const contextRatio = Math.min(1.0, contextMatchLength / blockLines.length);
          const sizeRatio = windowSize / blockLines.length;
          const confidence = Math.min(1.0, (contextRatio * 0.7) + (sizeRatio * 0.3));

          if (confidence >= defaultOptions.minConfidence!) {
            const baseIndent = fileLines[fileStart] ? this.detectIndent(fileLines[fileStart]) : '';

            const contextBefore = fileLines.slice(
              Math.max(0, fileStart - defaultOptions.contextLines!),
              fileStart
            );
            const contextAfter = fileLines.slice(
              fileStart + windowSize,
              Math.min(fileLines.length, fileStart + windowSize + defaultOptions.contextLines!)
            );

            matches.push({
              startLine: fileStart,
              endLine: fileStart + windowSize,
              baseIndent,
              confidence,
              similarity: confidence,
              contextBefore,
              contextAfter,
              contextMatchLength
            });
          }
        }
      }

      // If we found good matches at this window size, don't try smaller sizes
      if (matches.length > 0 && matches[0].confidence > 0.7) {
        break;
      }
    }

    // Remove duplicates and sort by confidence
    const uniqueMatches = matches.filter((match, index, self) =>
      index === self.findIndex((m) => m.startLine === match.startLine && m.endLine === match.endLine)
    );

    uniqueMatches.sort((a, b) => {
      // Prioritize confidence first
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence;
      }
      // Then prioritize more context matches
      return b.contextMatchLength - a.contextMatchLength;
    });

    debugInfo.push(`Found ${uniqueMatches.length} potential matches`);

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
    const normalizedFile = this.normalizeLineEndings(fileContent);
    const normalizedBlock = this.normalizeLineEndings(codeBlock.trim());

    const fileLines = normalizedFile.split('\n');
    const blockLines = normalizedBlock.split('\n');

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
      const normalizedBlock = this.normalizeLineEndings(trimmedBlock);
      const blockLines = normalizedBlock.split('\n');
      const debugMsg = `Searched for ${blockLines.length} lines. First: "${blockLines[0].substring(0, 40)}", Last: "${blockLines[blockLines.length - 1].substring(0, 40)}"`;

      return {
        success: false,
        matches: [],
        error: 'No matches found. Try including more unique context lines.',
        debug: debugMsg
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
    const normalizedFile = this.normalizeLineEndings(fileContent);
    const normalizedBlock = this.normalizeLineEndings(codeBlock.trim());

    const fileLines = normalizedFile.split('\n');
    const blockLines = normalizedBlock.split('\n');

    let preview = `Match at lines ${match.startLine + 1}-${match.endLine} (confidence: ${(match.confidence * 100).toFixed(1)}%, ${match.contextMatchLength} context lines matched)\n\n`;

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