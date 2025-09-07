const CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com"; // 用你的 GCP OAuth 2.0 網頁 client_id 替換
const API_KEY = ""; // 如果需要 API Key，請在這裡填入
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly";

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
    signinButton.disabled = false;
  }
}

signinButton.onclick = () => {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
    
    // 設置 token 到 gapi client
    gapi.client.setToken(resp);
    
    // 更新側邊欄用戶狀態
    updateSidebarUserStatus(true);
    
    // 自動載入數據並更新 Dashboard
    await loadAllDataAndUpdateDashboard();
  };
  tokenClient.requestAccessToken({ prompt: "" });
};

signoutButton.onclick = () => {
  google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
    // 更新側邊欄用戶狀態
    updateSidebarUserStatus(false);
    
    // 清空數據
    fileData = {
      sharedWithMe: [],
      sharedByMe: [],
      allFiles: []
    };
    
    // 重置 Dashboard 數據
    resetDashboardData();
    
    fileList.innerHTML = "";
    gapi.client.setToken(null);
  });
};

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
        fields: "files(id, name, webViewLink, createdTime, permissions, size, mimeType)"
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
        fields: "files(id, name, webViewLink, createdTime, permissions, owners, size, mimeType)"
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
    
    // 更新檔案計數
    document.getElementById('file-count').textContent = filteredFiles.length;
    
    fileList.innerHTML = "<ul class='list-group'></ul>";
    const ul = fileList.querySelector("ul");

    filteredFiles.forEach((file) => {
      const li = document.createElement("li");
      li.className = "list-group-item d-flex justify-content-between align-items-start";
      
      // 獲取檔案圖標
      const fileIcon = getFileIcon(file.name);
      
      li.innerHTML = `
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
        </div>
      `;
      ul.appendChild(li);
    });

    // 更新儀表板數據
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

