// 等待 DOM 載入完成後再獲取憑證
let CLIENT_ID, API_KEY;

function initializeCredentials() {
  CLIENT_ID = window.GOOGLE_CLIENT_ID || "";
  API_KEY = window.GOOGLE_API_KEY || "";
  
  console.log("🔍 檢查憑證設定...");
  console.log("CLIENT_ID:", CLIENT_ID ? "已設定" : "未設定");
  console.log("API_KEY:", API_KEY ? "已設定" : "未設定");
  
  if (!CLIENT_ID) {
    console.error("❌ GOOGLE_CLIENT_ID 未設定！請檢查 config.js 檔案。");
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
        <h2 style="color: #dc3545;">⚠️ 配置錯誤</h2>
        <p>Google API 憑證未正確設定。請檢查 config.js 檔案。</p>
        <p><small>錯誤：GOOGLE_CLIENT_ID 未設定</small></p>
        <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 10px;">重新載入</button>
      </div>
    `;
    return false;
  } else {
    console.log("✅ Google API 憑證已載入");
    return true;
  }
}
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentPage = 'dashboard';
let fileData = {
  sharedWithMe: [],
  sharedByMe: [],
  allFiles: []
};

// 多帳號管理
let authorizedAccounts = [];
let currentAccount = null;

// 這些元素可能不存在，需要檢查
const signinButton = document.getElementById("signin-button");
const signoutButton = document.getElementById("signout-button");
const loadFilesButton = document.getElementById("load-files");
const fileList = document.getElementById("file-list");

function gapiLoaded() {
  gapi.load("client", initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: "",
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    if (signinButton) {
    signinButton.disabled = false;
    }
  }
}

// 只有當 signinButton 存在時才設定 onclick
if (signinButton) {
signinButton.onclick = () => {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
      
      // 設定 token 到 gapi client
      gapi.client.setToken(resp);
      
      // 更新側邊欄用戶狀態
      updateSidebarUserStatus(true);
      
      // 自動載入資料並更新 Dashboard
      await loadAllDataAndUpdateDashboard();
  };
  tokenClient.requestAccessToken({ prompt: "" });
};
}

// 只有當 signoutButton 存在時才設定 onclick
if (signoutButton) {
signoutButton.onclick = () => {
  google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
      // 更新側邊欄用戶狀態
      updateSidebarUserStatus(false);
      
      // 清空資料
      fileData = {
        sharedWithMe: [],
        sharedByMe: [],
        allFiles: []
      };
      
      // 重置 Dashboard 資料
      resetDashboardData();
      
      if (fileList) {
    fileList.innerHTML = "";
      }
    gapi.client.setToken(null);
  });
};
}

// 只有當 loadFilesButton 存在時才設定 onclick
if (loadFilesButton) {
loadFilesButton.onclick = async () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  fileList.innerHTML = "<p class='loading'>正在載入分享檔案...</p>";

  try {
    // 檢查是否已登入
    const token = gapi.client.getToken();
    if (!token || !token.access_token) {
      fileList.innerHTML = "<p>⚠️ 請先登入 Google 帳戶</p>";
      return;
    }

    console.log("開始載入檔案，模式：", mode);
    let files = [];

    if (mode === "sharedWithMe") {
      console.log("載入分享給我的檔案...");
      const response = await gapi.client.drive.files.list({
        pageSize: 100,
        q: "sharedWithMe=true",
        fields: "files(id, name, webViewLink, createdTime, permissions, size, mimeType, modifiedTime)"
      });
      console.log("分享給我回應：", response);
      files = response.result.files || [];
      fileData.sharedWithMe = files;
    }

    if (mode === "sharedByMe") {
      console.log("載入我分享的檔案...");
      const response = await gapi.client.drive.files.list({
        pageSize: 100,
        q: "trashed = false and 'me' in owners",
        fields: "files(id, name, webViewLink, createdTime, permissions, owners, size, mimeType, modifiedTime)"
      });
      console.log("我分享的回應：", response);
      const allFiles = response.result.files || [];
      files = allFiles.filter(file =>
        file.permissions && file.permissions.some(p => p.role !== "owner")
      );
      fileData.sharedByMe = files;
    }

    // 更新所有檔案列表
    fileData.allFiles = [...fileData.sharedWithMe, ...fileData.sharedByMe];

    console.log("載入完成，檔案數量：", files.length);

    if (!files || files.length === 0) {
      fileList.innerHTML = `
        <div class="alert alert-info">
          <i class="fas fa-info-circle me-2"></i>
          沒有找到符合的分享檔案。請確認：
          <ul class="mt-2">
            <li>您是否有與他人分享的檔案</li>
            <li>是否有其他人分享檔案給您</li>
            <li>檔案是否已被刪除或權限已變更</li>
          </ul>
        </div>
      `;
      return;
    }

    // 應用篩選和搜尋
    const filteredFiles = applyFiltersAndSearch(files);
    
    // 為每個檔案獲取詳細的權限資訊
    await loadFilePermissions(files);
    
    // 使用 displayFiles 函數來顯示檔案（包含詳細按鈕）
    displayFiles(files);
    
    // 啟用批次修改按鈕
    const batchEditButton = document.getElementById('batch-edit-permissions');
    if (batchEditButton) {
      batchEditButton.disabled = false;
    }

    // 更新儀表板資料
    updateDashboard();

  } catch (err) {
    console.error("載入檔案失敗：", err);
    console.error("錯誤詳情：", err.result);
    
    let errorMessage = "未知錯誤";
    let errorDetails = "";
    
    if (err.result?.error) {
      errorMessage = err.result.error.message || "API 錯誤";
      errorDetails = err.result.error.details || "";
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    fileList.innerHTML = `
      <div class="alert alert-danger">
        <h5><i class="fas fa-exclamation-triangle me-2"></i>載入檔案失敗</h5>
        <p><strong>錯誤訊息：</strong> ${errorMessage}</p>
        ${errorDetails ? `<p><strong>詳細資訊：</strong> ${errorDetails}</p>` : ''}
        <hr>
        <p><strong>可能的解決方案：</strong></p>
        <ul>
          <li>確認您已正確登入 Google 帳戶</li>
          <li>檢查 Google Drive API 是否已啟用</li>
          <li>確認 OAuth 2.0 設定正確</li>
          <li>檢查網路連線是否正常</li>
        </ul>
        <button class="btn btn-outline-danger btn-sm mt-2" onclick="location.reload()">
          <i class="fas fa-refresh me-1"></i>重新載入頁面
        </button>
      </div>
    `;
  }
  };
}

  
  
  
  
  

// 更新側邊欄用戶狀態
function updateSidebarUserStatus(isLoggedIn) {
  const userName = document.getElementById('sidebar-user-name');
  const userStatus = document.getElementById('sidebar-user-status');
  const signinBtn = document.getElementById('signin-button');
  const signoutBtn = document.getElementById('signout-button');
  
  if (isLoggedIn) {
    userName.textContent = 'Google 用戶';
    userStatus.textContent = '已登入';
    signinBtn.style.display = 'none';
    signoutBtn.style.display = 'block';
  } else {
    userName.textContent = '未登入';
    userStatus.textContent = '點擊登入 Google';
    signinBtn.style.display = 'block';
    signoutBtn.style.display = 'none';
  }
}

// 載入所有資料並更新 Dashboard
// 重新載入資料 - 全局函數
window.loadAllDataAndUpdateDashboard = async function() {
  try {
    // 更新資料狀態提示
    const dataStatusText = document.getElementById('data-status-text');
    dataStatusText.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>正在載入資料...';
    
    console.log("開始自動載入 Dashboard 資料...");
    
    // 載入分享給我的檔案
    console.log("載入分享給我的檔案...");
    const sharedWithMeResponse = await gapi.client.drive.files.list({
      pageSize: 100,
      q: "sharedWithMe=true",
      fields: "files(id, name, webViewLink, createdTime, permissions, size, mimeType)"
    });
    fileData.sharedWithMe = sharedWithMeResponse.result.files || [];
    console.log("分享給我檔案數量：", fileData.sharedWithMe.length);
    console.log("分享給我檔案詳情：", fileData.sharedWithMe);
    
    // 載入我分享的檔案
    console.log("載入我分享的檔案...");
    const sharedByMeResponse = await gapi.client.drive.files.list({
      pageSize: 100,
      q: "trashed = false and 'me' in owners",
      fields: "files(id, name, webViewLink, createdTime, permissions, owners, size, mimeType)"
    });
    const allMyFiles = sharedByMeResponse.result.files || [];
    fileData.sharedByMe = allMyFiles.filter(file =>
      file.permissions && file.permissions.some(p => p.role !== "owner")
    );
    console.log("我分享的檔案數量：", fileData.sharedByMe.length);
    console.log("我分享的檔案詳情：", fileData.sharedByMe);
    
    // 合併所有檔案
    fileData.allFiles = [...fileData.sharedWithMe, ...fileData.sharedByMe];
    console.log("總檔案數量：", fileData.allFiles.length);
    
    // 更新 Dashboard
    updateDashboard();
    
    // 更新資料狀態提示
    dataStatusText.innerHTML = `<i class="fas fa-check-circle me-1"></i>資料已載入完成 (${fileData.allFiles.length} 個檔案)`;
    
    // 3秒後隱藏提示
    setTimeout(() => {
      dataStatusText.innerHTML = '<i class="fas fa-info-circle me-1"></i>資料已同步';
    }, 3000);
    
  } catch (err) {
    console.error("載入資料失敗：", err);
    console.error("錯誤詳情：", err.result);
    
    const dataStatusText = document.getElementById('data-status-text');
    let errorMsg = "載入資料失敗";
    
    if (err.result?.error) {
      errorMsg = `載入失敗: ${err.result.error.message}`;
    } else if (err.message) {
      errorMsg = `載入失敗: ${err.message}`;
    }
    
    dataStatusText.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>${errorMsg}`;
    
    // 5秒後顯示重試按鈕
    setTimeout(() => {
      dataStatusText.innerHTML = `
        <i class="fas fa-exclamation-triangle me-1"></i>${errorMsg}
        <button class="btn btn-sm btn-outline-primary ms-2" onclick="loadAllDataAndUpdateDashboard()">
          <i class="fas fa-redo me-1"></i>重試
        </button>
      `;
    }, 2000);
  }
}

