import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Nano Banana is now active!');

    // 註冊指令：設定 API Key
    let setKeyRepo = vscode.commands.registerCommand('nanoBanana.setKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: "請輸入您的 Gemini API Key",
            placeHolder: "AIza..."
        });
        if (key) {
            await context.secrets.store('gemini_api_key', key);
            vscode.window.showInformationMessage('API Key 已安全儲存！');
        }
    });

    // 註冊指令：從選取文字生成圖片 (範例 placeholder)
    let generateRepo = vscode.commands.registerCommand('nanoBanana.generateFromSelection', () => {
        vscode.window.showInformationMessage('準備開始生成圖片... (這是一個範例功能)');
    });

    context.subscriptions.push(setKeyRepo, generateRepo);
}

export function deactivate() {}
