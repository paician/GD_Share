# Google Drive 分享檔案查看器

這是一個使用 Google OAuth 登入，並列出 Google Drive 分享檔案的原生 JavaScript 專案，適用於 GitHub Pages。

## 📦 使用方式

### 1. 啟用 Google Cloud 專案：
- 到 [Google Cloud Console](https://console.cloud.google.com/)
- 建立一個新專案，啟用 `Google Drive API`
- 建立 OAuth 2.0 憑證（應用類型選 "Web"）
- 記下 `client_id`
- 在憑證設定中新增 `http://localhost` 及你的 GitHub Pages 網址為授權的 JavaScript 來源與 redirect URI

### 2. 修改程式
將 `app.js` 中的：

```js
const CLIENT_ID = "<YOUR_CLIENT_ID_HERE>";