// 重置 Dashboard 資料
function resetDashboardData() {
  const totalFilesEl = document.getElementById('total-files');
  const sharedWithMeEl = document.getElementById('shared-with-me');
  const sharedByMeEl = document.getElementById('shared-by-me');
  const monthlyNewEl = document.getElementById('monthly-new');
  const dataStatusText = document.getElementById('data-status-text');
  
  if (totalFilesEl) totalFilesEl.textContent = '1000';
  if (sharedWithMeEl) sharedWithMeEl.textContent = '$1252';
  if (sharedByMeEl) sharedByMeEl.textContent = '3550';
  if (monthlyNewEl) monthlyNewEl.textContent = '3550';
  if (dataStatusText) dataStatusText.innerHTML = '<i class="fas fa-info-circle me-1"></i>登入後將顯示真實資料';
}

// 頁面切換功能
// 全局函數，確保可以被 HTML onclick 調用
window.showPage = function(pageName) {
  // 隱藏所有頁面
  const pages = document.querySelectorAll('.page-content');
  pages.forEach(page => {
    page.style.display = 'none';
  });
  
  // 顯示選中的頁面
  const targetPage = document.getElementById(pageName + '-page');
  if (targetPage) {
    targetPage.style.display = 'block';
  }
  
  // 更新側邊選單的活動狀態
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-page') === pageName) {
      item.classList.add('active');
    }
  });
  
  currentPage = pageName;
  
  // 根據頁面載入相應內容
  if (pageName === 'dashboard') {
    updateDashboard();
    createCharts();
  } else if (pageName === 'statistics') {
    updateStatistics();
  } else if (pageName === 'profile') {
    updateProfile();
  }
}

// 創建圖表
function createCharts() {
  // 分享趨勢圖表 (基於真實資料) - 處理重複的 ID
  const conversionElements = document.querySelectorAll('#conversionChart');
  conversionElements.forEach((conversionCtx, index) => {
    if (conversionCtx) {
      // 銷毀已存在的圖表
      if (window.conversionChart && typeof window.conversionChart.destroy === 'function') {
        window.conversionChart.destroy();
      }
    
      // 計算分享趨勢資料
      const trendData = calculateShareTrend();
      
      window.conversionChart = new Chart(conversionCtx, {
      type: 'line',
      data: {
        labels: trendData.labels,
        datasets: [{
          label: '分享檔案數',
          data: trendData.data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6366f1',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: '月份'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: '檔案數量'
            }
          }
        },
        elements: {
          point: {
            hoverRadius: 8
          }
        }
      }
      });
    }
  });

  // 檔案類型分佈圖表 - 處理重複的 ID
  const ordersElements = document.querySelectorAll('#ordersChart');
  ordersElements.forEach((ordersCtx, index) => {
    if (ordersCtx) {
      // 銷毀已存在的圖表
      if (window.ordersChart && typeof window.ordersChart.destroy === 'function') {
        window.ordersChart.destroy();
      }
    
    // 計算檔案類型分佈
    const typeData = calculateFileTypeDistribution();
    
    window.ordersChart = new Chart(ordersCtx, {
      type: 'doughnut',
      data: {
        labels: typeData.labels,
        datasets: [{
          label: '檔案數量',
          data: typeData.data,
          backgroundColor: [
            '#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#d946ef',
            '#ec4899', '#f43f5e', '#fb7185', '#fbbf24', '#f59e0b'
          ],
          borderColor: '#ffffff',
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          }
        }
      }
      });
    }
  });
}

// 計算分享趨勢資料
function calculateShareTrend() {
  if (fileData.allFiles.length === 0) {
    return { labels: ['無資料'], data: [0] };
  }
  
  // 按月份統計檔案
  const monthlyData = {};
  fileData.allFiles.forEach(file => {
    const date = new Date(file.createdTime);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
  });
  
  // 排序並格式化
  const sortedMonths = Object.keys(monthlyData).sort();
  const labels = sortedMonths.map(monthKey => {
    const [year, month] = monthKey.split('-');
    return `${year}年${month}月`;
  });
  const data = sortedMonths.map(monthKey => monthlyData[monthKey]);
  
  return { labels, data };
}

// 計算檔案類型分佈
function calculateFileTypeDistribution() {
  if (fileData.allFiles.length === 0) {
    return { labels: ['無資料'], data: [0] };
  }
  
  const typeCount = {};
  fileData.allFiles.forEach(file => {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'unknown';
    typeCount[extension] = (typeCount[extension] || 0) + 1;
  });
  
  // 只顯示前8個最常見的類型
  const sortedTypes = Object.entries(typeCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 8);
  
  const labels = sortedTypes.map(([type]) => type.toUpperCase());
  const data = sortedTypes.map(([,count]) => count);
  
  return { labels, data };
}

