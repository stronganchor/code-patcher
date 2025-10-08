// extension.ts - Main VS Code Extension Entry Point (Simplified Format)
import * as vscode from 'vscode';
import { CodePatcher, PatchOptions, Match } from './codePatcher';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Code Patcher extension is now active');

    let applyPatchCommand = vscode.commands.registerCommand(
        'aiCodePatcher.applyPatch',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const patchInput = await vscode.window.showInputBox({
                prompt: 'Paste your patch (OLD/NEW format or SEARCH/REPLACE format)',
                placeHolder: 'OLD:\\ncontext\\nold code\\ncontext\\n\\nNEW:\\ncontext\\nnew code\\ncontext',
                ignoreFocusOut: true
            });

            if (!patchInput) {
                return;
            }

            await applyPatchToEditor(editor, patchInput);
        }
    );

    let applyPatchFromClipboardCommand = vscode.commands.registerCommand(
        'aiCodePatcher.applyPatchFromClipboard',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor found');
                return;
            }

            const patchInput = await vscode.env.clipboard.readText();

            if (!patchInput) {
                vscode.window.showErrorMessage('Clipboard is empty');
                return;
            }

            await applyPatchToEditor(editor, patchInput);
        }
    );

    context.subscriptions.push(applyPatchCommand);
    context.subscriptions.push(applyPatchFromClipboardCommand);
}

async function applyPatchToEditor(editor: vscode.TextEditor, patchInput: string) {
    const document = editor.document;
    const fileContent = document.getText();

    const config = vscode.workspace.getConfiguration('aiCodePatcher');
    const options: PatchOptions = {
        fuzzyMatch: config.get('fuzzyMatch', true),
        minConfidence: config.get('minConfidence', 0.7),
        contextLines: config.get('contextLines', 2)
    };

    const result = CodePatcher.patch(fileContent, patchInput, options);

    if (!result.success) {
        vscode.window.showErrorMessage(`Patch failed: ${result.error}`);
        return;
    }

    const matches = result.matches;

    if (matches.length === 0) {
        vscode.window.showWarningMessage('No matches found for the search block');
        return;
    }

    if (matches.length === 1) {
        const autoApply = config.get('autoApplySingleMatch', false);

        if (autoApply) {
            await applyPatchAtMatch(editor, patchInput, 0, options);
            vscode.window.showInformationMessage(
                `✓ Patch applied at line ${matches[0].startLine + 1} (${(matches[0].confidence * 100).toFixed(0)}% confidence)`
            );
            return;
        }

        const preview = CodePatcher.previewPatch(fileContent, patchInput, 0, options);
        const choice = await vscode.window.showInformationMessage(
            `Found 1 match at line ${matches[0].startLine + 1} (${(matches[0].confidence * 100).toFixed(0)}% confidence)`,
            { modal: true, detail: preview || undefined },
            'Apply',
            'Cancel'
        );

        if (choice === 'Apply') {
            await applyPatchAtMatch(editor, patchInput, 0, options);
            vscode.window.showInformationMessage('✓ Patch applied successfully');
        }
        return;
    }

    await handleMultipleMatches(editor, patchInput, matches, options);
}

async function handleMultipleMatches(
    editor: vscode.TextEditor,
    patchInput: string,
    matches: Match[],
    options: PatchOptions
) {
    const document = editor.document;

    const items: Array<vscode.QuickPickItem & { matchIndex: number }> = matches.map((match, idx) => {
        const lineNum = match.startLine + 1;
        const confidence = (match.confidence * 100).toFixed(0);
        const similarity = (match.similarity * 100).toFixed(0);

        const codePreview = document
            .getText(new vscode.Range(match.startLine, 0, match.startLine + 1, 0))
            .trim()
            .substring(0, 60);

        return {
            label: `$(file-code) Line ${lineNum}`,
            description: `${confidence}% confidence, ${similarity}% similarity`,
            detail: codePreview,
            matchIndex: idx
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Found ${matches.length} matches. Select where to apply the patch:`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) {
        return;
    }

    const preview = CodePatcher.previewPatch(
        document.getText(),
        patchInput,
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
        await applyPatchAtMatch(editor, patchInput, selected.matchIndex, options);
        vscode.window.showInformationMessage('✓ Patch applied successfully');
    }
}

async function applyPatchAtMatch(
    editor: vscode.TextEditor,
    patchInput: string,
    matchIndex: number,
    options: PatchOptions
) {
    const document = editor.document;
    const fileContent = document.getText();

    const patchedContent = CodePatcher.applyPatch(
        fileContent,
        patchInput,
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
    }
}

export function deactivate() {
    console.log('AI Code Patcher extension deactivated');
}
