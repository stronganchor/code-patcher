// extension.ts - Workspace-wide Code Block Matching & Patching
import * as vscode from 'vscode';
import * as path from 'path';
import { CodePatcher, PatchOptions, Match } from './codePatcher';

type WorkspaceCandidate = {
    uri: vscode.Uri;
    fileContent: string;
    match: Match;
    matchIndex: number;
    preview?: string | null;
};

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Patcher extension is now active');

    const applyPatchCommand = vscode.commands.registerCommand(
        'aiCodePatcher.applyPatch',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const codeBlock = await vscode.window.showInputBox({
                prompt: 'Paste code block with context lines (use the clipboard/selection commands for multi-line)',
                ignoreFocusOut: true
            });

            if (!codeBlock) return;

            // Use the *current* file only
            await applyPatchToEditor(editor, codeBlock);
        }
    );

    const applyPatchFromClipboardCommand = vscode.commands.registerCommand(
        'aiCodePatcher.applyPatchFromClipboard',
        async () => {
            const codeBlock = (await vscode.env.clipboard.readText())?.trim();
            if (!codeBlock) {
                vscode.window.showErrorMessage('Clipboard is empty');
                return;
            }

            // New behavior: search the whole workspace (no need to open the target file)
            await applyPatchAcrossWorkspace(codeBlock, { source: 'clipboard' });
        }
    );

    const applyPatchFromSelectionCommand = vscode.commands.registerCommand(
        'aiCodePatcher.applyPatchFromSelection',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection)?.trim();

            if (!selectedText) {
                vscode.window.showInformationMessage(
                    'No text selected. Select the code block you want to apply (include 1–3 unchanged context lines before/after), then run this command again.'
                );
                return;
            }

            // New behavior: use selection as the *patch*, then search the whole workspace
            await applyPatchAcrossWorkspace(selectedText, { source: 'selection' });
        }
    );

    context.subscriptions.push(
        applyPatchCommand,
        applyPatchFromClipboardCommand,
        applyPatchFromSelectionCommand
    );
}

function getOptions(): PatchOptions {
    const config = vscode.workspace.getConfiguration('aiCodePatcher');
    return {
        fuzzyMatch: config.get('fuzzyMatch', true),
        minConfidence: config.get('minConfidence', 0.6),
        contextLines: config.get('contextLines', 2)
    };
}

