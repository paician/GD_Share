// DashboardKit 配置檔案
// 這個檔案應該在部署時通過環境變數替換

window.GOOGLE_CLIENT_ID = ""; // 將在部署時替換
window.GOOGLE_API_KEY = "";   // 將在部署時替換

// 開發環境配置 (僅用於本地測試)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // 本地開發時使用你的憑證
  window.GOOGLE_CLIENT_ID = "YOUR_CLIENT_ID_HERE"; // 請替換為你的 CLIENT_ID
  window.GOOGLE_API_KEY = ""; // 請替換為你的 API_KEY
}