// 載入所有數據並更新 Dashboard
async function loadAllDataAndUpdateDashboard() {
  try {
    // 更新數據狀態提示
    const dataStatusText = document.getElementById('data-status-text');
    dataStatusText.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>正在載入數據...';
    
    console.log("開始自動載入 Dashboard 數據...");
    
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
    
    // 更新數據狀態提示
    dataStatusText.innerHTML = `<i class="fas fa-check-circle me-1"></i>數據已載入完成 (${fileData.allFiles.length} 個檔案)`;
    
    // 3秒後隱藏提示
    setTimeout(() => {
      dataStatusText.innerHTML = '<i class="fas fa-info-circle me-1"></i>數據已同步';
    }, 3000);
    
  } catch (err) {
    console.error("載入數據失敗：", err);
    console.error("錯誤詳情：", err.result);
    
    const dataStatusText = document.getElementById('data-status-text');
    let errorMsg = "載入數據失敗";
    
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

// 重置 Dashboard 數據
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
  if (dataStatusText) dataStatusText.innerHTML = '<i class="fas fa-info-circle me-1"></i>登入後將顯示真實數據';
}

// 頁面切換功能
function showPage(pageName) {
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
  // 分享趨勢圖表 (基於真實數據)
  const conversionCtx = document.getElementById('conversionChart');
  if (conversionCtx) {
    // 銷毀已存在的圖表
    if (window.conversionChart) {
      window.conversionChart.destroy();
    }
    
    // 計算分享趨勢數據
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

  // 檔案類型分佈圖表
  const ordersCtx = document.getElementById('ordersChart');
  if (ordersCtx) {
    // 銷毀已存在的圖表
    if (window.ordersChart) {
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
}

// 計算分享趨勢數據
function calculateShareTrend() {
  if (fileData.allFiles.length === 0) {
    return { labels: ['無數據'], data: [0] };
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
  const labels = sortedMonths.map(month => {
    const [year, month] = month.split('-');
    return `${year}年${month}月`;
  });
  const data = sortedMonths.map(month => monthlyData[month]);
  
  return { labels, data };
}

// 計算檔案類型分佈
function calculateFileTypeDistribution() {
  if (fileData.allFiles.length === 0) {
    return { labels: ['無數據'], data: [0] };
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

// 更新儀表板數據
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
  
  // 更新統計卡片 - 映射到有意義的數據
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

// 更新額外的統計數據
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
  // 目前使用模擬數據
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

// 清除搜尋
function clearSearch() {
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
    li.className = "list-group-item d-flex justify-content-between align-items-start";
    
    const fileIcon = getFileIcon(file.name);
    
    li.innerHTML = `
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
      </div>
    `;
    ul.appendChild(li);
  });
}

// 多帳號管理功能
function initializeMultiAccountSystem() {
  // 從 localStorage 載入已授權的帳號
  loadAuthorizedAccounts();
  
  // 綁定事件
  document.getElementById('add-account-button').onclick = addNewAccount;
  document.getElementById('manage-accounts-button').onclick = showAccountManagement;
  
  // 更新帳號列表顯示
  updateAuthorizedAccountsDisplay();
}

// 載入已授權的帳號
function loadAuthorizedAccounts() {
  const saved = localStorage.getItem('authorizedAccounts');
  if (saved) {
    authorizedAccounts = JSON.parse(saved);
    if (authorizedAccounts.length > 0) {
      currentAccount = authorizedAccounts[0];
    }
  }
}

// 儲存已授權的帳號
function saveAuthorizedAccounts() {
  localStorage.setItem('authorizedAccounts', JSON.stringify(authorizedAccounts));
}

// 添加新帳號
function addNewAccount() {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
    
    try {
      // 獲取用戶資訊
      const userInfo = await getUserInfo(resp.access_token);
      
      // 檢查是否已存在
      const existingAccount = authorizedAccounts.find(acc => acc.email === userInfo.email);
      if (existingAccount) {
        alert('此帳號已經授權過了！');
        return;
      }
      
      // 添加新帳號
      const newAccount = {
        id: Date.now().toString(),
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        accessToken: resp.access_token,
        addedAt: new Date().toISOString()
      };
      
      authorizedAccounts.push(newAccount);
      currentAccount = newAccount;
      saveAuthorizedAccounts();
      
      // 更新顯示
      updateAuthorizedAccountsDisplay();
      
      // 載入數據
      await loadAllDataAndUpdateDashboard();
      
      alert(`成功添加帳號：${userInfo.email}`);
      
    } catch (err) {
      console.error("添加帳號失敗：", err);
      alert("添加帳號失敗，請重試");
    }
  };
  
  tokenClient.requestAccessToken({ prompt: "select_account" });
}

// 獲取用戶資訊
async function getUserInfo(accessToken) {
  const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
  return await response.json();
}

// 更新已授權帳號顯示
function updateAuthorizedAccountsDisplay() {
  const container = document.getElementById('authorized-accounts');
  container.innerHTML = '';
  
  authorizedAccounts.forEach(account => {
    const accountDiv = document.createElement('div');
    accountDiv.className = `nav-item ${account.id === currentAccount?.id ? 'active' : ''}`;
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
    
    // 點擊切換帳號
    accountDiv.onclick = () => switchAccount(account.id);
    container.appendChild(accountDiv);
  });
}

// 切換帳號
async function switchAccount(accountId) {
  const account = authorizedAccounts.find(acc => acc.id === accountId);
  if (!account) return;
  
  currentAccount = account;
  
  // 設置 token
  gapi.client.setToken({ access_token: account.accessToken });
  
  // 更新顯示
  updateAuthorizedAccountsDisplay();
  
  // 載入數據
  await loadAllDataAndUpdateDashboard();
}

// 移除帳號
function removeAccount(accountId) {
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
      // 沒有帳號了，清空數據
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
                      <br><small class="text-muted">添加時間：${new Date(account.addedAt).toLocaleString()}</small>
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
              <i class="fas fa-plus me-1"></i>添加新帳號
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

// 測試 API 連接
async function testAPIConnection() {
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

// 調試功能
function toggleDebugInfo() {
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
  
  // 檔案數據
  const totalFiles = fileData.allFiles.length;
  const sharedWithMe = fileData.sharedWithMe.length;
  const sharedByMe = fileData.sharedByMe.length;
  fileDataStatus.textContent = `總計: ${totalFiles}, 分享給我: ${sharedWithMe}, 我分享: ${sharedByMe}`;
  fileDataStatus.className = totalFiles > 0 ? 'text-success' : 'text-muted';
}

// 初始化 Google API 和身份驗證
window.onload = () => {
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
  
    // 檢查登入狀態
    setTimeout(() => {
      if (currentAccount) {
        // 有已授權的帳號，自動載入數據
        gapi.client.setToken({ access_token: currentAccount.accessToken });
        loadAllDataAndUpdateDashboard();
      }
      updateDebugInfo();
    }, 1500); // 等待 GAPI 初始化完畢
  };
  
