/* ============================================
   ui.js - UI 控制器
   负责所有DOM渲染、交互事件、动画效果
   ============================================ */

class UIController {
  constructor() {
    // DOM 引用缓存
    this.els = {
      commandInput: document.getElementById('commandInput'),
      sendBtn: document.getElementById('sendBtn'),
      reasoningLog: document.getElementById('reasoningLog'),
      executionLog: document.getElementById('executionLog'),
      deviceGrid: document.getElementById('deviceGrid'),
      systemStatus: document.getElementById('systemStatus'),
      
      // 统计
      accuracyRate: document.getElementById('accuracyRate'),
      execCount: document.getElementById('execCount'),
      avgTime: document.getElementById('avgTime'),
      successFail: document.getElementById('successFail'),
      successCount: document.getElementById('successCount'),
      failCount: document.getElementById('failCount'),
      tokenCost: document.getElementById('tokenCost'),
      deviceCount: document.getElementById('deviceCount'),

      // 流水线节点
      intentNode: document.getElementById('intentNode'),
      schedulerNode: document.getElementById('schedulerNode'),
      verifierNode: document.getElementById('verifierNode'),
      intentTimer: document.getElementById('intentTimer'),
      schedulerTimer: document.getElementById('schedulerTimer'),
      verifierTimer: document.getElementById('verifierTimer')
    };

    this._init();
  }

  _init() {
    // 渲染设备面板
    this.renderDevices();

    // 绑定输入框事件
    this.els.commandInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSend();
    });
    
    this.els.sendBtn.addEventListener('click', () => this.handleSend());

    // 快捷指令按钮
    document.querySelectorAll('.quick-cmd').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd) {
          this.els.commandInput.value = cmd;
          this.handleSend();
        }
      });
    });

    // 连接编排器回调
    orchestrator.onStateChange = (state) => this.onSystemStateChange(state);
    orchestrator.onReasoningLog = (log) => this.addReasoningEntry(log);
    orchestrator.onExecutionResult = (result) => this.addExecutionEntry(result);

    console.log('[UI] UIController 初始化完成');
  }

  /** 处理发送指令 */
  handleSend() {
    const input = this.els.commandInput.value.trim();
    if (!input || orchestrator.state.isRunning) return;

    // 清空输入
    this.els.commandInput.value = '';
    
    // 禁用发送按钮（防重复提交）
    this.els.sendBtn.disabled = true;

    // 记录节点开始时间
    const nodeTimers = {};
    ['intent', 'scheduler', 'verifier'].forEach(phase => {
      nodeTimers[phase] = performance.now();
    });

    // 执行并更新计时器
    orchestrator.execute(input).then(result => {
      this.els.sendBtn.disabled = false;
      this.refreshStats();
      
      // 滚动日志到底部
      this.scrollToBottom(this.els.reasoningLog);
    }).catch(err => {
      this.els.sendBtn.disabled = false;
      console.error('[UI] 执行出错:', err);
    });
  }

  /** 渲染设备网格 */
  renderDevices() {
    const devices = deviceManager.getOnlineDevices();
    this.els.deviceCount.textContent = devices.length;

    const html = devices.map(device => {
      const catInfo = DEVICE_CATEGORIES[device.type];
      const statusClass = device.online ? 'online' : 'offline';
      
      return `
        <div class="device-card" id="dev-${device.id}" data-device-id="${device.id}">
          <div class="device-icon">${catInfo?.icon || '&#128187;'}</div>
          <div class="device-info">
            <div class="device-name">${device.name}</div>
            <div class="device-room">&#128205; ${device.room} · ${catInfo?.name || ''}</div>
          </div>
          <div class="device-status-dot ${statusClass}"></div>
        </div>
      `;
    }).join('');

    this.els.deviceGrid.innerHTML = html;

    // 监听设备状态变化
    deviceManager.on('actionExecuted', (data) => {
      this.highlightDevice(data.deviceId);
    });
  }

  /** 高亮正在操作的设备 */
  highlightDevice(deviceId) {
    const card = document.getElementById(`dev-${deviceId}`);
    if (!card) return;

    // 移除其他设备的执行态
    document.querySelectorAll('.device-card.executing').forEach(el => {
      el.classList.remove('executing');
    });

    // 标记当前设备为执行中
    card.classList.add('executing');
    setTimeout(() => {
      card.classList.remove('executing');
      // 如果设备当前是开启状态，标记为active
      const dev = deviceManager.getById(deviceId);
      if (dev && dev.status.power) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    }, 1500);
  }

  /** 添加推理日志条目 */
  addReasoningEntry(log) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.type}`;
    entry.innerHTML = `
      <span class="log-time">${log.timestamp}</span>
      <span class="log-msg">${log.message}</span>
    `;
    
    this.els.reasoningLog.appendChild(entry);
    this.scrollToBottom(this.els.reasoningLog);

    // 自动滚动到最新
    if (this.els.reasoningLog.children.length > 50) {
      // 限制最大日志数量防止卡顿
      this.els.reasoningLog.removeChild(this.els.reasoningLog.firstChild);
    }
  }

  /** 添加执行结果条目 */
  addExecutionEntry(result) {
    // 清除初始的"暂无记录"提示
    const idleEntry = this.els.executionLog.querySelector('.exec-entry.idle');
    if (idleEntry) idleEntry.remove();

    let statusClass = result.success ? 'success' : 'fail';
    let icon = result.success ? '&#9989;' : '&#10060;';

    const entry = document.createElement('div');
    entry.className = `exec-entry ${statusClass}`;
    entry.innerHTML = `<span class="exec-icon">${icon}</span><span>${result.desc}: ${result.detail}</span>`;

    this.els.executionLog.insertBefore(entry, this.els.executionLog.firstChild);

    // 限制显示数量
    while (this.els.executionLog.children.length > 30) {
      this.els.executionLog.removeChild(this.els.executionLog.lastChild);
    }
  }

  /** 系统状态变更 */
  onSystemStateChange(state) {
    const dot = document.querySelector('.status-dot');
    const statusText = this.els.systemStatus;

    dot.className = `status-dot ${state.status}`;
    statusText.textContent = state.message;
  }

  /** 刷新统计数据 */
  refreshStats() {
    const snapshot = orchestrator.getStatsSnapshot();

    this.animateValue(this.els.accuracyRate, snapshot.accuracyRate + '%');
    this.animateValue(this.els.execCount, snapshot.execCount);
    this.animateValue(this.els.avgTime, snapshot.avgTime);
    this.animateValue(this.els.successFail, snapshot.successFail);
    this.animateValue(this.els.successCount, snapshot.successFail.split('/')[0]);
    this.animateValue(this.els.failCount, snapshot.successFail.split('/')[1]);
    this.animateValue(this.els.tokenCost, snapshot.tokenCost);
  }

  /** 数值动画效果 */
  animateValue(element, newValue) {
    if (!element) return;
    
    element.style.transform = 'scale(1.2)';
    element.style.transition = 'transform 0.15s ease';
    element.textContent = newValue;

    requestAnimationFrame(() => {
      element.style.transform = 'scale(1)';
    });
  }

  /** 滚动容器到底部 */
  scrollToBottom(container) {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

// 全局实例
let uiController;