// 更新儀表板資料
function updateDashboard() {
  const totalFiles = fileData.allFiles.length;
  const sharedWithMe = fileData.sharedWithMe.length;
  const sharedByMe = fileData.sharedByMe.length;
  
  // 計算本月新增檔案
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyNew = fileData.allFiles.filter(file => {
    const fileDate = new Date(file.createdTime);
    return fileDate.getMonth() === currentMonth && fileDate.getFullYear() === currentYear;
  }).length;
  
  // 計算總檔案大小 (MB)
  const totalSize = fileData.allFiles.reduce((sum, file) => sum + (parseInt(file.size) || 0), 0);
  const totalSizeMB = Math.round(totalSize / 1024 / 1024);
  
  // 更新統計卡片 - 映射到有意義的資料
  const totalFilesEl = document.getElementById('total-files');
  const sharedWithMeEl = document.getElementById('shared-with-me');
  const sharedByMeEl = document.getElementById('shared-by-me');
  const monthlyNewEl = document.getElementById('monthly-new');
  
  if (totalFilesEl) {
    totalFilesEl.textContent = totalFiles || '1000';
    totalFilesEl.parentElement.querySelector('.stat-label').textContent = 'CUSTOMERS';
  }
  
  if (sharedWithMeEl) {
    // 將分享檔案數映射為收入 (假設每個分享檔案價值 $10)
    const revenue = sharedWithMe * 10;
    sharedWithMeEl.textContent = `$${revenue.toLocaleString()}`;
    sharedWithMeEl.parentElement.querySelector('.stat-label').textContent = 'REVENUE';
  }
  
  if (sharedByMeEl) {
    // 將我分享的檔案數映射為退貨數
    sharedByMeEl.textContent = sharedByMe.toLocaleString();
    sharedByMeEl.parentElement.querySelector('.stat-label').textContent = 'RETURNS';
  }
  
  if (monthlyNewEl) {
    // 將本月新增檔案數映射為下載數
    monthlyNewEl.textContent = monthlyNew.toLocaleString();
    monthlyNewEl.parentElement.querySelector('.stat-label').textContent = 'DOWNLOADS';
  }
  
  // 更新其他統計卡片
  updateAdditionalStats(totalFiles, totalSizeMB);
  
  // 更新最近活動
  updateRecentActivity();
}

// 更新額外的統計資料
function updateAdditionalStats(totalFiles, totalSizeMB) {
  // 計算成長率 (基於檔案數量)
  const growthRate = totalFiles > 0 ? Math.min(Math.round((totalFiles / 100) * 12), 25) : 12;
  
  // 更新 GROWTH 卡片
  const growthCards = document.querySelectorAll('.stat-card');
  growthCards.forEach(card => {
    const value = card.querySelector('.stat-value');
    const label = card.querySelector('.stat-label');
    if (value && label && label.textContent === 'GROWTH') {
      value.textContent = `+${growthRate}%`;
    }
  });
  
  // 更新 ORDERS 卡片 (基於總檔案數)
  growthCards.forEach(card => {
    const value = card.querySelector('.stat-value');
    const label = card.querySelector('.stat-label');
    if (value && label && label.textContent === 'ORDERS') {
      value.textContent = totalFiles.toLocaleString();
    }
  });
}

// 更新最近活動
function updateRecentActivity() {
  const recentActivity = document.getElementById('recent-activity');
  if (!recentActivity) {
    console.log("recent-activity 元素不存在，跳過更新");
    return;
  }
  
  if (fileData.allFiles.length === 0) {
    recentActivity.innerHTML = '<p class="text-muted">請先載入檔案以查看最近活動</p>';
    return;
  }
  
  // 按建立時間排序，取最近5個
  const recentFiles = fileData.allFiles
    .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
    .slice(0, 5);
  
  let activityHTML = '<div class="table-responsive"><table class="table table-sm">';
  recentFiles.forEach(file => {
    const date = new Date(file.createdTime).toLocaleString();
    activityHTML += `
      <tr>
        <td><i class="fas fa-file text-info"></i></td>
        <td>${file.name}</td>
        <td class="text-right"><small class="text-muted">${date}</small></td>
      </tr>
    `;
  });
  activityHTML += '</table></div>';
  
  recentActivity.innerHTML = activityHTML;
}

// 更新統計頁面
function updateStatistics() {
  const detailedStats = document.getElementById('detailed-stats');
  if (!detailedStats) {
    console.log("detailed-stats 元素不存在，跳過統計更新");
    return;
  }
  
  if (fileData.allFiles.length === 0) {
    detailedStats.innerHTML = '<p class="text-muted">請先載入檔案以查看統計資訊</p>';
    return;
  }
  
  // 檔案類型統計
  const fileTypes = {};
  fileData.allFiles.forEach(file => {
    const extension = file.name.split('.').pop() || 'unknown';
    fileTypes[extension] = (fileTypes[extension] || 0) + 1;
  });
  
  // 創建檔案類型圖表
  createFileTypeChart(fileTypes);
  
  // 創建分享趨勢圖表
  createShareTrendChart();
  
  // 更新詳細統計
  updateDetailedStats();
}

