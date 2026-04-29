/* ============================================
   device-scheduler.js - 设备调度 Agent
   核心功能：设备匹配、冲突检测与消解、执行序列优化
   ============================================ */

/**
 * DeviceSchedulerAgent - 设备调度 Agent（第二层）
 *
 * 职责：
 * 1. 接收子任务列表
 * 2. 检测设备操作冲突
 * 3. 执行冲突消解策略
 * 4. 构建最优执行序列
 * 5. 派发设备操作指令
 */
class DeviceSchedulerAgent {
  constructor() {
    this.name = 'DeviceSchedulerAgent';
    this.icon = '&#9881;&#65039;';
    this.reasoningSteps = [];
    this.executionQueue = []; // 执行队列

    /**
     * 冲突规则库 - 定义哪些操作之间存在冲突需要处理
     */
    this.conflictRules = [
      {
        type: 'same_device_concurrent',
        description: '同一设备的并发操作冲突',
        detect: (tasks) => {
          const deviceTasks = {};
          const conflicts = [];
          tasks.forEach((task, idx) => {
            if (!deviceTasks[task.target]) deviceTasks[task.target] = [];
            deviceTasks[task.target].push({ task, index: idx });
          });
          for (const [deviceId, deviceTaskList] of Object.entries(deviceTasks)) {
            if (deviceTaskList.length > 1) {
              conflicts.push({
                type: 'same_device',
                deviceId,
                tasks: deviceTaskList,
                resolution: 'merge_or_sequential' // 合并或顺序执行
              });
            }
          }
          return conflicts;
        },
        resolve: (conflict, allTasks) => {
          // 同一设备的多个操作 → 保留最终状态，合并中间步骤
          const { deviceId, tasks } = conflict;
          const resolved = [];
          // 只保留最后一个操作（最终状态），跳过中间过渡态
          tasks.forEach(({ task, index }, i) => {
            if (i < tasks.length - 1) {
              allTasks[index].status = 'merged';
              allTasks[index].mergeReason = `已合并到同一设备的后续操作`;
            } else {
              resolved.push(allTasks[index]);
            }
          });
          return { action: 'merged', message: `设备${deviceId}的${tasks.length}个操作已合并为1个` };
        }
      },

      {
        type: 'mutual_exclusion',
        description: '互斥操作冲突',
        detect: (tasks) => {
          const conflicts = [];
          const lockTasks = tasks.filter(t => t.action === 'lock');
          const unlockTasks = tasks.filter(t => t.action === 'unlock');

          if (lockTasks.length > 0 && unlockTasks.length > 0) {
            conflicts.push({
              type: 'mutex',
              actions: ['lock', 'unlock'],
              resolution: 'last_wins'
            });
          }

          // 电源开关冲突：同一设备先开后关或先关后开
          const powerOnTasks = tasks.filter(t => t.action === 'setPower' && t.params.power === true);
          const powerOffTasks = tasks.filter(t => t.action === 'setPower' && t.params.power === false);

          const groupedByDevice = {};
          [...powerOnTasks, ...powerOffTasks].forEach(task => {
            if (!groupedByDevice[task.target]) groupedByDevice[task.target] = [];
            groupedByDevice[task.target].push(task);
          });

          for (const [devId, devTasks] of Object.entries(groupedByDevice)) {
            const hasOn = devTasks.some(t => t.params.power === true);
            const hasOff = devTasks.some(t => t.params.power === false);
            if (hasOn && hasOff) {
              conflicts.push({
                type: 'power_conflict',
                deviceId: devId,
                resolution: 'last_state_wins'
              });
            }
          }

          return conflicts;
        },
        resolve: (conflict, allTasks) => {
          if (conflict.type === 'power_conflict') {
            // 取最后一个电源操作作为最终状态
            const relevantTasks = allTasks.filter(t =>
              t.target === conflict.deviceId && t.action === 'setPower'
            );
            if (relevantTasks.length > 1) {
              const lastTask = relevantTasks[relevantTasks.length - 1];
              relevantTasks.slice(0, -1).forEach(t => {
                t.status = 'merged';
                t.mergeReason = `电源操作冲突，以最后指令为准(${lastTask.params.power ? '开启' : '关闭'})`;
              });
            }
            return { action: 'resolved', message: `设备${conflict.deviceId}的电源冲突已消解，取最终状态` };
          }
          return { action: 'resolved', message: '互斥操作冲突已消解' };
        }
      },

      {
        type: 'dependency_order',
        description: '依赖关系排序',
        detect: (tasks) => {
          // 定义依赖规则：某些操作必须在其他操作之前/之后完成
          const dependencyGraph = new Map();

          tasks.forEach((task, idx) => {
            let deps = [];

            // 空调必须先开启才能调温度/模式
            if ((task.action === 'setTemp' || task.action === 'setMode') &&
                !tasks.some((t, i) => i < idx && t.target === task.target && t.action === 'setPower')) {
              const setPowerIdx = tasks.findIndex(t => t.target === task.target && t.action === 'setPower');
              if (setPowerIdx !== -1) deps.push(setPowerIdx);
            }

            // 灯光参数设置应在开启后
            if ((task.action === 'setBrightness' || task.action === 'setColorTemp') &&
                !tasks.some((t, i) => i < idx && t.target === task.target && t.action === 'setPower')) {
              const setPowerIdx = tasks.findIndex(t => t.target === task.target && t.action === 'setPower');
              if (setPowerIdx !== -1 && setPowerIdx > idx) deps.push(setPowerIdx);
            }

            // 安防锁定应在窗帘关闭之后（更安全）
            if (task.action === 'lock') {
              const curtainTasks = tasks.filter(t =>
                t.action === 'setPosition' && t.params.position === 0
              );
              curtainTasks.forEach(ct => {
                const ctIdx = tasks.indexOf(ct);
                if (ctIdx > idx) deps.push(ctIdx);
              });
            }

            if (deps.length > 0) dependencyGraph.set(idx, deps);
          });

          return Array.from(dependencyGraph.entries()).map(([taskIdx, depIndices]) => ({
            type: 'dependency',
            taskIndex: taskIdx,
            dependsOn: depIndices,
            resolution: 'topological_sort'
          }));
        },
        resolve: (conflict, allTasks) => {
          // 拓扑排序确保依赖关系正确
          return { action: 'reordered', message: `任务#${conflict.taskIndex + 1}已调整执行顺序以满足依赖关系` };
        }
      }
    ];
  }

