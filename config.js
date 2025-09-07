// DashboardKit 配置檔案
// 注意：CLIENT_ID 是公開的，這是 OAuth 2.0 的標準做法
// 真正的安全來自於 Google Cloud Console 中的域名限制和授權機制

// 直接使用 CLIENT_ID（因為它是公開的）
window.GOOGLE_CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com";
window.GOOGLE_API_KEY = "";

// 開發環境配置 (僅用於本地測試)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // 本地開發時使用你的憑證
  window.GOOGLE_CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com";
  window.GOOGLE_API_KEY = "";
}