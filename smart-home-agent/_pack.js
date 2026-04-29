const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Use built-in PowerShell via full path
try {
  const src = 'C:\\Users\\ljrrrrrr\\smart-home-agent';
  const dst = 'C:\\Users\\ljrrrrrr\\Desktop\\smart-home-agent-v2.zip';
  
  // Remove existing zip if any
  if (fs.existsSync(dst)) fs.unlinkSync(dst);
  
  // Create zip
  const cmd = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${src}\\*' -DestinationPath '${dst}' -Force"`;
  console.log(`Running: ${cmd}`);
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
  console.log('Result:', result);
  console.log('ZIP created at:', dst);
} catch(e) {
  console.error('Error:', e.message);
}
