/* ============================================
   feedback-verifier.js - 反馈验证 Agent
   核心功能：执行结果监控、降级策略、用户通知
   ============================================ */

/**
 * FeedbackVerifierAgent - 反馈验证 Agent（第三层）
 *
 * 职责：
 * 1. 接收设备调度Agent的执行结果
 * 2. 逐项校验每个操作是否成功
 * 3. 对失败项触发降级策略
 * 4. 生成最终执行报告
 * 5. 推送通知给用户
 */
class FeedbackVerifierAgent {
  constructor() {
    this.name = 'FeedbackVerifierAgent';
    this.icon = '&#9989;&#65039;';
    this.reasoningSteps = [];

    /**
     * 降级策略库 - 当主操作失败时的备用方案
     */
    this.fallbackStrategies = {
      // 设备离线 → 尝试同类设备替代
      device_offline: {
        name: '同类设备替代策略',
        apply: (failedTask, allResults, plan) => {
          const failedDevice = deviceManager.getById(failedTask.target);
          if (!failedDevice) return null;

          // 查找同类型、同房间的其他在线设备作为替代
          const alternatives = deviceManager.getOnlineDevices().filter(d =>
            d.type === failedDevice.type &&
            d.id !== failedDevice.id &&
            d.room === failedDevice.room
          );

          if (alternatives.length > 0) {
            return {
              strategy: 'device_alternative',
              message: `原设备 ${failedDevice.name} 离线，尝试使用同类型替代：${alternatives[0].name}`,
              fallbackTask: { ...failedTask, target: alternatives[0].id },
              confidence: 0.7
            };
          }
          return null;
        }
      },

      // 操作不支持 → 使用近似操作替代
      action_unsupported: {
        name: '近似操作替代策略',
        apply: (failedTask) => ({
          strategy: 'approximate_action',
          message: `操作 ${failedAction} 不支持，尝试使用基础开关控制`,
          fallbackTask: { ...failedTask, action: 'setPower', params: {} },
          confidence: 0.5
        })
      },

      // 网络超时 → 重试一次（最多重试1次）
      network_timeout: {
        name: '自动重试策略',
        maxRetries: 1,
        apply: (failedTask) => ({
          strategy: 'retry',
          message: `网络超时，正在重试...`,
          fallbackTask: failedTask,
          confidence: 0.85,
          isRetry: true
        })
      },

      // 无可用降级方案 → 记录并通知
      no_fallback: {
        name: '记录并通知策略',
        apply: (failedTask) => ({
          strategy: 'notify_only',
          message: `无法找到降级方案，已记录异常`,
          fallbackTask: null,
          confidence: 0
        })
      }
    };

    /** 已用重试次数计数器 */
    this.retryCounters = new Map();
  }

  /**
   * 核心方法：验证全部执行结果
   *
   * @param {object[]} results - 设备调度返回的原始结果
   * @param {object[]} executionPlan - 原始执行计划
   * @param {string} sceneName - 场景名称（用于报告）
   * @returns {{ verdict: string, report: object, actionsTaken: object[] }}
   */
  async verify(results, executionPlan, sceneName) {
    const startTime = performance.now();
    this.reasoningSteps = [];
    this.retryCounters.clear();

    this._addReasoning('verify', `&#128269; [V-Step1] 开始执行结果验证，共 ${results.length} 条结果待检查`);

    // === Step 1: 逐项校验 ===
    let successCount = 0;
    let failCount = 0;
    const verifiedItems = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const planItem = executionPlan[i];

      if (result.success) {
        successCount++;
        verifiedItems.push({
          ...result,
          planItem,
          status: 'verified_ok'
        });
        this._addReasoning('verify', `&#9989; [V-Check #${i + 1}] ${result.deviceName || planItem.desc} ✅ 执行成功`);
      } else {
        failCount++;
        this._addReasoning('verify', `&#10060; [V-Check #${i + 1}] ${planItem?.desc || '未知'} ❌ 失败: ${result.error}`);

        // === Step 2: 触发降级策略 ===
        const fallbackResult = await this._applyFallback(result, planItem);
        if (fallbackResult) {
          verifiedItems.push({
            original: { ...result, planItem },
            fallback: fallbackResult,
            status: fallbackResult.success ? 'degraded_success' : 'degraded_failed'
          });
          if (fallbackResult.success) {
            successCount++;
            this._addReasoning('verify', `&#128161; [V-Fallback] 降级成功！使用 ${fallbackResult.strategy} 策略恢复`);
          } else {
            this._addReasoning('verify', `&#128683; [V-Fallback] 降级策略也失败: ${fallbackResult.error}`);
          }
        } else {
          verifiedItems.push({
            ...result,
            planItem,
            status: 'verified_fail_no_fallback'
          });
        }
      }
    }

    // === Step 3: 综合判定 ===
    const successRate = results.length > 0 ? (successCount / results.length) : 0;
    let verdict;

