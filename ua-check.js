<<<<<<< HEAD
// User-Agent 檢查腳本
// 這個腳本會檢查訪問者的 User-Agent 並限制訪問

(function() {
  'use strict';
  
  // 允許的 User-Agent 模式
  const allowedPatterns = [
    /Chrome/i,           // Chrome 瀏覽器
    /Firefox/i,          // Firefox 瀏覽器
    /Safari/i,           // Safari 瀏覽器
    /Edge/i,             // Edge 瀏覽器
    /Opera/i,            // Opera 瀏覽器
    /Mobile/i,           // 移動設備
    /Android/i,          // Android
    /iPhone/i,           // iPhone
    /iPad/i              // iPad
  ];
  
  // 禁止的 User-Agent 模式
  const blockedPatterns = [
    /bot/i,              // 機器人
    /crawler/i,          // 爬蟲
    /spider/i,           // 蜘蛛
    /scraper/i,          // 抓取器
    /curl/i,             // curl 命令
    /wget/i,             // wget 命令
    /python/i,           // Python 腳本
    /java/i,             // Java 應用
    /postman/i,          // Postman
    /insomnia/i          // Insomnia
  ];
  
  function checkUserAgent() {
    const userAgent = navigator.userAgent;
    console.log('🔍 檢查 User-Agent:', userAgent);
    
    // 檢查是否被禁止
    for (const pattern of blockedPatterns) {
      if (pattern.test(userAgent)) {
        console.log('❌ 檢測到被禁止的 User-Agent:', pattern);
        showBlockedMessage();
        return false;
      }
    }
    
    // 檢查是否在允許列表中
    for (const pattern of allowedPatterns) {
      if (pattern.test(userAgent)) {
        console.log('✅ User-Agent 檢查通過:', pattern);
        return true;
      }
    }
    
    // 如果不在允許列表中，也阻止訪問
    console.log('❌ User-Agent 不在允許列表中');
    showBlockedMessage();
    return false;
  }
  
  function showBlockedMessage() {
    document.body.innerHTML = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: white;
        text-align: center;
      ">
        <div style="
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
        ">
          <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
          <h1 style="margin: 0 0 20px 0; font-size: 28px;">訪問被限制</h1>
          <p style="margin: 0 0 20px 0; font-size: 16px; opacity: 0.9;">
            此應用程式僅支援標準瀏覽器訪問
          </p>
          <p style="margin: 0; font-size: 14px; opacity: 0.7;">
            請使用 Chrome、Firefox、Safari 或 Edge 瀏覽器
          </p>
        </div>
      </div>
    `;
  }
  
  // 在頁面載入時檢查
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkUserAgent);
  } else {
    checkUserAgent();
  }
  
=======
// User-Agent 檢查腳本
// 這個腳本會檢查訪問者的 User-Agent 並限制訪問

(function() {
  'use strict';
  
  // 允許的 User-Agent 模式
  const allowedPatterns = [
    /Chrome/i,           // Chrome 瀏覽器
    /Firefox/i,          // Firefox 瀏覽器
    /Safari/i,           // Safari 瀏覽器
    /Edge/i,             // Edge 瀏覽器
    /Opera/i,            // Opera 瀏覽器
    /Mobile/i,           // 移動設備
    /Android/i,          // Android
    /iPhone/i,           // iPhone
    /iPad/i              // iPad
  ];
  
  // 禁止的 User-Agent 模式
  const blockedPatterns = [
    /bot/i,              // 機器人
    /crawler/i,          // 爬蟲
    /spider/i,           // 蜘蛛
    /scraper/i,          // 抓取器
    /curl/i,             // curl 命令
    /wget/i,             // wget 命令
    /python/i,           // Python 腳本
    /java/i,             // Java 應用
    /postman/i,          // Postman
    /insomnia/i          // Insomnia
  ];
  
  function checkUserAgent() {
    const userAgent = navigator.userAgent;
    console.log('🔍 檢查 User-Agent:', userAgent);
    
    // 檢查是否被禁止
    for (const pattern of blockedPatterns) {
      if (pattern.test(userAgent)) {
        console.log('❌ 檢測到被禁止的 User-Agent:', pattern);
        showBlockedMessage();
        return false;
      }
    }
    
    // 檢查是否在允許列表中
    for (const pattern of allowedPatterns) {
      if (pattern.test(userAgent)) {
        console.log('✅ User-Agent 檢查通過:', pattern);
        return true;
      }
    }
    
    // 如果不在允許列表中，也阻止訪問
    console.log('❌ User-Agent 不在允許列表中');
    showBlockedMessage();
    return false;
  }
  
  function showBlockedMessage() {
    document.body.innerHTML = `
      <div style="
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: white;
        text-align: center;
      ">
        <div style="
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
        ">
          <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
          <h1 style="margin: 0 0 20px 0; font-size: 28px;">訪問被限制</h1>
          <p style="margin: 0 0 20px 0; font-size: 16px; opacity: 0.9;">
            此應用程式僅支援標準瀏覽器訪問
          </p>
          <p style="margin: 0; font-size: 14px; opacity: 0.7;">
            請使用 Chrome、Firefox、Safari 或 Edge 瀏覽器
          </p>
        </div>
      </div>
    `;
  }
  
  // 在頁面載入時檢查
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkUserAgent);
  } else {
    checkUserAgent();
  }
  
>>>>>>> efa983dae3288edd6c2e1d95fef8b478b5919740
})();