# DashboardKit 安全部署指南

## 🔒 安全設置步驟

### 1. 創建專用的 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 創建新專案：`DashboardKit-Public`
3. 啟用 Google Drive API
4. 創建 OAuth 2.0 憑證

### 2. 設置 OAuth 2.0 憑證

#### 授權的 JavaScript 來源：
```
https://paician.github.io
https://*.github.io
https://your-custom-domain.com (如果使用自定義域名)
```

#### 授權的重新導向 URI：
```
https://paician.github.io/GD_Share/
https://your-custom-domain.com/ (如果使用自定義域名)
```

### 3. 部署選項

#### 選項A: GitHub Pages (推薦)
- 優點：免費、簡單、與 GitHub 整合
- 設置：使用 GitHub Secrets 存儲憑證

#### 選項B: Cloudflare Pages
- 優點：更快的 CDN、更好的性能
- 設置：使用 Cloudflare 環境變數

#### 選項C: Vercel
- 優點：優秀的開發者體驗
- 設置：使用 Vercel 環境變數

## 🛡️ 安全最佳實踐

### 1. 憑證管理
- ✅ 使用環境變數存儲敏感資訊
- ✅ 定期輪換 API 憑證
- ✅ 限制 API 配額和使用量

### 2. 域名限制
- ✅ 在 Google Cloud Console 中限制授權域名
- ✅ 只允許特定域名使用你的憑證

### 3. 監控
- ✅ 定期檢查 Google Cloud Console 的使用量
- ✅ 設置配額警報

## 📋 部署檢查清單

- [ ] 創建專用的 Google Cloud 專案
- [ ] 設置 OAuth 2.0 憑證
- [ ] 配置授權域名
- [ ] 設置環境變數
- [ ] 測試部署
- [ ] 設置監控警報