    if (successRate >= 0.95) {
      verdict = 'excellent';
      this._addReasoning('verify', `&#127942; [V-Step3] 综合评定：<strong>优秀</strong> (成功率 ${(successRate * 100).toFixed(0)}%)`);
    } else if (successRate >= 0.8) {
      verdict = 'good';
      this._addReasoning('verify', `&#128170; [V-Step3] 综合评定：<strong>良好</strong> (成功率 ${(successRate * 100).toFixed(0)}%)`);
    } else if (successRate >= 0.6) {
      verdict = 'acceptable';
      this._addReasoning('verify', `&#128527; [V-Step3] 综合评定：<strong>可接受</strong> (成功率 ${(successRate * 100).toFixed(0)}%)`);
    } else {
      verdict = 'poor';
      this._addReasoning('verify', `&#128557; [V-Step3] 综合评定：<strong>需关注</strong> (成功率 ${(successRate * 100).toFixed(0)}%)`);
    }

    // === Step 4: 生成执行报告 ===
    const report = this._generateReport(sceneName, verifiedItems, successCount, failCount, verdict);

    const endTime = performance.now();

    return {
      verdict,
      successRate,
      totalChecked: results.length,
      successCount,
      failCount,
      degradedCount: verifiedItems.filter(v => v.status.includes('degraded')).length,
      report,
      verifiedItems,
      reasoningTrace: this.reasoningSteps,
      processingTime: Math.round(endTime - startTime)
    };
  }

  /**
   * 应用降级策略
   */
  async _applyFallback(failResult, planItem) {
    if (!planItem) return null;

    // 分析失败原因
    let reasonType;
    if (failResult.error && failResult.error.includes('离线')) {
      reasonType = 'device_offline';
    } else if (failResult.error && failResult.error.includes('不支持')) {
      reasonType = 'action_unsupported';
    } else if (failResult.error && failResult.error.includes('超时')) {
      reasonType = 'network_timeout';
    } else {
      reasonType = 'unknown';
    }

    // 查找对应策略
    const strategyKey = this.fallbackStrategies[reasonType]
      ? reasonType
      : 'no_fallback';

    const strategy = this.fallbackStrategies[strategyKey];
    this._addReasoning('verify', `&#129504; [V-Fallback-Analyze] 失败原因归类: <strong>${strategy.name}</strong>`);

    // 检查重试次数限制
    if (reasonType === 'network_timeout') {
      const key = `${planItem.target}_${planItem.action}`;
      const retries = this.retryCounters.get(key) || 0;
      if (retries >= strategy.maxRetries) {
        this._addReasoning('verify', `&#128683; [V-Fallback] 已达最大重试次数(${strategy.maxRetries})`);
        return null;
      }
      this.retryCounters.set(key, retries + 1);
    }

    // 应用策略获取回退任务
    const fallbackPlan = strategy.apply(planItem);

    if (!fallbackPlan || !fallbackPlan.fallbackTask) {
      this._addReasoning('verify', `&#128683; [V-Fallback] 无可用降级方案`);
      return null;
    }

    this._addReasoning('verify', `&#128260; [V-Fallback-Exec] 执行降级: ${fallbackPlan.message}`);

    // 执行降级任务
    try {
      const fbTask = fallbackPlan.fallbackTask;
      const result = await deviceManager.executeAction(fbTask.target, fbTask.action, fbTask.params);
      return {
        ...result,
        strategy: fallbackPlan.strategy,
        strategyMessage: fallbackPlan.message,
        originalTarget: planItem.target
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 生成结构化执行报告
   */
  _generateReport(sceneName, items, success, fail, verdict) {
    const verdictLabels = {
      excellent: '&#127942; 优秀',
      good: '&#128170; 良好',
      acceptable: '&#128527; 可接受',
      poor: '&#128557; 需关注'
    };

    return {
      timestamp: new Date().toLocaleString('zh-CN'),
      sceneName,
      verdict: verdictLabels[verdict],
      summary: {
        totalOperations: items.length,
        success,
        fail,
        degraded: items.filter(i => i.status.includes('degraded')).length,
        overallSuccessRate: items.length > 0 ? ((success / items.length) * 100).toFixed(1) : 0
      },
      details: items.map(item => ({
        taskDesc: item.planItem?.desc || item.deviceName || '未知',
        targetDevice: item.deviceId || item.original?.deviceId,
        action: item.action,
        status: item.status.replace(/_/g, ' '),
        fallbackUsed: item.fallback ? `${item.fallback.strategy}: ${item.fallback.strategyMessage}` : null
      })),
      recommendations: this._getRecommendations(items)
    };
  }

  /**
   * 基于执行结果生成优化建议
   */
  _getRecommendations(items) {
    const recommendations = [];
    
    const failures = items.filter(i => i.status === 'verified_fail_no_fallback');
    if (failures.length > 0) {
      const offlineDevices = [...new Set(failures.map(f => f.planItem?.target))];
      recommendations.push(`建议检查以下设备是否在线：${offlineDevices.join(', ')}`);
    }

    const degradedItems = items.filter(i => i.status.includes('degraded'));
    if (degradedItems.length > 2) {
      recommendations.push('多台设备触发了降级策略，建议检查网络稳定性');
    }

    if (recommendations.length === 0) {
      recommendations.push('所有设备运行正常，无需额外操作');
    }

    return recommendations;
  }

  _addReasoning(type, message) {
    this.reasoningSteps.push({
      type,
      message,
      timestamp: new Date().toLocaleTimeString('zh-CN')
    });
  }
}

// 全局实例
const feedbackVerifier = new FeedbackVerifierAgent();
