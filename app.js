const CLIENT_ID = "799708745031-5j43u590lpnds963sdcknchqicbod3bn.apps.googleusercontent.com"; // 用你的 GCP OAuth 2.0 網頁 client_id 替換
const API_KEY = "";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.metadata.readonly";

let tokenClient;
let gapiInited = false;
let gisInited = false;

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
    signinButton.style.display = "none";
    signoutButton.style.display = "inline-block";
  };
  tokenClient.requestAccessToken({ prompt: "consent" });
};

signoutButton.onclick = () => {
  google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {
    signinButton.style.display = "inline-block";
    signoutButton.style.display = "none";
    fileList.innerHTML = "";
  });
};

loadFilesButton.onclick = async () => {
  try {
    const response = await gapi.client.drive.files.list({
      pageSize: 100,
      fields: "files(id, name, webViewLink, createdTime, permissions, owners)",
      q: "trashed = false"
    });

    const files = response.result.files;

    if (!files || files.length === 0) {
      fileList.innerHTML = "<p>目前沒有檔案。</p>";
      return;
    }

    const sharedFiles = files.filter(file =>
      file.permissions && file.permissions.some(p => p.role === "reader" || p.role === "commenter" || p.role === "writer")
    );

    if (sharedFiles.length === 0) {
      fileList.innerHTML = "<p>目前沒有您分享的檔案。</p>";
      return;
    }

    fileList.innerHTML = "<ul></ul>";
    const ul = fileList.querySelector("ul");

    sharedFiles.forEach((file) => {
      const li = document.createElement("li");
      li.innerHTML = `
        📄 <a href="${file.webViewLink}" target="_blank">${file.name}</a><br/>
        <small>建立時間：${new Date(file.createdTime).toLocaleString()}</small>
      `;
      ul.appendChild(li);
    });

  } catch (err) {
    console.error("載入檔案失敗：", err);
    const message = err.result?.error?.message || "未知錯誤";
    fileList.innerHTML = `<p>⚠️ 發生錯誤：${message}</p>`;
  }
};


  
  

// 初始化 Google API 和身份驗證
window.onload = () => {
  gapiLoaded();
  gisLoaded();
};