// 創建檔案類型圖表
function createFileTypeChart(fileTypes) {
  const ctx = document.getElementById('fileTypeChart').getContext('2d');
  const labels = Object.keys(fileTypes);
  const data = Object.values(fileTypes);
  const colors = [
    '#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', 
    '#9966ff', '#ff9f40', '#ff6384', '#c9cbcf'
  ];
  
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

// 創建分享趨勢圖表
function createShareTrendChart() {
  const ctx = document.getElementById('shareTrendChart').getContext('2d');
  
  // 按月份統計
  const monthlyData = {};
  fileData.allFiles.forEach(file => {
    const date = new Date(file.createdTime);
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
  });
  
  const labels = Object.keys(monthlyData).sort();
  const data = labels.map(label => monthlyData[label]);
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '檔案數量',
        data: data,
        borderColor: '#36a2eb',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// 更新詳細統計
function updateDetailedStats() {
  const stats = document.getElementById('detailed-stats');
  if (!stats) {
    console.log("detailed-stats 元素不存在，跳過詳細統計更新");
    return;
  }
  
  const totalSize = fileData.allFiles.reduce((sum, file) => sum + (parseInt(file.size) || 0), 0);
  const avgSize = totalSize / fileData.allFiles.length;
  
  const fileTypes = {};
  fileData.allFiles.forEach(file => {
    const extension = file.name.split('.').pop() || 'unknown';
    fileTypes[extension] = (fileTypes[extension] || 0) + 1;
  });
  
  const mostCommonType = Object.keys(fileTypes).reduce((a, b) => fileTypes[a] > fileTypes[b] ? a : b);
  
  stats.innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <h5>檔案統計</h5>
        <ul class="list-unstyled">
          <li><strong>總檔案數:</strong> ${fileData.allFiles.length}</li>
          <li><strong>分享給我:</strong> ${fileData.sharedWithMe.length}</li>
          <li><strong>我分享的:</strong> ${fileData.sharedByMe.length}</li>
          <li><strong>平均檔案大小:</strong> ${(avgSize / 1024 / 1024).toFixed(2)} MB</li>
        </ul>
      </div>
      <div class="col-md-6">
        <h5>檔案類型</h5>
        <ul class="list-unstyled">
          ${Object.entries(fileTypes).map(([type, count]) => 
            `<li><strong>${type}:</strong> ${count} 個檔案</li>`
          ).join('')}
        </ul>
        <p><strong>最常見類型:</strong> ${mostCommonType}</p>
      </div>
    </div>
  `;
}

// 更新個人資料頁面
function updateProfile() {
  const token = gapi.client.getToken();
  if (!token || !token.access_token) {
    document.getElementById('user-name').textContent = '未登入';
    document.getElementById('user-email').textContent = '請先登入';
    document.getElementById('user-info').textContent = '登入後可查看您的 Google 帳戶資訊';
    return;
  }
  
  // 這裡可以調用 Google People API 來獲取用戶資訊
  // 目前使用模擬資料
  document.getElementById('user-name').textContent = 'Google 用戶';
  document.getElementById('user-email').textContent = 'user@gmail.com';
  document.getElementById('user-info').textContent = '已登入 Google 帳戶';
  
  document.getElementById('display-name').value = 'Google 用戶';
  document.getElementById('email-address').value = 'user@gmail.com';
  document.getElementById('account-created').value = '2020-01-01';
  document.getElementById('last-login').value = new Date().toLocaleString();
}

// 應用篩選和搜尋
function applyFiltersAndSearch(files) {
  let filteredFiles = [...files];
  
  // 搜尋篩選
  const searchTerm = document.getElementById('file-search').value.toLowerCase();
  if (searchTerm) {
    filteredFiles = filteredFiles.filter(file => 
      file.name.toLowerCase().includes(searchTerm)
    );
  }
  
  // 時間範圍篩選
  const timeRange = document.getElementById('time-range').value;
  if (timeRange !== 'all') {
    const now = new Date();
    const filterDate = getFilterDate(now, timeRange);
    filteredFiles = filteredFiles.filter(file => 
      new Date(file.createdTime) >= filterDate
    );
  }
  
  // 檔案類型篩選
  const fileType = document.getElementById('file-type').value;
  if (fileType !== 'all') {
    filteredFiles = filteredFiles.filter(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return extension === fileType;
    });
  }
  
  // 分享權限篩選
  const sharePermission = document.getElementById('share-permission').value;
  if (sharePermission !== 'all') {
    filteredFiles = filteredFiles.filter(file => {
      // 檢查檔案的分享權限
      return checkFilePermission(file, sharePermission);
    });
  }
  
  // 排序
  const sortBy = document.getElementById('sort-by').value;
  filteredFiles.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'date':
        return new Date(b.createdTime) - new Date(a.createdTime);
      case 'size':
        return (parseInt(b.size) || 0) - (parseInt(a.size) || 0);
      default:
        return 0;
    }
  });
  
  return filteredFiles;
}

// 獲取篩選日期
function getFilterDate(now, timeRange) {
  const date = new Date(now);
  switch (timeRange) {
    case 'today':
      date.setHours(0, 0, 0, 0);
      return date;
    case 'week':
      date.setDate(date.getDate() - 7);
      return date;
    case 'month':
      date.setMonth(date.getMonth() - 1);
      return date;
    case 'year':
      date.setFullYear(date.getFullYear() - 1);
      return date;
    default:
      return new Date(0);
  }
}

// 獲取檔案圖標
function getFileIcon(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const iconMap = {
    'pdf': 'fas fa-file-pdf text-danger',
    'doc': 'fas fa-file-word text-primary',
    'docx': 'fas fa-file-word text-primary',
    'xls': 'fas fa-file-excel text-success',
    'xlsx': 'fas fa-file-excel text-success',
    'ppt': 'fas fa-file-powerpoint text-warning',
    'pptx': 'fas fa-file-powerpoint text-warning',
    'png': 'fas fa-file-image text-info',
    'jpg': 'fas fa-file-image text-info',
    'jpeg': 'fas fa-file-image text-info',
    'gif': 'fas fa-file-image text-info',
    'mp4': 'fas fa-file-video text-purple',
    'avi': 'fas fa-file-video text-purple',
    'zip': 'fas fa-file-archive text-secondary',
    'rar': 'fas fa-file-archive text-secondary'
  };
  return iconMap[extension] || 'fas fa-file text-muted';
}

// 獲取分享狀態
function getShareStatus(file) {
  if (file.permissions && file.permissions.length > 1) {
    return `已分享給 ${file.permissions.length - 1} 人`;
  }
  return '未分享';
}

// 獲取檔案年齡
function getFileAge(createdTime) {
  const now = new Date();
  const created = new Date(createdTime);
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return '今天';
  if (diffDays <= 7) return `${diffDays} 天前`;
  if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} 週前`;
  if (diffDays <= 365) return `${Math.ceil(diffDays / 30)} 個月前`;
  return `${Math.ceil(diffDays / 365)} 年前`;
}

// 清除搜尋 - 全局函數
window.clearSearch = function() {
  document.getElementById('file-search').value = '';
  // 重新載入檔案列表
  if (fileData.allFiles.length > 0) {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const files = mode === 'sharedWithMe' ? fileData.sharedWithMe : fileData.sharedByMe;
    displayFiles(files);
  }
}

// 顯示檔案列表
function displayFiles(files) {
  const filteredFiles = applyFiltersAndSearch(files);
  document.getElementById('file-count').textContent = filteredFiles.length;
  
  const fileList = document.getElementById('file-list');
  fileList.innerHTML = "<ul class='list-group'></ul>";
    const ul = fileList.querySelector("ul");

  filteredFiles.forEach((file) => {
      const li = document.createElement("li");
    li.className = "list-group-item";
    
    const fileIcon = getFileIcon(file.name);
    
      li.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div class="ms-2 me-auto">
          <div class="fw-bold">
            <i class="${fileIcon} me-2"></i>
            <a href="${file.webViewLink}" target="_blank" class="text-decoration-none">${file.name}</a>
          </div>
          <small class="text-muted">
            <i class="fas fa-calendar me-1"></i>
            建立時間：${new Date(file.createdTime).toLocaleString()}
            ${file.size ? `<br><i class="fas fa-hdd me-1"></i>大小：${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB` : ''}
            <br><i class="fas fa-share-alt me-1"></i>分享狀態：${getShareStatus(file)}
          </small>
        </div>
        <div class="text-end">
          <span class="badge bg-primary rounded-pill mb-1">${file.mimeType ? file.mimeType.split('/')[1] : 'file'}</span>
          <br>
          <small class="text-muted">${getFileAge(file.createdTime)}</small>
          <br>
          <button class="btn btn-sm btn-outline-primary mt-1" onclick="toggleFileDetails('${file.id}')">
            <i class="fas fa-chevron-down" id="chevron-${file.id}"></i> 詳細
          </button>
        </div>
      </div>
      <div class="file-details-content mt-3" id="details-${file.id}" style="display: none;">
        <div class="row">
          <div class="col-md-6">
            <h6><i class="fas fa-info-circle text-primary me-2"></i>檔案資訊</h6>
            <ul class="list-unstyled">
              <li><strong>檔案名稱：</strong>${file.name}</li>
              <li><strong>檔案大小：</strong>${file.size ? (parseInt(file.size) / 1024 / 1024).toFixed(2) + ' MB' : '未知'}</li>
              <li><strong>建立時間：</strong>${new Date(file.createdTime).toLocaleString()}</li>
              <li><strong>修改時間：</strong>${new Date(file.modifiedTime).toLocaleString()}</li>
              <li><strong>檔案類型：</strong>${file.mimeType || '未知'}</li>
              <li><strong>檔案 ID：</strong><code>${file.id}</code></li>
            </ul>
          </div>
          <div class="col-md-6">
            <h6><i class="fas fa-share-alt text-success me-2"></i>分享資訊</h6>
            <div id="share-info-${file.id}">
              <div class="text-center">
                <i class="fas fa-spinner fa-spin"></i> 載入分享資訊中...
              </div>
            </div>
          </div>
        </div>
      </div>
      `;
      ul.appendChild(li);
    });
}

// 切換檔案詳細資訊顯示
function toggleFileDetails(fileId) {
  const detailsDiv = document.getElementById(`details-${fileId}`);
  const chevronIcon = document.getElementById(`chevron-${fileId}`);
  
  if (detailsDiv.style.display === 'none') {
    detailsDiv.style.display = 'block';
    chevronIcon.className = 'fas fa-chevron-up';
    
    // 載入分享資訊
    loadFileShareInfo(fileId);
  } else {
    detailsDiv.style.display = 'none';
    chevronIcon.className = 'fas fa-chevron-down';
  }
}

// 載入檔案分享資訊
async function loadFileShareInfo(fileId) {
  const shareInfoDiv = document.getElementById(`share-info-${fileId}`);
  
  try {
    // 使用 Google Drive API 獲取檔案的分享權限
    const response = await gapi.client.drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id,type,role,emailAddress,displayName,photoLink)'
    });
    
    const permissions = response.result.permissions || [];
    
    if (permissions.length === 0) {
      shareInfoDiv.innerHTML = '<p class="text-muted">此檔案未分享給任何人</p>';
      return;
    }
    
    // 過濾掉擁有者（owner）
    const sharedPermissions = permissions.filter(p => p.role !== 'owner');
    
    if (sharedPermissions.length === 0) {
      shareInfoDiv.innerHTML = '<p class="text-muted">此檔案僅為擁有者所有</p>';
      return;
    }
    
    // 顯示分享資訊
    let shareInfoHTML = '<ul class="list-unstyled">';
    
    sharedPermissions.forEach(permission => {
      const roleText = getRoleText(permission.role);
      let userInfo, userEmail;
      
      // 處理 anyoneWithLink 特殊情況
      if (permission.id === 'anyoneWithLink' || permission.type === 'anyone') {
        userInfo = '知道連結的任何人';
        userEmail = '公開分享';
      } else {
        userInfo = permission.displayName || permission.emailAddress || '未知用戶';
        userEmail = permission.emailAddress || '無電子郵件';
      }
      
      shareInfoHTML += `
        <li class="mb-2">
          <div class="d-flex align-items-center">
            <div class="me-2">
              ${permission.photoLink ? 
                `<img src="${permission.photoLink}" class="rounded-circle" style="width: 24px; height: 24px;" alt="${userInfo}">` :
                `<i class="fas fa-user-circle text-muted" style="font-size: 24px;"></i>`
              }
            </div>
            <div>
              <div class="fw-bold">${userInfo}</div>
              <small class="text-muted">${userEmail}</small>
            </div>
            <div class="ms-auto">
              <span class="badge bg-${getRoleColor(permission.role)}">${roleText}</span>
            </div>
          </div>
        </li>
      `;
    });
    
    shareInfoHTML += '</ul>';
    shareInfoDiv.innerHTML = shareInfoHTML;
    
  } catch (error) {
    console.error('載入分享資訊失敗：', error);
    shareInfoDiv.innerHTML = `
      <div class="alert alert-warning">
        <i class="fas fa-exclamation-triangle me-2"></i>
        無法載入分享資訊：${error.message}
      </div>
    `;
  }
}

// 獲取角色文字描述
function getRoleText(role) {
  const roleMap = {
    'reader': '檢視者',
    'writer': '編輯者',
    'commenter': '評論者',
    'owner': '擁有者'
  };
  return roleMap[role] || role;
}

// 獲取角色顏色
function getRoleColor(role) {
  const colorMap = {
    'reader': 'secondary',
    'writer': 'primary',
    'commenter': 'info',
    'owner': 'success'
  };
  return colorMap[role] || 'secondary';
}

// 載入檔案權限資訊
async function loadFilePermissions(files) {
  console.log('開始載入檔案權限資訊...');
  
  for (const file of files) {
    try {
      const response = await gapi.client.drive.permissions.list({
        fileId: file.id,
        fields: 'permissions(id,type,role,emailAddress,displayName,photoLink)'
      });
      
      file.permissions = response.result.permissions || [];
      console.log(`檔案 ${file.name} 權限載入完成：`, file.permissions.length, '個權限');
    } catch (error) {
      console.warn(`無法載入檔案 ${file.name} 的權限：`, error);
      file.permissions = [];
    }
  }
  
  console.log('所有檔案權限載入完成');
}

// 檢查檔案權限
function checkFilePermission(file, targetPermission) {
  // 如果檔案沒有 permissions 資訊，嘗試從現有數據中獲取
  if (!file.permissions) {
    // 從 fileData 中查找對應的檔案
    const foundFile = fileData.allFiles.find(f => f.id === file.id);
    if (foundFile && foundFile.permissions) {
      file.permissions = foundFile.permissions;
    } else {
      return false; // 沒有權限資訊，無法判斷
    }
  }
  
  // 檢查是否有符合目標權限的分享
  return file.permissions.some(permission => {
    if (targetPermission === 'anyoneWithLink') {
      return permission.id === 'anyoneWithLink' || permission.type === 'anyone';
    } else {
      return permission.role === targetPermission;
    }
  });
}

// 批次修改權限功能
let selectedFiles = [];
let shareRecipients = [];

// 顯示批次修改模態框
function showBatchEditModal() {
  const modal = new bootstrap.Modal(document.getElementById('batchEditModal'));
  
  // 生成檔案選擇列表
  generateFileSelectionList();
  
  modal.show();
}

// 生成檔案選擇列表
function generateFileSelectionList() {
  const fileSelectionList = document.getElementById('file-selection-list');
  
  // 使用當前篩選結果的檔案，而不是全部檔案
  const files = applyFiltersAndSearch(fileData.allFiles || []);
  
  if (files.length === 0) {
    fileSelectionList.innerHTML = '<p class="text-muted text-center">沒有符合篩選條件的檔案</p>';
    return;
  }
  
  let html = '<div class="row">';
  files.forEach((file, index) => {
    const fileIcon = getFileIcon(file.name);
    html += `
      <div class="col-md-6 mb-2">
        <div class="form-check">
          <input class="form-check-input file-checkbox" type="checkbox" value="${file.id}" id="file-${index}">
          <label class="form-check-label" for="file-${index}">
            <i class="${fileIcon} me-2"></i>
            <span class="text-truncate" style="max-width: 200px;" title="${file.name}">${file.name}</span>
          </label>
        </div>
      </div>
    `;
  });
  html += '</div>';
  
  fileSelectionList.innerHTML = html;
  
  // 綁定選擇事件
  document.querySelectorAll('.file-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateSelectedFiles);
  });
}

// 更新選中的檔案
function updateSelectedFiles() {
  selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.value);
  console.log('選中的檔案：', selectedFiles);
}

// 新增分享對象
function addShareRecipient() {
  const emailInput = document.getElementById('share-email');
  const email = emailInput.value.trim();
  
  if (!email) {
    alert('請輸入電子郵件地址');
    return;
  }
  
  if (!isValidEmail(email)) {
    alert('請輸入有效的電子郵件地址');
    return;
  }
  
  if (shareRecipients.includes(email)) {
    alert('此電子郵件地址已存在');
    return;
  }
  
  shareRecipients.push(email);
  emailInput.value = '';
  updateShareRecipientsDisplay();
}

// 更新分享對象顯示
function updateShareRecipientsDisplay() {
  const recipientsDiv = document.getElementById('share-recipients');
  
  if (shareRecipients.length === 0) {
    recipientsDiv.innerHTML = '<p class="text-muted">尚未新增分享對象</p>';
    return;
  }
  
  let html = '';
  shareRecipients.forEach((email, index) => {
    html += `
      <span class="badge bg-primary me-2 mb-2">
        ${email}
        <button type="button" class="btn-close btn-close-white ms-1" onclick="removeShareRecipient(${index})" style="font-size: 0.7em;"></button>
      </span>
    `;
  });
  
  recipientsDiv.innerHTML = html;
}

// 移除分享對象
function removeShareRecipient(index) {
  shareRecipients.splice(index, 1);
  updateShareRecipientsDisplay();
}

// 驗證電子郵件格式
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 執行批次權限修改
async function executeBatchPermissionUpdate() {
  if (selectedFiles.length === 0) {
    alert('請選擇要修改的檔案');
    return;
  }
  
  if (shareRecipients.length === 0) {
    alert('請新增至少一個分享對象');
    return;
  }
  
  const role = document.getElementById('new-permission-role').value;
  const removeExisting = document.getElementById('remove-existing-permissions').checked;
  
  if (!confirm(`確定要對 ${selectedFiles.length} 個檔案執行批次權限修改嗎？\n\n新的權限：${getRoleText(role)}\n分享對象：${shareRecipients.join(', ')}\n${removeExisting ? '將移除現有權限' : '將保留現有權限'}`)) {
    return;
  }
  
  try {
    let successCount = 0;
    let errorCount = 0;
    
    for (const fileId of selectedFiles) {
      try {
        // 如果需要移除現有權限
        if (removeExisting) {
          await removeExistingPermissions(fileId);
        }
        
        // 為每個分享對象添加權限
        for (const email of shareRecipients) {
          await addFilePermission(fileId, email, role);
        }
        
        successCount++;
      } catch (error) {
        console.error(`修改檔案 ${fileId} 權限失敗：`, error);
        errorCount++;
      }
    }
    
    alert(`批次修改完成！\n成功：${successCount} 個檔案\n失敗：${errorCount} 個檔案`);
    
    // 關閉模態框
    const modal = bootstrap.Modal.getInstance(document.getElementById('batchEditModal'));
    modal.hide();
    
    // 重新載入檔案列表
    await loadAllDataAndUpdateDashboard();
    
  } catch (error) {
    console.error('批次修改失敗：', error);
    alert('批次修改失敗：' + error.message);
  }
}

// 移除檔案的現有權限（除了擁有者）
async function removeExistingPermissions(fileId) {
  const response = await gapi.client.drive.permissions.list({
    fileId: fileId,
    fields: 'permissions(id,role)'
  });
  
  const permissions = response.result.permissions || [];
  
  for (const permission of permissions) {
    if (permission.role !== 'owner') {
      try {
        await gapi.client.drive.permissions.delete({
          fileId: fileId,
          permissionId: permission.id
        });
      } catch (error) {
        console.warn(`無法移除權限 ${permission.id}：`, error);
      }
    }
  }
}

// 為檔案添加權限
async function addFilePermission(fileId, email, role) {
  await gapi.client.drive.permissions.create({
    fileId: fileId,
    resource: {
      role: role,
      type: 'user',
      emailAddress: email
    }
  });
}

// 多帳號管理功能
function initializeMultiAccountSystem() {
  // 從 localStorage 載入已授權的帳號
  loadAuthorizedAccounts();
  
  // 綁定事件 - 處理重複的 ID
  const addButtons = document.querySelectorAll('#add-account-button');
  const manageButtons = document.querySelectorAll('#manage-accounts-button');
  
  console.log('🔍 找到新增帳號按鈕數量:', addButtons.length);
  console.log('🔍 找到管理帳號按鈕數量:', manageButtons.length);
  
  addButtons.forEach((button, index) => {
    button.onclick = addNewAccount;
    console.log(`✅ 綁定新增帳號按鈕 ${index + 1}`);
  });
  
  manageButtons.forEach((button, index) => {
    button.onclick = showAccountManagement;
    console.log(`✅ 綁定管理帳號按鈕 ${index + 1}`);
  });
  
  // 綁定帳號選擇器事件
  const accountSelector = document.getElementById('account-selector');
  if (accountSelector) {
    accountSelector.addEventListener('change', (e) => {
      const selectedAccountId = e.target.value;
      if (selectedAccountId) {
        switchAccount(selectedAccountId);
      }
    });
  }
  
  // 綁定搜尋和篩選事件
  const searchInput = document.getElementById('file-search');
  const timeRangeSelect = document.getElementById('time-range');
  const fileTypeSelect = document.getElementById('file-type');
  const sortBySelect = document.getElementById('sort-by');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (fileData.allFiles.length > 0) {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const files = mode === 'sharedWithMe' ? fileData.sharedWithMe : fileData.sharedByMe;
        displayFiles(files);
      }
    });
  }
  
  if (timeRangeSelect) {
    timeRangeSelect.addEventListener('change', () => {
      if (fileData.allFiles.length > 0) {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const files = mode === 'sharedWithMe' ? fileData.sharedWithMe : fileData.sharedByMe;
        displayFiles(files);
      }
    });
  }
  
  if (fileTypeSelect) {
    fileTypeSelect.addEventListener('change', () => {
      if (fileData.allFiles.length > 0) {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const files = mode === 'sharedWithMe' ? fileData.sharedWithMe : fileData.sharedByMe;
        displayFiles(files);
      }
    });
  }
  
  if (sortBySelect) {
    sortBySelect.addEventListener('change', () => {
      if (fileData.allFiles.length > 0) {
        const mode = document.querySelector('input[name="mode"]:checked').value;
        const files = mode === 'sharedWithMe' ? fileData.sharedWithMe : fileData.sharedByMe;
        displayFiles(files);
      }
    });
  }
  
  // 更新帳號列表顯示
  updateAuthorizedAccountsDisplay();
}

// 載入已授權的帳號
function loadAuthorizedAccounts() {
  const saved = localStorage.getItem('authorizedAccounts');
  if (saved) {
    authorizedAccounts = JSON.parse(saved);
    if (authorizedAccounts.length > 0) {
      // 檢查 token 是否仍然有效
      const validAccounts = authorizedAccounts.filter(account => {
        return isTokenValid(account.accessToken);
      });
      
      if (validAccounts.length > 0) {
        currentAccount = validAccounts[0];
        // 自動設定有效的 token
        gapi.client.setToken({ access_token: currentAccount.accessToken });
        console.log(`自動登入帳號: ${currentAccount.email}`);
        // 更新顯示
        updateAuthorizedAccountsDisplay();
      } else {
        // 所有 token 都過期了，清空帳號列表
        authorizedAccounts = [];
        currentAccount = null;
        localStorage.removeItem('authorizedAccounts');
        console.log('所有授權已過期，需要重新登入');
        // 更新顯示
        updateAuthorizedAccountsDisplay();
      }
    }
  }
}

// 檢查 token 是否有效
function isTokenValid(accessToken) {
  if (!accessToken) return false;
  
  // 簡單檢查：token 長度應該大於 100 字符
  // 實際應用中應該調用 Google API 驗證 token
  return accessToken.length > 100;
}

// 驗證並刷新 token
async function validateAndRefreshToken(account) {
  try {
    // 嘗試使用 token 調用 API
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${account.accessToken}`);
    const tokenInfo = await response.json();
    
    if (tokenInfo.error) {
      console.log(`Token 已過期: ${account.email}`);
      return false;
    }
    
    console.log(`Token 仍然有效: ${account.email}`);
    return true;
  } catch (err) {
    console.log(`Token 驗證失敗: ${account.email}`, err);
    return false;
  }
}

// 儲存已授權的帳號
function saveAuthorizedAccounts() {
  localStorage.setItem('authorizedAccounts', JSON.stringify(authorizedAccounts));
}

// 新增新帳號
function addNewAccount() {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
    
    try {
      console.log("開始新增新帳號...");
      
      // 先設定 token 到 gapi client
      gapi.client.setToken(resp);
      console.log("Token 已設定到 gapi client");
      
      // 等待一下讓 token 生效
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 獲取用戶資訊
      const userInfo = await getUserInfo(resp.access_token);
      
      // 檢查是否已存在
      const existingAccount = authorizedAccounts.find(acc => acc.email === userInfo.email);
      if (existingAccount) {
        alert(`⚠️ 此帳號已經授權過了！\n帳號：${userInfo.email}\n新增時間：${new Date(existingAccount.addedAt).toLocaleString()}`);
        return;
      }
      
      // 新增新帳號
      const newAccount = {
        id: Date.now().toString(),
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0], // 如果沒有名稱，使用電子郵件前綴
        picture: userInfo.picture || 'https://via.placeholder.com/40x40?text=U', // 預設頭像
        accessToken: resp.access_token,
        addedAt: new Date().toISOString()
      };
      
      authorizedAccounts.push(newAccount);
      currentAccount = newAccount;
      saveAuthorizedAccounts();
      
      // 更新顯示
      updateAuthorizedAccountsDisplay();
      
      // 載入資料
      await loadAllDataAndUpdateDashboard();
      
      // 改善成功訊息
      const displayName = userInfo.name || userInfo.email;
      alert(`✅ 成功新增帳號：${displayName}`);
      
    } catch (err) {
      console.error("新增帳號失敗：", err);
      alert(`❌ 新增帳號失敗：${err.message}\n請檢查網路連線或重試`);
    }
  };
  
  tokenClient.requestAccessToken({ prompt: "select_account" });
}

