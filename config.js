// DashboardKit 配置檔案
// 這個檔案會在 Cloudflare Pages 構建時通過環境變數替換

window.GOOGLE_CLIENT_ID = "{{GOOGLE_CLIENT_ID}}"; // Cloudflare Pages 環境變數
window.GOOGLE_API_KEY = "{{GOOGLE_API_KEY}}";     // Cloudflare Pages 環境變數

// 開發環境配置 (僅用於本地測試)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // 本地開發時使用你的憑證
  window.GOOGLE_CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com";
  window.GOOGLE_API_KEY = "";
}