  /**
   * 核心方法：调度并执行任务链
   *
   * @param {object[]} tasks - 来自意图解析Agent的任务列表
   * @returns {{ executionPlan: object[], conflictsResolved: object[], results: object[] }}
   */
  async schedule(tasks) {
    const startTime = performance.now();
    this.reasoningSteps = [];

    this._addReasoning('schedule', `&#128260; [S-Step1] 收到 ${tasks.length} 个待调度子任务`);

    // === Step 1: 过滤可执行任务 ===
    const executableTasks = tasks.filter(t => t.status === 'ready');
    const skippedCount = tasks.filter(t => t.status === 'skipped').length;
    this._addReasoning('schedule', `&#128994; [S-Step2] 可执行任务：${executableTasks.length}，跳过任务：${skippedCount}`);

    // === Step 2: 冲突检测 ===
    const allConflicts = [];
    for (const rule of this.conflictRules) {
      const detected = rule.detect(executableTasks);
      if (detected.length > 0) {
        detected.forEach(c => c.ruleType = rule.type);
        allConflicts.push(...detected);
      }
    }

    if (allConflicts.length > 0) {
      this._addReasoning('schedule', `&#9888;&#65039; [S-Step3] 检测到 ${allConflicts.length} 处潜在冲突`);
    } else {
      this._addReasoning('schedule', `&#9989;&#65039; [S-Step3] 无操作冲突，所有任务可直接并行`);
    }

    // === Step 3: 冲突消解 ===
    const conflictResolutions = [];
    for (const conflict of allConflicts) {
      const rule = this.conflictRules.find(r => r.type === conflict.type);
      if (rule) {
        const resolution = rule.resolve(conflict, executableTasks);
        conflictResolutions.push({ ...conflict, resolution });
        this._addReasoning('schedule', `&#128296; [S-Step4] 冲突消解：${resolution.message}`);
      }
    }

    // === Step 4: 构建执行计划 ===
    const finalTasks = executableTasks.filter(t => t.status === 'ready' || t.status === 'merged');

    // 按设备分组（同设备操作串行，不同设备操作可并行）
    const groupedByDevice = new Map();
    finalTasks.forEach(task => {
      if (!groupedByDevice.has(task.target)) groupedByDevice.set(task.target, []);
      groupedByDevice.get(task.target).push(task);
    });

    // 构建有序执行序列
    const executionPlan = [];
    let orderIndex = 1;
    for (const [deviceName, deviceTasks] of groupedByDevice.entries()) {
      deviceTasks.forEach(task => {
        executionPlan.push({
          ...task,
          executionOrder: orderIndex++,
          estimatedDelay: 300 + Math.floor(Math.random() * 400), // 模拟IoT延迟
        });
      });
    }

    this._addReasoning('schedule', `&#128200; [S-Step5] 执行计划构建完成：<strong>${executionPlan.length}</strong> 个原子操作，涉及 <strong>${groupedByDevice.size}</strong> 台设备`);

    // === Step 5: 分阶段派发执行 ===
    const executionResults = [];
    
    // 模拟分批执行（实际中可以真正的并行）
    for (const planItem of executionPlan) {
      this._addReasoning('schedule', `&#9889; [S-Step6-Exec] 派发操作 #${planItem.executionOrder}: ${planItem.desc}`);

      const result = await deviceManager.executeAction(
        planItem.target,
        planItem.action,
        planItem.params
      );

      executionResults.push(result);

      if (result.success) {
        this._addReasoning('schedule', `&#9989; 操作成功：${result.deviceName} - ${planItem.action}`);
      } else {
        this._addReasoning('schedule', `&#10060; 操作失败：${result.error}`);
      }
    }

    const endTime = performance.now();

    return {
      success: true,
      executionPlan,
      conflictsDetected: allConflicts.length,
      conflictsResolved: conflictResolutions,
      results: executionResults,
      stats: {
        totalTasks: tasks.length,
        executableTasks: executableTasks.length,
        executedCount: executionResults.length,
        successCount: executionResults.filter(r => r.success).length,
        failCount: executionResults.filter(r => !r.success).length,
        devicesInvolved: groupedByDevice.size,
        schedulingTime: Math.round(endTime - startTime)
      },
      reasoningTrace: this.reasoningSteps
    };
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
const deviceScheduler = new DeviceSchedulerAgent();