// 獲取用戶資訊 - 使用正確的 Google API
async function getUserInfo(accessToken) {
  try {
    console.log("正在獲取用戶資訊...");
    
    // 方法1: 使用 Google Drive API 獲取用戶資訊
    try {
      const response = await gapi.client.drive.about.get({
        fields: "user(displayName,emailAddress,photoLink)"
      });
      
      if (response.result && response.result.user) {
        const user = response.result.user;
        const userInfo = {
          email: user.emailAddress,
          name: user.displayName || user.emailAddress.split('@')[0],
          picture: user.photoLink || 'https://via.placeholder.com/40x40?text=U'
        };
        console.log("用戶資訊獲取成功 (Drive API):", userInfo);
        return userInfo;
      }
    } catch (driveError) {
      console.log("Drive API 獲取用戶資訊失敗，嘗試其他方法:", driveError);
    }
    
    // 方法2: 使用 OAuth2 userinfo API
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const userInfo = await response.json();
      console.log("用戶資訊獲取成功 (OAuth2 API):", userInfo);
      
      // 確保有必要的資訊
      if (!userInfo.email) {
        throw new Error("無法獲取用戶電子郵件");
      }
      
      return {
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0],
        picture: userInfo.picture || 'https://via.placeholder.com/40x40?text=U'
      };
    } catch (oauthError) {
      console.log("OAuth2 API 獲取用戶資訊失敗:", oauthError);
    }
    
    // 方法3: 使用 token 中的資訊
    try {
      const tokenInfo = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
      const tokenData = await tokenInfo.json();
      
      if (tokenData.email) {
        const userInfo = {
          email: tokenData.email,
          name: tokenData.email.split('@')[0],
          picture: 'https://via.placeholder.com/40x40?text=U'
        };
        console.log("用戶資訊獲取成功 (Token API):", userInfo);
        return userInfo;
      }
    } catch (tokenError) {
      console.log("Token API 獲取用戶資訊失敗:", tokenError);
    }
    
    throw new Error("所有方法都無法獲取用戶資訊");
    
  } catch (error) {
    console.error("獲取用戶資訊失敗:", error);
    throw error;
  }
}