function getWorkspaceSearchConfig() {
    const config = vscode.workspace.getConfiguration('aiCodePatcher');

    // Allow both string and string[] for include/exclude globs
    const defaultInclude = '**/*.{ts,tsx,js,jsx,mjs,cjs,php,py,rb,go,java,cs,cpp,c,h,html,css,scss,json,md,xml,yaml,yml,ini,sh,bat,ps1}';
    const defaultExclude = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/.cache/**,**/.next/**,**/.parcel-cache/**,**/.turbo/**,**/vendor/**,**/languages/**,**/data/**,**/media/**}';

    const includeGlobs = config.get<string | string[]>('includeGlobs', defaultInclude);
    const excludeGlobs = config.get<string | string[]>('excludeGlobs', defaultExclude);
    const maxFiles = config.get<number>('maxFiles', 2000);
    const autoApplySingleMatch = config.get<boolean>('autoApplySingleMatch', false);
    const tieBreakDelta = config.get<number>('tieBreakDelta', 0.03); // 3% confidence difference considered a "tie"

    const include = Array.isArray(includeGlobs) ? `{${includeGlobs.join(',')}}` : includeGlobs;
    const exclude = Array.isArray(excludeGlobs) ? `{${excludeGlobs.join(',')}}` : excludeGlobs;

    return { include, exclude, maxFiles, autoApplySingleMatch, tieBreakDelta };
}

async function applyPatchAcrossWorkspace(codeBlock: string, ctx: { source: 'selection' | 'clipboard' }) {
    if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }

    const options = getOptions();
    const { include, exclude, maxFiles, autoApplySingleMatch, tieBreakDelta } = getWorkspaceSearchConfig();

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'AI Code Patcher: Scanning workspace for best match…',
            cancellable: true
        },
        async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log('Scan cancelled by user.');
            });

            const uris = await vscode.workspace.findFiles(include, exclude, maxFiles);
            if (uris.length === 0) {
                vscode.window.showWarningMessage('No files matched your search globs. Check aiCodePatcher.includeGlobs/excludeGlobs settings.');
                return;
            }

            let checked = 0;
            const candidates: WorkspaceCandidate[] = [];

            for (const uri of uris) {
                if (token.isCancellationRequested) break;

                // Update progress every ~50 files
                if (checked % 50 === 0) {
                    progress.report({ message: `Searching… (${checked}/${uris.length})` });
                    await new Promise(r => setTimeout(r, 0));
                }

                // Skip very large files quickly (best-effort)
                try {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    const text = doc.getText();
                    if (!text || text.length > 2_000_000) { // ~2MB guard
                        checked++;
                        continue;
                    }

                    const result = CodePatcher.patch(text, codeBlock, options);
                    if (result.success && result.matches.length) {
                        // take the best match in this file (index 0 after sort done in CodePatcher)
                        const matchIndex = 0;
                        const match = result.matches[matchIndex];
                        // precompute preview so we can show it later without reopening the doc
                        const preview = CodePatcher.previewPatch(text, codeBlock, matchIndex, options);

                        candidates.push({ uri, fileContent: text, match, matchIndex, preview });
                    }
                } catch {
                    // Ignore unreadable/unsupported files
                }

                checked++;
            }

            if (token.isCancellationRequested) return;

            if (candidates.length === 0) {
                vscode.window.showWarningMessage('No matches found in the workspace. Try adding more unique context lines or lowering minConfidence.');
                return;
            }

            // Sort by confidence (desc), then by context matched (desc)
            candidates.sort((a, b) => {
                const diff = b.match.confidence - a.match.confidence;
                if (Math.abs(diff) > 1e-6) return diff;
                return (b.match.contextMatchLength ?? 0) - (a.match.contextMatchLength ?? 0);
            });

            const top = candidates[0];
            const second = candidates[1];
            const haveCloseTie = !!second && (top.match.confidence - second.match.confidence) < tieBreakDelta;

            // If there's exactly one candidate, or a clear winner, maybe auto-apply
            if (!haveCloseTie && (candidates.length === 1 && autoApplySingleMatch)) {
                await openAndApply(top, codeBlock, options);
                vscode.window.showInformationMessage(
                    `✓ Patch applied to ${relPath(top.uri)} at line ${top.match.startLine + 1} (${(top.match.confidence * 100).toFixed(0)}% confidence)`
                );
                return;
            }

            // Otherwise let the user choose
            const pickItems = candidates.slice(0, 30).map((c) => {
                const confidence = (c.match.confidence * 100).toFixed(0);
                const context = c.match.contextMatchLength ?? 0;
                const line = c.match.startLine + 1;

                return {
                    label: relPath(c.uri),
                    description: `Line ${line} — ${confidence}% confidence, ${context} context lines`,
                    detail: firstLineOfFile(c.fileContent, c.match.startLine),
                    candidate: c
                } as vscode.QuickPickItem & { candidate: WorkspaceCandidate };
            });

            const selected = await vscode.window.showQuickPick(pickItems, {
                placeHolder: `Found ${candidates.length} match${candidates.length > 1 ? 'es' : ''}. Choose where to apply:`,
                matchOnDescription: true,
                matchOnDetail: true
            });
            if (!selected) return;

            // Show a modal preview before applying
            const chosen = (selected as any).candidate as WorkspaceCandidate;
            const preview = chosen.preview ?? CodePatcher.previewPatch(chosen.fileContent, codeBlock, chosen.matchIndex, options);

            const confirm = await vscode.window.showInformationMessage(
                `Preview of changes for ${relPath(chosen.uri)} (line ${chosen.match.startLine + 1})`,
                { modal: true, detail: preview || 'Preview not available' },
                'Apply',
                'Cancel'
            );

            if (confirm === 'Apply') {
                await openAndApply(chosen, codeBlock, options);
                vscode.window.showInformationMessage('✓ Patch applied successfully');
            }
        }
    );
}

async function openAndApply(candidate: WorkspaceCandidate, codeBlock: string, options: PatchOptions) {
    const doc = await vscode.workspace.openTextDocument(candidate.uri);
    const editor = await vscode.window.showTextDocument(doc);
    await applyPatchAtMatch(editor, codeBlock, candidate.matchIndex, options, candidate.match);
}

function relPath(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, false);
}

function firstLineOfFile(text: string, startLine: number): string {
    const lines = text.split(/\r\n|\r|\n/);
    return (lines[startLine] ?? '').trim().slice(0, 120);
}

async function applyPatchToEditor(editor: vscode.TextEditor, codeBlock: string) {
    const document = editor.document;
    const fileContent = document.getText();

    const config = vscode.workspace.getConfiguration('aiCodePatcher');
    const options: PatchOptions = {
        fuzzyMatch: config.get('fuzzyMatch', true),
        minConfidence: config.get('minConfidence', 0.6),
        contextLines: config.get('contextLines', 2)
    };

    const result = CodePatcher.patch(fileContent, codeBlock, options);

    if (!result.success) {
        const debugInfo = result.debug ? `\n\nDebug: ${result.debug}` : '';
        vscode.window.showErrorMessage(`Patch failed: ${result.error}${debugInfo}`);
        return;
    }

    const matches = result.matches;

    if (matches.length === 0) {
        vscode.window.showWarningMessage('No matches found for the code block');
        return;
    }

    if (matches.length === 1) {
        const autoApply = config.get('autoApplySingleMatch', false);

        if (autoApply) {
            await applyPatchAtMatch(editor, codeBlock, 0, options, matches[0]);
            const contextMatches = matches[0].contextMatchLength || 0;
            vscode.window.showInformationMessage(
                `✓ Patch applied at line ${matches[0].startLine + 1} (${(matches[0].confidence * 100).toFixed(0)}% confidence, ${contextMatches} context lines)`
            );
            return;
        }

        const preview = CodePatcher.previewPatch(fileContent, codeBlock, 0, options);
        const contextMatches = matches[0].contextMatchLength || 0;
        const choice = await vscode.window.showInformationMessage(
            `Found 1 match at line ${matches[0].startLine + 1} (${(matches[0].confidence * 100).toFixed(0)}% confidence, ${contextMatches} context lines)`,
            { modal: true, detail: preview || undefined },
            'Apply',
            'Cancel'
        );

        if (choice === 'Apply') {
            await applyPatchAtMatch(editor, codeBlock, 0, options, matches[0]);
            vscode.window.showInformationMessage('✓ Patch applied successfully');
        }
        return;
    }

    await handleMultipleMatches(editor, codeBlock, matches, options);
}

async function handleMultipleMatches(
    editor: vscode.TextEditor,
    codeBlock: string,
    matches: Match[],
    options: PatchOptions
) {
    const document = editor.document;

    const items: Array<vscode.QuickPickItem & { matchIndex: number }> = matches.map((match, idx) => {
        const lineNum = match.startLine + 1;
        const confidence = (match.confidence * 100).toFixed(0);
        const contextMatches = match.contextMatchLength || 0;

        const codePreview = document
            .getText(new vscode.Range(match.startLine, 0, match.startLine + 1, 0))
            .trim()
            .substring(0, 60);

        return {
            label: `$(file-code) Line ${lineNum}`,
            description: `${confidence}% confidence, ${contextMatches} context lines`,
            detail: codePreview,
            matchIndex: idx
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${matches.length} matches. Select where to apply the patch:`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) return;

    const preview = CodePatcher.previewPatch(
        document.getText(),
        codeBlock,
        selected.matchIndex,
        options
    );

    const choice = await vscode.window.showInformationMessage(
        'Preview of changes:',
        { modal: true, detail: preview || 'Preview not available' },
        'Apply',
        'Cancel'
    );

    if (choice === 'Apply') {
        await applyPatchAtMatch(editor, codeBlock, selected.matchIndex, options, matches[selected.matchIndex]);
        vscode.window.showInformationMessage('✓ Patch applied successfully');
    }
}

async function applyPatchAtMatch(
    editor: vscode.TextEditor,
    codeBlock: string,
    matchIndex: number,
    options: PatchOptions,
    matchInfo?: Match
) {
    const document = editor.document;
    const fileContent = document.getText();

    const patchedContent = CodePatcher.applyPatch(
        fileContent,
        codeBlock,
        matchIndex,
        options
    );

    if (!patchedContent) {
        vscode.window.showErrorMessage('Failed to apply patch');
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(fileContent.length)
    );

    edit.replace(document.uri, fullRange, patchedContent);

    const success = await vscode.workspace.applyEdit(edit);

    if (!success) {
        vscode.window.showErrorMessage('Failed to apply edit to document');
    } else {
        const fileName = path.basename(document.fileName);
        const lineInfo = matchInfo ? ` at line ${matchInfo.startLine + 1}` : '';
        vscode.window.showInformationMessage(`✓ Modified ${fileName}${lineInfo}`);
    }
}

export function deactivate() {
    console.log('AI Code Patcher extension deactivated');
}
