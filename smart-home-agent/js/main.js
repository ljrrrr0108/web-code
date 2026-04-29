/* ============================================
   main.js - 应用入口
   初始化所有模块，启动系统
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  console.log('=============================================');
  console.log('  MINO SmartHome Multi-Agent System v2.0');
  console.log('  基于长链推理 + 多Agent协作架构');
  console.log('=============================================');

  // 初始化 UI 控制器
  uiController = new UIController();

  // 系统就绪提示
  setTimeout(() => {
    const logContainer = document.getElementById('reasoningLog');
    if (logContainer) {
      const readyEntry = document.createElement('div');
      readyEntry.className = 'log-entry system';
      const now = new Date().toLocaleTimeString('zh-CN');
      readyEntry.innerHTML = `
        <span class="log-time">${now}</span>
        <span class="log-msg">&#128640; <strong>系统初始化完成</strong> | 已连接 ${deviceManager.getOnlineDevices().length} 台设备 | 三层Agent就绪 | 点击下方快捷按钮或输入自然语言指令开始体验</span>
      `;
      
      // 替换初始的"等待"消息
      if (logContainer.children.length > 0) {
        logContainer.replaceChild(readyEntry, logContainer.children[0]);
      } else {
        logContainer.appendChild(readyEntry);
      }
    }

    console.log('[System] 所有模块加载完成，系统运行中');
  }, 300);

  // 欢迎动画：依次点亮设备卡片
  const deviceCards = document.querySelectorAll('.device-card');
  deviceCards.forEach((card, idx) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    card.style.transition = `opacity 0.3s ease ${idx * 60}ms, transform 0.3s ease ${idx * 60}ms`;
    
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });

  // 快捷指令按钮入场动画
  const quickBtns = document.querySelectorAll('.quick-cmd');
  quickBtns.forEach((btn, idx) => {
    btn.style.opacity = '0';
    btn.style.transform = 'scale(0.9)';
    btn.style.transition = `opacity 0.25s ease ${400 + idx * 50}ms, transform 0.25s ease ${400 + idx * 50}ms`;
    
    requestAnimationFrame(() => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1)';
    });
  });
});