// 更新已授權帳號顯示
function updateAuthorizedAccountsDisplay() {
  // 更新側邊欄的帳號顯示
  const sidebarContainer = document.getElementById('authorized-accounts');
  if (!sidebarContainer) {
    console.error('❌ 找不到 authorized-accounts 容器');
  } else {
    updateAccountContainer(sidebarContainer, 'sidebar');
  }
  
  // 更新模態框的帳號顯示 - 使用 querySelectorAll 來處理重複 ID
  const modalContainers = document.querySelectorAll('#authorized-accounts');
  if (modalContainers.length > 1) {
    // 更新第二個容器（模態框中的）
    updateAccountContainer(modalContainers[1], 'modal');
  }
}

// 更新帳號容器的通用函數
function updateAccountContainer(container, type) {
  console.log(`🔍 更新${type}帳號顯示，當前帳號數量:`, authorizedAccounts.length);
  console.log('🔍 當前帳號:', currentAccount);
  
  container.innerHTML = '';
  
  console.log(`🔍 開始處理${type}帳號列表，數量:`, authorizedAccounts.length);
  
  authorizedAccounts.forEach((account, index) => {
    console.log(`🔍 處理${type}帳號 ${index + 1}:`, account.name, account.email);
    
    const accountDiv = document.createElement('div');
    accountDiv.className = `nav-item ${account.id === currentAccount?.id ? 'active' : ''}`;
    
    // 根據類型決定顯示內容
    if (type === 'modal') {
      // 模態框中的顯示格式
      accountDiv.innerHTML = `
        <div class="nav-link" style="padding: 8px 16px;">
          <div class="d-flex align-items-center">
            <img src="${account.picture}" class="rounded-circle me-2" width="24" height="24" alt="${account.name}">
            <div class="flex-grow-1">
              <div class="user-name" style="font-size: 12px;">${account.name}</div>
              <div class="user-status" style="font-size: 10px; opacity: 0.7;">${account.email}</div>
              <div class="user-time" style="font-size: 10px; opacity: 0.5;">新增時間: ${new Date(account.addedAt).toLocaleString()}</div>
            </div>
            <div class="d-flex gap-1">
              ${account.id === currentAccount?.id ? '<span class="badge bg-primary">當前</span>' : ''}
              <button class="btn btn-sm btn-outline-danger" onclick="removeAccount('${account.id}')" style="padding: 2px 6px;">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      // 側邊欄中的顯示格式
      accountDiv.innerHTML = `
        <div class="nav-link" style="padding: 8px 16px;">
          <div class="d-flex align-items-center">
            <img src="${account.picture}" class="rounded-circle me-2" width="24" height="24" alt="${account.name}">
            <div class="flex-grow-1">
              <div class="user-name" style="font-size: 12px;">${account.name}</div>
              <div class="user-status" style="font-size: 10px; opacity: 0.7;">${account.email}</div>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeAccount('${account.id}')" style="padding: 2px 6px;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      `;
    }
    
    // 點擊切換帳號
    accountDiv.onclick = () => switchAccount(account.id);
    container.appendChild(accountDiv);
    
    console.log(`✅ ${type}帳號 ${index + 1} 已新增到容器`);
  });
  
  console.log(`🔍 ${type}容器最終子元素數量:`, container.children.length);
  
  // 更新檔案頁面的帳號選擇器
  updateAccountSelector();
}

// 更新帳號選擇器
function updateAccountSelector() {
  const accountSelector = document.getElementById('account-selector');
  if (!accountSelector) return;
  
  // 清空現有選項
  accountSelector.innerHTML = '<option value="">請選擇帳號...</option>';
  
  // 新增已授權的帳號
  authorizedAccounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.name} (${account.email})`;
    if (account.id === currentAccount?.id) {
      option.selected = true;
    }
    accountSelector.appendChild(option);
  });
}

// 切換帳號
async function switchAccount(accountId) {
  const account = authorizedAccounts.find(acc => acc.id === accountId);
  if (!account) return;
  
  currentAccount = account;
  
  // 設定 token
  gapi.client.setToken({ access_token: account.accessToken });
  
  // 更新顯示
  updateAuthorizedAccountsDisplay();
  
  // 載入資料
  await loadAllDataAndUpdateDashboard();
}

// 移除帳號 - 全局函數
window.removeAccount = function(accountId) {
  if (confirm('確定要移除這個帳號嗎？')) {
    authorizedAccounts = authorizedAccounts.filter(acc => acc.id !== accountId);
    
    if (currentAccount?.id === accountId) {
      currentAccount = authorizedAccounts.length > 0 ? authorizedAccounts[0] : null;
    }
    
    saveAuthorizedAccounts();
    updateAuthorizedAccountsDisplay();
    
    if (currentAccount) {
      gapi.client.setToken({ access_token: currentAccount.accessToken });
      loadAllDataAndUpdateDashboard();
    } else {
      // 沒有帳號了，清空資料
      fileData = { sharedWithMe: [], sharedByMe: [], allFiles: [] };
      updateDashboard();
    }
  }
}

// 顯示帳號管理
function showAccountManagement() {
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">帳號管理</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <h6>已授權的帳號 (${authorizedAccounts.length})</h6>
            <div class="list-group">
              ${authorizedAccounts.map(account => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                  <div class="d-flex align-items-center">
                    <img src="${account.picture}" class="rounded-circle me-3" width="40" height="40">
                    <div>
                      <div class="fw-bold">${account.name}</div>
                      <small class="text-muted">${account.email}</small>
                      <br><small class="text-muted">新增時間：${new Date(account.addedAt).toLocaleString()}</small>
                    </div>
                  </div>
                  <div>
                    ${account.id === currentAccount?.id ? '<span class="badge bg-success">當前</span>' : ''}
                    <button class="btn btn-sm btn-outline-danger ms-2" onclick="removeAccount('${account.id}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="text-center">
            <button class="btn btn-primary" onclick="addNewAccount()">
              <i class="fas fa-plus me-1"></i>新增新帳號
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
  
  modal.addEventListener('hidden.bs.modal', () => {
    document.body.removeChild(modal);
  });
}

// 清除所有本機資料 - 全局函數
window.clearAllData = function() {
  if (confirm('⚠️ 確定要清除所有本機資料嗎？\n\n這將包括：\n- 所有綁定的 Google 帳號\n- 所有檔案資料\n- 所有設定\n\n此操作無法復原！')) {
    // 清除 localStorage
    localStorage.removeItem('authorizedAccounts');
    
    // 重置全局變數
    authorizedAccounts = [];
    currentAccount = null;
    fileData = {
      sharedWithMe: [],
      sharedByMe: [],
      allFiles: []
    };
    
    // 清除 gapi token
    if (gapi.client.getToken()) {
      gapi.client.setToken(null);
    }
    
    // 更新顯示
    updateAuthorizedAccountsDisplay();
    updateDashboard();
    
    // 顯示成功訊息
    alert('✅ 所有本機資料已清除！\n\n頁面將重新載入以確保完全重置。');
    
    // 重新載入頁面
    setTimeout(() => {
      location.reload();
    }, 1000);
  }
};

// 測試 API 連接 - 全局函數
window.testAPIConnection = async function() {
  try {
    console.log("測試 API 連接...");
    const response = await gapi.client.drive.files.list({
      pageSize: 5,
      q: "trashed = false",
      fields: "files(id, name)"
    });
    console.log("API 測試成功：", response);
    return true;
  } catch (err) {
    console.error("API 測試失敗：", err);
    return false;
  }
}

// 調試功能 - 全局函數
window.toggleDebugInfo = function() {
  const debugInfo = document.getElementById('debug-info');
  debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
  updateDebugInfo();
}

function updateDebugInfo() {
  const apiStatus = document.getElementById('api-status');
  const loginStatus = document.getElementById('login-status');
  const scopeStatus = document.getElementById('scope-status');
  const fileDataStatus = document.getElementById('file-data-status');
  
  // API 狀態
  if (gapiInited && gisInited) {
    apiStatus.textContent = '已初始化';
    apiStatus.className = 'text-success';
  } else {
    apiStatus.textContent = '初始化中...';
    apiStatus.className = 'text-warning';
  }
  
  // 登入狀態
  const token = gapi.client.getToken();
  if (token && token.access_token) {
    loginStatus.textContent = '已登入';
    loginStatus.className = 'text-success';
  } else {
    loginStatus.textContent = '未登入';
    loginStatus.className = 'text-danger';
  }
  
  // 權限範圍
  scopeStatus.textContent = SCOPES;
  scopeStatus.className = 'text-info';
  
  // 檔案資料
  const totalFiles = fileData.allFiles.length;
  const sharedWithMe = fileData.sharedWithMe.length;
  const sharedByMe = fileData.sharedByMe.length;
  fileDataStatus.textContent = `總計: ${totalFiles}, 分享給我: ${sharedWithMe}, 我分享: ${sharedByMe}`;
  fileDataStatus.className = totalFiles > 0 ? 'text-success' : 'text-muted';
}

// 初始化 Google API 和身份驗證
window.onload = () => {
    console.log("🚀 DashboardKit 初始化開始 - 版本 20250108h (個人版)");
    
    // 首先初始化憑證
    if (!initializeCredentials()) {
      console.error("❌ 憑證初始化失敗，停止初始化");
      return;
    }
    
    console.log("✅ showPage 函數已定義:", typeof window.showPage);
    console.log("✅ 元素檢查:", {
      signinButton: !!signinButton,
      signoutButton: !!signoutButton,
      loadFilesButton: !!loadFilesButton,
      fileList: !!fileList
    });
    
    gapiLoaded();
    gisLoaded();
  
    // 初始化多帳號系統
    setTimeout(() => {
      initializeMultiAccountSystem();
    }, 1000);
    
    // 初始化圖表
    setTimeout(() => {
      createCharts();
    }, 500);
    
    // 顯示調試面板
    setTimeout(() => {
      document.getElementById('debug-panel').style.display = 'block';
      updateDebugInfo();
    }, 2000);
  
    // 檢查登入狀態並自動載入資料
    setTimeout(async () => {
      if (currentAccount) {
        console.log(`檢測到已授權帳號: ${currentAccount.email}`);
        // 驗證 token 有效性
        const isValid = await validateAndRefreshToken(currentAccount);
        if (isValid) {
          // 有有效的已授權帳號，自動載入資料
          gapi.client.setToken({ access_token: currentAccount.accessToken });
          await loadAllDataAndUpdateDashboard();
          console.log('自動載入資料完成');
      } else {
          // Token 過期，移除該帳號
          removeAccount(currentAccount.id);
          console.log('Token 已過期，已移除帳號');
        }
      } else {
        console.log('沒有已授權的帳號，需要手動登入');
      }
      updateDebugInfo();
    }, 2000); // 等待 GAPI 初始化完畢
  };
  
