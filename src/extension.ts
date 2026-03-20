import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// 定義 Gemini 標準 generateContent API 回傳的資料結構
interface GeminiResponse {
  candidates?: {
    content: {
      parts: {
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string; // Base64 格式的圖片資料
        };
      }[];
    };
  }[];
}

export function activate(context: vscode.ExtensionContext) {
  console.log("🍌 Nano Banana 擴充套件已成功啟動！");

  // ==========================================
  // 指令 1：設定 Gemini API Key
  // ==========================================
  let setKeyCmd = vscode.commands.registerCommand(
    "nanoBanana.setGeminiApiKey",
    async () => {
      const key = await vscode.window.showInputBox({
        prompt: "請輸入您的 Gemini API Key",
        placeHolder: "AIza...",
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("gemini_api_key", key);
        vscode.window.showInformationMessage("✅ API Key 已安全儲存！");
      }
    },
  );

  // ==========================================
  // 指令 2：從選取文字生成圖片 (Text-to-Image)
  // ==========================================
  let generateCmd = vscode.commands.registerCommand(
    "nanoBanana.generateFromSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const text = editor?.document.getText(selection);

      if (!text) {
        vscode.window.showWarningMessage("⚠️ 請先選取一段文字作為 Prompt！");
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Nano Banana",
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: "正在初始化設定..." });
          const apiKey = await context.secrets.get("gemini_api_key");
          if (!apiKey) {
            vscode.window.showErrorMessage(
              "❌ 找不到 API Key，請先執行設定指令！",
            );
            return;
          }

          const config = vscode.workspace.getConfiguration("nanoBanana");
          const baseUrl = config.get<string>("geminiApiBaseUrl");
          const modelId = config.get<string>("modelId");
          const imageSize = config.get<string>("imageSize");
          const aspectRatio = config.get<string>("defaultAspectRatio");
          const outputFormat = config.get<string>("imageOutputFormat");

          progress.report({
            message: `🚀 正在請 Gemini 生成 ${imageSize} 圖片...`,
          });

          const apiUrl = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`;

          try {
            const enhancedPrompt = `${text} (Requirement: Aspect Ratio ${aspectRatio}, Quality ${imageSize})`;

            const requestBody = {
              contents: [
                {
                  role: "user",
                  parts: [{ text: enhancedPrompt }],
                },
              ],
              generationConfig: {
                responseModalities: ["IMAGE"],
              },
            };

            const response = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`API 錯誤 (${response.status}): ${errorText}`);
            }

            const data = (await response.json()) as GeminiResponse;
            const parts = data.candidates?.[0]?.content?.parts;

            if (!parts || parts.length === 0) {
              throw new Error("API 回傳資料格式錯誤，找不到內容。");
            }

            const imagePart = parts.find((p) => p.inlineData);
            if (!imagePart || !imagePart.inlineData) {
              throw new Error(
                "模型沒有回傳圖片，可能是 Prompt 違反了安全機制。",
              );
            }

            progress.report({ message: "正在儲存圖片..." });

            const base64Data = imagePart.inlineData.data;
            const mimeType = imagePart.inlineData.mimeType;
            const ext = mimeType.split("/")[1] || outputFormat;
            const imageBuffer = Buffer.from(base64Data, "base64");

            // 🌟 方法 B：決定存檔路徑，若資料夾不存在則自動建立
            const outDir = config.get<string>("outputDirectory") || os.tmpdir();
            if (!fs.existsSync(outDir)) {
              // recursive: true 允許一次建立多層資料夾
              fs.mkdirSync(outDir, { recursive: true });
            }

            const fileName = `nano-banana-${Date.now()}.${ext}`;
            const imagePath = path.join(outDir, fileName);

            fs.writeFileSync(imagePath, imageBuffer);

            progress.report({ message: "正在開啟圖片..." });
            const uri = vscode.Uri.file(imagePath);
            await vscode.commands.executeCommand("vscode.open", uri);

            vscode.window.showInformationMessage(`🎉 圖片生成成功！`);
          } catch (error) {
            vscode.window.showErrorMessage(`❌ 生成失敗: ${error}`);
          }
        },
      );
    },
  );

  // ==========================================
  // 指令 3：選擇 Copilot 模型 (預留)
  // ==========================================
  let selectModelCmd = vscode.commands.registerCommand(
    "nanoBanana.selectCopilotPromptModel",
    () => {
      vscode.window.showInformationMessage(
        "🚀 功能開發中：即將載入 vscode.lm 模型列表...",
      );
    },
  );

  // ==========================================
  // 指令 4：使用參考圖片編輯 (Image-to-Image 圖生圖)
  // ==========================================
  let editImageCmd = vscode.commands.registerCommand(
    "nanoBanana.editImageWithReference",
    async (uri: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage(
          "⚠️ 請在左側檔案總管，對著圖片檔案按右鍵執行此指令！",
        );
        return;
      }

      const prompt = await vscode.window.showInputBox({
        prompt: "請輸入您想對這張圖片進行的修改或參考提示 (Prompt)",
        placeHolder: "例如：將這張圖轉換成水彩畫風格、背景改成夜晚...",
      });

      if (!prompt) {
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Nano Banana",
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({ message: "正在讀取圖片與設定..." });

          const apiKey = await context.secrets.get("gemini_api_key");
          if (!apiKey) {
            vscode.window.showErrorMessage(
              "❌ 找不到 API Key，請先執行設定指令！",
            );
            return;
          }

          const config = vscode.workspace.getConfiguration("nanoBanana");
          const baseUrl = config.get<string>("geminiApiBaseUrl");
          const modelId = config.get<string>("modelId");
          const outputFormat = config.get<string>("imageOutputFormat");

          const imageBytes = fs.readFileSync(uri.fsPath);
          const base64Image = imageBytes.toString("base64");
          const ext = path.extname(uri.fsPath).toLowerCase().replace(".", "");
          const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

          progress.report({
            message: `🎨 正在請 Gemini 參考圖片生成新內容...`,
          });

          const apiUrl = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`;

          try {
            const requestBody = {
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: prompt },
                    {
                      inlineData: {
                        mimeType: mimeType,
                        data: base64Image,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                responseModalities: ["IMAGE"],
              },
            };

            const response = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`API 錯誤 (${response.status}): ${errorText}`);
            }

            const data = (await response.json()) as GeminiResponse;
            const parts = data.candidates?.[0]?.content?.parts;

            if (!parts || parts.length === 0) {
              throw new Error("API 回傳資料格式錯誤，找不到內容。");
            }

            const imagePart = parts.find((p) => p.inlineData);
            if (!imagePart || !imagePart.inlineData) {
              throw new Error(
                "模型沒有回傳圖片，可能是 Prompt 違反了安全機制。",
              );
            }

            progress.report({ message: "正在儲存新圖片..." });

            const newBase64Data = imagePart.inlineData.data;
            const newMimeType = imagePart.inlineData.mimeType;
            const newExt = newMimeType.split("/")[1] || outputFormat;
            const newImageBuffer = Buffer.from(newBase64Data, "base64");

            // 🌟 方法 B：決定存檔路徑，若資料夾不存在則自動建立
            const outDir = config.get<string>("outputDirectory") || os.tmpdir();
            if (!fs.existsSync(outDir)) {
              // recursive: true 允許一次建立多層資料夾
              fs.mkdirSync(outDir, { recursive: true });
            }

            const fileName = `nano-banana-edit-${Date.now()}.${newExt}`;
            const imagePath = path.join(outDir, fileName);

            fs.writeFileSync(imagePath, newImageBuffer);

            progress.report({ message: "正在開啟新圖片..." });
            const newUri = vscode.Uri.file(imagePath);
            await vscode.commands.executeCommand("vscode.open", newUri);

            vscode.window.showInformationMessage(`🎉 圖生圖成功！`);
          } catch (error) {
            vscode.window.showErrorMessage(`❌ 生成失敗: ${error}`);
          }
        },
      );
    },
  );

  // ==========================================
  // 指令 5：開啟圖片編輯器 Webview (預留)
  // ==========================================
  let openEditorCmd = vscode.commands.registerCommand(
    "nanoBanana.openImageEditor",
    () => {
      vscode.window.showInformationMessage(
        "🚀 功能開發中：準備開啟 Webview 畫布...",
      );
    },
  );

  // ==========================================
  // 註冊與清理
  // ==========================================
  context.subscriptions.push(
    setKeyCmd,
    generateCmd,
    selectModelCmd,
    editImageCmd,
    openEditorCmd,
  );
}

export function deactivate() {
  console.log("Nano Banana 擴充套件已停用。");
}
