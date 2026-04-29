/* ============================================
   orchestrator.js - 主控编排器（Orchestrator）
   核心功能：多Agent协作调度、数据流管理、异常处理
   ============================================ */

/**
 * Orchestrator - 多Agent编排协调器
 *
 * 架构设计：
 *   用户输入 → [意图解析Agent] → 子任务链
 *            → [设备调度Agent]  → 执行结果
 *            → [反馈验证Agent]  → 最终报告
 *
 * 职责：
 * 1. 管理三个Agent的调用顺序和数据传递
 * 2. 处理Agent间的错误传播与恢复
 * 3. 汇聚各阶段的推理日志形成完整链路
 * 4. 提供全局状态管理和统计信息
 */
class Orchestrator {
  constructor() {
    this.name = 'Orchestrator';
    
    // Agent 实例引用
    this.intentParser = intentParser;
    this.deviceScheduler = deviceScheduler;
    this.feedbackVerifier = feedbackVerifier;

    // 全局运行状态
    this.state = {
      isRunning: false,
      currentScene: null,
      executionHistory: [],
      stats: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        avgResponseTime: 0,
        totalTokens: 0,
        sceneAccuracy: { correct: 0, total: 0 }
      }
    };

    // 回调函数注册
    this.onStateChange = null;
    onReasoningLog = null;
    onDeviceUpdate = null;
    onExecutionResult = null;
  }

  /**
   * 核心方法：执行完整的多Agent协作流程
   *
   * @param {string} userInput - 用户原始输入
   * @returns {Promise<object>} 完整执行结果
   */
  async execute(userInput) {
    if (this.state.isRunning) {
      return { error: '系统正在执行中，请等待当前操作完成' };
    }

    const globalStartTime = performance.now();
    this.state.isRunning = true;
    this._emitStateChange('busy', `正在处理: "${userInput}"`);

    try {
      // ============================================================
      // Phase 1: 意图解析 (Intent Parsing)
      // ============================================================
      this._emitNodeStatus('intentNode', 'active', '正在分析...');
      this._emitReasoning('system', `&#128640; ========== 开始执行新指令："${userInput}" ==========`);

      const parseResult = await this.intentParser.parse(userInput);

      // 推送意图解析的推理日志
      parseResult.reasoningTrace?.forEach(log => {
        this._emitReasoning(log.type, log.message);
      });

      if (!parseResult.success) {
        this._emitNodeStatus('intentNode', 'error', '解析失败');
        this._emitReasoning('warning', `&#9888;&#65039; 意图解析失败: ${parseResult.error}`);
        
        this._finishExecution(globalStartTime, false, userInput);
        return parseResult;
      }

      this._emitNodeStatus('intentNode', 'success', `识别为「${parseResult.scene.name}」`);
      this._emitReasoning('success', `&#127919; <strong>场景识别成功：</strong>${parseResult.scene.name} | 置信度 ${(parseResult.confidence * 100).toFixed(1)}% | ${parseResult.tasks.length} 个子任务`);

      this.state.currentScene = parseResult.scene;

      // ============================================================
      // Phase 2: 设备调度 (Device Scheduling)
      // ============================================================
      this._emitNodeStatus('schedulerNode', 'active', '正在调度...');

      const scheduleResult = await this.deviceScheduler.schedule(parseResult.tasks);

      // 推送设备调度的推理日志
      scheduleResult.reasoningTrace?.forEach(log => {
        this._emitReasoning(log.type, log.message);
      });

      this._emitNodeStatus(
        'schedulerNode',
        'success',
        `${scheduleResult.stats.successCount}/${scheduleResult.results.length} 成功`
      );

      // 推送每个设备执行结果到执行日志面板
      scheduleResult.results.forEach((result, idx) => {
        this._emitExecutionResult({
          success: result.success,
          desc: scheduleResult.executionPlan[idx]?.desc || result.deviceName || '操作',
          detail: result.success ? '执行完成' : result.error
        });
      });

      this._emitReasoning(
        'schedule',
        `&#128200; <strong>设备调度汇总：</strong>共${scheduleResult.stats.executedCount}个操作，` +
        `成功 ${scheduleResult.stats.successCount}，失败 ${scheduleResult.stats.failCount}，` +
        `涉及 ${scheduleResult.stats.devicesInvolved} 台设备，耗时 ${scheduleResult.stats.schedulingTime}ms`
      );

      // ============================================================
      // Phase 3: 反馈验证 (Feedback Verification)
      // ============================================================
      this._emitNodeStatus('verifierNode', 'active', '正在验证...');

      const verifyResult = await this.feedbackVerifier.verify(
        scheduleResult.results,
        scheduleResult.executionPlan,
        parseResult.scene.name
      );

      // 推送反馈验证的推理日志
      verifyResult.reasoningTrace?.forEach(log => {
        this._emitReasoning(log.type, log.message);
      });

      this._emitNodeStatus(
        'verifierNode',
        verifyResult.verdict === 'excellent' || verifyResult.verdict === 'good' ? 'success' : 'error',
        `${verifyResult.verdict.replace(/_/g, '')}`
      );

      this._emitReasoning(
        'verify',
        `&#128737; <strong>最终验证报告：</strong>${verifyResult.report.verdict} | ` +
        `成功率 ${(parseFloat(verifyResult.report.summary.overallSuccessRate))}% | ` +
        `降级处理 ${verifyResult.degradedCount} 次`
      );

      // ============================================================
      // Phase 4: 统计更新 & 完成
      // ============================================================

      const globalEndTime = performance.now();
      const totalTime = Math.round(globalEndTime - globalStartTime);

      // 更新运行统计
      this.updateStats(verifyResult, totalTime, parseResult.confidence > 0.5);

      // 记录历史
      this.state.executionHistory.push({
        timestamp: new Date().toLocaleString('zh-CN'),
        input: userInput,
        scene: parseResult.scene.name,
        confidence: parseResult.confidence,
        tasksCount: parseResult.tasks.length,
        successRate: parseFloat(verifyResult.report.summary.overallSuccessRate),
        verdict: verifyResult.verdict,
        durationMs: totalTime
      });

      // 最终汇总日志
      this._emitReasoning(
        'success',
        `&#127881; ========== 执行完成！总耗时 ${totalTime}ms | 场景: ${parseResult.scene.name} | 状态: ${verifyResult.report.verdict} ==========`
      );

      this._finishExecution(globalStartTime, true, userInput);

      return {
        phase1: parseResult,
        phase2: scheduleResult,
        phase3: verifyResult,
        overall: {
          totalTime,
          finalVerdict: verifyResult.verdict,
          successRate: parseFloat(verifyResult.report.summary.overallSuccessRate),
          report: verifyResult.report
        }
      };

    } catch (error) {
      this._emitNodeStatus(null, 'error', '系统异常');
      this._emitReasoning('warning', `&#10060; 系统异常: ${error.message}`);
      console.error('[Orchestrator] Error:', error);
      
      this._finishExecution(performance.now(), false, userInput);
      return { error: error.message };
    }
  }

  /** 更新全局统计数据 */
  updateStats(verifyResult, totalTime, sceneCorrect) {
    const s = this.state.stats;
    s.totalExecutions++;
    
    if (sceneCorrect) s.sceneAccuracy.correct++;
    s.sceneAccuracy.total++;

    if (verifyResult.verdict === 'excellent' || verifyResult.verdict === 'good') {
      s.successfulExecutions++;
    } else {
      s.failedExecutions++;
    }

    // 滑动平均响应时间
    s.avgResponseTime = Math.round(
      (s.avgResponseTime * (s.totalExecutions - 1) + totalTime) / s.totalExecutions
    );

    // Token消耗估算（模拟：每步推理约消耗token）
    const tokensPerExecution = Math.floor(totalTime * 0.8) + 
      (this.intentParser.reasoningSteps.length * 25) +
      (this.deviceScheduler.reasoningSteps.length * 20) +
      (this.feedbackVerifier.reasoningSteps.length * 15);
    s.totalTokens += tokensPerExecution;
  }

  _finishExecution(startTime, success, input) {
    this.state.isRunning = false;
    this._emitStateChange(success ? 'online' : 'online', success ? '就绪' : '就绪');
    
    // 重置节点状态显示（延迟后）
    setTimeout(() => {
      document.querySelectorAll('.pipeline-node').forEach(node => {
        node.classList.remove('active', 'success', 'error');
        const statusEl = node.querySelector('.node-status');
        if (statusEl && node.id !== 'verifierNode') {
          statusEl.textContent = '待命中...';
        } else if (statusEl) {
          statusEl.textContent = '等待中...';
        }
        const timerEl = node.querySelector('.node-timer');
        if (timerEl) timerEl.textContent = '';
      });
    }, 3000);
  }

  /** 发送状态变更事件 */
  _emitStateChange(status, message) {
    if (this.onStateChange) {
      this.onStateChange({ status, message });
    }
  }

  /** 发送推理日志事件 */
  _emitReasoning(type, message) {
    if (this.onReasoningLog) {
      this.onReasoningLog({ type, message });
    }
  }

  /** 发送节点状态变更 */
  _emitNodeStatus(nodeId, status, text) {
    const node = document.getElementById(nodeId);
    if (!node) return;

    // 移除所有状态类
    node.classList.remove('active', 'success', 'error');
    if (status) node.classList.add(status);

    const statusEl = node.querySelector('.node-status');
    if (statusEl) statusEl.textContent = text;
  }

  /** 发送设备执行结果事件 */
  _emitExecutionResult(result) {
    if (this.onExecutionResult) {
      this.onExecutionResult(result);
    }
  }

  /** 获取运行统计快照 */
  getStatsSnapshot() {
    const s = this.state.stats;
    return {
      accuracyRate: s.sceneAccuracy.total > 0
        ? ((s.sceneAccuracy.correct / s.sceneAccuracy.total) * 100).toFixed(0)
        : '--',
      execCount: s.totalExecutions,
      avgTime: s.totalExecutions > 0 ? `${s.avgResponseTime}ms` : '--ms',
      successFail: `${s.successfulExecutions}/${s.failedExecutions}`,
      tokenCost: s.totalTokens.toLocaleString()
    };
  }
}

// 全局实例
const orchestrator = new Orchestrator();
