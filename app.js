const CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com"; // 用你的 GCP OAuth 2.0 網頁 client_id 替換
const API_KEY = "";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.metadata.readonly";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentPage = 'dashboard';
let fileData = {
  sharedWithMe: [],
  sharedByMe: [],
  allFiles: []
};

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
    let files = [];

    if (mode === "sharedWithMe") {
      const response = await gapi.client.drive.files.list({
        pageSize: 100,
        q: "sharedWithMe",
        fields: "files(id, name, webViewLink, createdTime, permissions, size)"
      });
      files = response.result.files;
      fileData.sharedWithMe = files;
    }

    if (mode === "sharedByMe") {
      const response = await gapi.client.drive.files.list({
        pageSize: 100,
        q: "trashed = false",
        fields: "files(id, name, webViewLink, createdTime, permissions, owners, size)"
      });
      files = response.result.files.filter(file =>
        file.permissions && file.permissions.some(p => p.role !== "owner")
      );
      fileData.sharedByMe = files;
    }

    // 更新所有檔案列表
    fileData.allFiles = [...fileData.sharedWithMe, ...fileData.sharedByMe];

    if (!files || files.length === 0) {
      fileList.innerHTML = "<p>⚠️ 沒有找到符合的分享檔案。</p>";
      return;
    }

    fileList.innerHTML = "<ul></ul>";
    const ul = fileList.querySelector("ul");

    files.forEach((file) => {
      const li = document.createElement("li");
      li.innerHTML = `
        📄 <a href="${file.webViewLink}" target="_blank">${file.name}</a>
        <small>建立時間：${new Date(file.createdTime).toLocaleString()}</small>
      `;
      ul.appendChild(li);
    });

    // 更新儀表板數據
    updateDashboard();

  } catch (err) {
    console.error("載入檔案失敗：", err);
    const message = err.result?.error?.message || "未知錯誤";
    fileList.innerHTML = `<p>⚠️ 發生錯誤：${message}</p>`;
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
    
    // 載入分享給我的檔案
    const sharedWithMeResponse = await gapi.client.drive.files.list({
      pageSize: 100,
      q: "sharedWithMe",
      fields: "files(id, name, webViewLink, createdTime, permissions, size)"
    });
    fileData.sharedWithMe = sharedWithMeResponse.result.files || [];
    
    // 載入我分享的檔案
    const sharedByMeResponse = await gapi.client.drive.files.list({
      pageSize: 100,
      q: "trashed = false",
      fields: "files(id, name, webViewLink, createdTime, permissions, owners, size)"
    });
    fileData.sharedByMe = (sharedByMeResponse.result.files || []).filter(file =>
      file.permissions && file.permissions.some(p => p.role !== "owner")
    );
    
    // 合併所有檔案
    fileData.allFiles = [...fileData.sharedWithMe, ...fileData.sharedByMe];
    
    // 更新 Dashboard
    updateDashboard();
    
    // 更新數據狀態提示
    dataStatusText.innerHTML = '<i class="fas fa-check-circle me-1"></i>數據已載入完成';
    
    // 3秒後隱藏提示
    setTimeout(() => {
      dataStatusText.innerHTML = '<i class="fas fa-info-circle me-1"></i>數據已同步';
    }, 3000);
    
  } catch (err) {
    console.error("載入數據失敗：", err);
    const dataStatusText = document.getElementById('data-status-text');
    dataStatusText.innerHTML = '<i class="fas fa-exclamation-triangle me-1"></i>載入數據失敗';
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
  // 轉換率圖表
  const conversionCtx = document.getElementById('conversionChart');
  if (conversionCtx) {
    new Chart(conversionCtx, {
      type: 'line',
      data: {
        labels: ['10', '15', '13', '18', '22', '25', '28'],
        datasets: [{
          label: '轉換率',
          data: [45, 52, 48, 61, 55, 67, 53.94],
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
            display: false
          },
          y: {
            display: false
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

  // 訂單圖表
  const ordersCtx = document.getElementById('ordersChart');
  if (ordersCtx) {
    new Chart(ordersCtx, {
      type: 'bar',
      data: {
        labels: ['May', 'June', 'July', 'August', 'September'],
        datasets: [{
          label: '訂單數量',
          data: [130, 251, 180, 320, 1432],
          backgroundColor: '#6366f1',
          borderColor: '#6366f1',
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
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
            display: false
          },
          y: {
            display: false
          }
        }
      }
    });
  }
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
        <td><i class="tim-icons icon-paper text-info"></i></td>
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
  if (fileData.allFiles.length === 0) {
    document.getElementById('detailed-stats').innerHTML = '<p class="text-muted">請先載入檔案以查看統計資訊</p>';
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

// 初始化 Google API 和身份驗證
window.onload = () => {
    gapiLoaded();
    gisLoaded();
    
    // 初始化圖表
    setTimeout(() => {
      createCharts();
    }, 500);
  
    // 檢查登入狀態，自動顯示登入/登出按鈕
    setTimeout(() => {
      const token = gapi.client.getToken();
      if (token && token.access_token) {
        // 已登入
        updateSidebarUserStatus(true);
        // 自動載入數據
        loadAllDataAndUpdateDashboard();
      } else {
        // 未登入
        updateSidebarUserStatus(false);
      }
    }, 1000); // 等待 GAPI 初始化完畢
  };
  
