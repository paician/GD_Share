#!/usr/bin/env node

// Cloudflare Pages 構建腳本 (Node.js 版本)
// 這個腳本會在構建時替換環境變數

const fs = require('fs');
const path = require('path');

console.log('🚀 開始構建 DashboardKit...');

try {
  // 讀取 config.js
  const configPath = path.join(__dirname, 'config.js');
  let configContent = fs.readFileSync(configPath, 'utf8');
  
  // 替換環境變數
  if (process.env.GOOGLE_CLIENT_ID) {
    console.log('✅ 替換 GOOGLE_CLIENT_ID');
    configContent = configContent.replace(/{{GOOGLE_CLIENT_ID}}/g, process.env.GOOGLE_CLIENT_ID);
  } else {
    console.log('⚠️  GOOGLE_CLIENT_ID 環境變數未設置');
  }
  
  if (process.env.GOOGLE_API_KEY) {
    console.log('✅ 替換 GOOGLE_API_KEY');
    configContent = configContent.replace(/{{GOOGLE_API_KEY}}/g, process.env.GOOGLE_API_KEY);
  } else {
    console.log('⚠️  GOOGLE_API_KEY 環境變數未設置');
  }
  
  // 寫回 config.js
  fs.writeFileSync(configPath, configContent);
  
  console.log('🎉 構建完成！');
  console.log('📁 檔案已更新:', configPath);
  
} catch (error) {
  console.error('❌ 構建失敗:', error.message);
  process.exit(1);
}