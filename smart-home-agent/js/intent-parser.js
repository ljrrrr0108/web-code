/* ============================================
   intent-parser.js - 意图解析 Agent
   核心功能：长链推理（Chain-of-Thought）
   将模糊自然语言 → 结构化场景意图 → 子任务链
   ============================================ */

/**
 * IntentParserAgent - 意图解析 Agent（第一层）
 *
 * 职责：
 * 1. 接收自然语言指令
 * 2. 通过多步推理识别用户意图
 * 3. 将意图拆解为结构化子任务链
 * 4. 提取关键参数（时间、地点、强度等）
 *
 * 技术特点：模拟 Chain-of-Thought 长链推理过程
 */
class IntentParserAgent {
  constructor() {
    this.name = 'IntentParserAgent';
    this.icon = '&#129504;';
    this.reasoningSteps = []; // 存储每一步推理日志

    /**
     * 场景模板库 - 预定义的场景→子任务映射
     * 每个模板包含：触发关键词、置信度权重、子任务定义、参数提取规则
     */
    this.sceneTemplates = [
      {
        id: 'sleep',
        name: '睡眠模式',
        keywords: ['睡了', '睡觉', '休息', '晚安', '关灯睡'],
        priority: 1,
        reasoning: `分析：检测到睡眠相关关键词。推理链：用户表达"我要睡了"→推断即将进入睡眠状态→需要降低环境刺激度→关闭主照明、调暗辅助光→调节温度至舒适区间(26°C)→关闭窗帘阻隔光线→启动安防模式。`,
        tasks: [
          { action: 'setPower', target: 'light_001', params: { power: false }, desc: '关闭客厅吸顶灯' },
          { action: 'setColorTemp', target: 'light_003', params: { value: 2700 }, desc: '氛围灯切换暖色调' },
          { action: 'setBrightness', target: 'light_003', params: { value: 10 }, desc: '氛围灯降至最低亮度(夜灯模式)' },
          { action: 'setPower', target: 'climate_001', params: { power: true }, desc: '开启客厅空调' },
          { action: 'setMode', target: 'climate_001', params: { mode: 'cool' }, desc: '空调设为制冷模式' },
          { action: 'setTemp', target: 'climate_001', params: { temp: 26 }, desc: '空调温度设为26°C(睡眠最佳温度)' },
          { action: 'setPosition', target: 'curtain_001', params: { position: 0 }, desc: '关闭客厅窗帘' },
          { action: 'setPosition', target: 'curtain_002', params: { position: 0 }, desc: '关闭卧室遮光窗帘' },
          { action: 'lock', target: 'security_001', params: {}, desc: '锁定智能门锁(安防模式)' },
          { action: 'setPower', target: 'appliance_005', params: { power: true }, desc: '开启卧室加湿器' },
        ]
      },

      {
        id: 'leave_home',
        name: '离家模式',
        keywords: ['出门', '离开', '走了', '上班去', '外出'],
        priority: 1,
        reasoning: `分析：检测到外出/离开相关关键词。推理链：用户要出门→家中将无人值守→需关闭非必要设备节省能源→关闭照明和娱乐设备→调整温控至节能模式→启动全屋安防监控→确认门窗已锁闭。`,
        tasks: [
          { action: 'setPower', target: 'light_001', params: { power: false }, desc: '关闭客厅吸顶灯' },
          { action: 'setPower', target: 'light_002', params: { power: false }, desc: '关闭床头灯' },
          { action: 'setPower', target: 'light_003', params: { power: false }, desc: '关闭氛围灯带' },
          { action: 'setPower', target: 'appliance_001', params: { power: false }, desc: '关闭电视' },
          { action: 'setPower', target: 'climate_001', params: { power: false }, desc: '关闭客厅空调(节能)' },
          { action: 'setPower', target: 'climate_002', params: { power: false }, desc: '关闭卧室空调(节能)' },
          { action: 'setPosition', target: 'curtain_001', params: { position: 50 }, desc: '窗帘半开(营造有人假象)' },
          { action: 'lock', target: 'security_001', params: {}, desc: '锁定智能门锁' },
          { action: 'setMode', target: 'security_001', params: { mode: 'away' }, desc: '安防切换为离家模式' },
          { action: 'startRecord', target: 'security_004', params: {}, desc: '摄像头开始录像' },
        ]
      },

      {
        id: 'movie',
        name: '观影模式',
        keywords: ['看电影', '电影', '看剧', '追剧', '影院', '播放'],
        priority: 1,
        reasoning: `分析：检测到影视娱乐相关关键词。推理链：用户想看电影→需要营造沉浸式观影环境→降低环境亮度避免反光→关闭主照明保留氛围光→调节电视至最佳状态→关闭可能干扰注意力的设备。`,
        tasks: [
          { action: 'setBrightness', target: 'light_001', params: { value: 5 }, desc: '吸顶灯亮度降至最低(防反光)' },
          { action: 'setColorTemp', target: 'light_003', params: { value: 2200 }, desc: '氛围灯切为暖色(沉浸感)' },
          { action: 'setBrightness', target: 'light_003', params: { value: 30 }, desc: '氛围灯中等亮度(不刺眼)' },
          { action: 'setPosition', target: 'curtain_001', params: { position: 0 }, desc: '关闭客厅窗帘(避光)' },
          { action: 'setPower', target: 'appliance_001', params: { power: true }, desc: '开启电视' },
          { action: 'setSource', target: 'appliance_001', params: { source: 'hdmi1' }, desc: '电视切换HDMI信号源' },
          { action: 'setVolume', target: 'appliance_001', params: { volume: 35 }, desc: '音量设为35(适中)' },
          { action: 'setPower', target: 'appliance_002', params: { power: true }, desc: '开启空气净化器(舒适环境)' },
        ]
      },

      {
        id: 'dinner',
        name: '用餐模式',
        keywords: ['吃饭', '晚餐', '午餐', '开饭', '回家吃饭'],
        priority: 1,
        reasoning: `分析：检测到用餐相关关键词。推理链：用户准备用餐或已到家→需要明亮的就餐环境→提升照明亮度→调节适宜的室内温度→保持空气清新。`,
        tasks: [
          { action: 'setPower', target: 'light_001', params: { power: true }, desc: '开启客厅吸顶灯(就餐照明)' },
          { action: 'setBrightness', target: 'light_001', params: { value: 100 }, desc: '吸顶灯亮度拉满' },
          { action: 'setColorTemp', target: 'light_001', params: { value: 4000 }, desc: '灯光色温4000K(自然光感)' },
          { action: 'setPower', target: 'climate_001', params: { power: true }, desc: '开启空调' },
          { action: 'setTemp', target: 'climate_001', params: { temp: 24 }, desc: '温度设为24°C(体感舒适)' },
          { action: 'setPower', target: 'appliance_002', params: { power: true }, desc: '开启空气净化器' },
          { action: 'setPosition', target: 'curtain_001', params: { position: 70 }, desc: '窗帘打开(透入自然光)' },
        ]
      },

      {
        id: 'work',
        name: '工作模式',
        keywords: ['工作', '办公', '开会', '专注', '学习', '写代码'],
        priority: 1,
        reasoning: `分析：检测到工作/学习相关关键词。推理链：用户需要专注工作→需要明亮清晰的照明环境→冷白光有助于集中注意力→减少干扰性设备运行→维持舒适室温。`,
        tasks: [
          { action: 'setPower', target: 'light_001', params: { power: true }, desc: '开启吸顶灯' },
          { action: 'setBrightness', target: 'light_001', params: { value: 100 }, desc: '最大亮度(清晰视觉)' },
          { action: 'setColorTemp', target: 'light_001', params: { value: 5500 }, desc: '冷白光色温(提神醒脑)' },
          { action: 'setPower', target: 'light_003', params: { power: false }, desc: '关闭氛围灯(减少干扰)' },
          { action: 'setPower', target: 'climate_001', params: { power: true }, desc: '开启空调' },
          { action: 'setTemp', target: 'climate_001', params: { temp: 23 }, desc: '23°C(工作最佳温度)' },
          { action: 'setVolume', target: 'appliance_004', params: { volume: 15 }, desc: '音箱静音(减少干扰)' },
        ]
      },

      {
        id: 'cold_complaint',
        name: '温度调节',
        keywords: ['冷了', '太冷', '冻死了', '热了', '太热', '热死', '温度', '空调'],
        priority: 2, // 优先级较低，可能是局部需求
        reasoning: `分析：检测到温度抱怨相关关键词。推理链：用户对当前温度不满→需要定位所在房间→判断是过冷还是过热→自动匹配对应房间的温控设备进行调节。`,
        tasks: [
          { action: 'setPower', target: 'climate_001', params: { power: true }, desc: '检测到温度不适，开启空调' },
          { action: 'setMode', target: 'climate_001', params: { mode: 'warm' }, desc: '切换制热模式(用户感觉冷)' },
          { action: 'setTemp', target: 'climate_001', params: { temp: 27 }, desc: '温度调升至27°C' },
          { action: 'setFanSpeed', target: 'climate_001', params: { speed: 'auto' }, desc: '风速自动调节' },
        ]
      }
    ];

    /** 模糊语义映射表 */
    this.semanticMap = {
      // 睡眠相关
      '困': 'sleep', '眼皮打架': 'sleep', '躺平': 'sleep',
      // 外出相关
      '溜达': 'leave_home', '逛街': 'leave_home', '聚会': 'leave_home',
      // 影视相关
      '刷剧': 'movie', '追番': 'movie', 'Netflix': 'movie', 'bilibili': 'movie',
      // 用餐相关
      '饿了': 'dinner', '做饭': 'dinner', '厨房': 'dinner',
      // 工作相关
      '敲代码': 'work', '写论文': 'work', '开会': 'work', 'zoom': 'work',
      // 温度相关
      '凉': 'cold_complaint', '闷': 'hot_complaint'
    };
  }

  /**
   * 核心方法：解析用户指令
   * 执行完整的 Chain-of-Thought 推理流程
   *
   * @param {string} userInput - 用户原始输入
   * @returns {{ scene: object, confidence: number, reasoningTrace: string[], tasks: object[] }}
   */
  async parse(userInput) {
    const startTime = performance.now();
    this.reasoningSteps = [];

    this._addReasoning('intent', `🔍 [步骤1] 接收原始输入："${userInput}"`);

    // === Step 1: 文本预处理与归一化 ===
    const normalizedInput = userInput.trim().toLowerCase();
    this._addReasoning('intent', `📝 [步骤2] 文本归一化处理完成，去除首尾空格并转小写`);

    // === Step 2: 关键词匹配 + 语义相似度计算 ===
    const matchedScenes = this._matchScenes(normalizedInput);
    this._addReasoning('intent', `&#128202; [步骤3] 关键词匹配完成，候选场景数：${matchedScenes.length}`);

    if (matchedScenes.length === 0) {
      return {
        success: false,
        error: '未能识别该指令对应的场景，请尝试使用更明确的表述。',
        confidence: 0,
        reasoningTrace: this.reasoningSteps
      };
    }

    // === Step 3: 场景消歧（选择最高置信度）===
    const bestMatch = matchedScenes[0];
    const confidence = bestMatch.score;
    this._addReasoning('intent', `&#127919; [步骤4] 场景消歧结果：<strong>${bestMatch.template.name}</strong> (置信度 ${(confidence * 100).toFixed(1)}%)`);
    this._addReasoning('intent', `&#128161; [步骤5] 触发长链推理：${bestMatch.template.reasoning}`);

    // === Step 4: 子任务拆解 ===
    const tasks = bestMatch.template.tasks.map((task, index) => ({
      ...task,
      taskId: `task_${index + 1}`,
      order: index + 1,
      status: 'pending',
      dependencies: [] // 可扩展任务依赖关系
    }));

    this._addReasoning('intent', `&#128203; [步骤6] 子任务拆解完成，共生成 <strong>${tasks.length}</strong> 个原子操作`);

    // === Step 5: 参数补全与校验 ===
    const validatedTasks = await this._validateTasks(tasks);
    this._addReasoning('intent', `&#9989; [步骤7] 任务校验完成，所有操作均已验证设备在线状态`);

    const endTime = performance.now();

    return {
      success: true,
      scene: {
        id: bestMatch.template.id,
        name: bestMatch.template.name,
        templateId: bestMatch.template.id
      },
      confidence,
      originalInput: userInput,
      normalizedInput,
      tasks: validatedTasks,
      reasoningTrace: this.reasoningSteps,
      processingTime: Math.round(endTime - startTime)
    };
  }

  /**
   * 多维度场景匹配算法
   * 综合考虑：精确关键词命中 + 语义近似 + 上下文优先级
   */
  _matchScenes(input) {
    const results = [];

    for (const template of this.sceneTemplates) {
      let score = 0;
      let matchedKeywords = [];

      // 精确关键词匹配（权重60%）
      for (const kw of template.keywords) {
        if (input.includes(kw)) {
          score += 0.6 / template.keywords.length;
          matchedKeywords.push(kw);
        }
      }

      // 语义近似匹配（权重30%）
      for (const [semantic, sceneId] of Object.entries(this.semanticMap)) {
        if (input.includes(semantic) && template.id === sceneId) {
          score += 0.3;
          matchedKeywords.push(`[语义:${semantic}]`);
        }
      }

      // 上下文优先级加权（权重10%）
      score *= (1.05 - template.priority * 0.02);

      if (score > 0) {
        results.push({
          template,
          score,
          matchedKeywords
        });
      }
    }

    // 按得分降序排列
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 任务有效性校验
   * 检查每个任务的设备是否在线、操作是否支持
   */
  async _validateTasks(tasks) {
    const validated = [];
    for (const task of tasks) {
      const device = deviceManager.getById(task.target);
      if (!device || !device.online) {
        task.status = 'skipped';
        task.skipReason = `设备 ${task.target} 不存在或离线`;
        this._addReasoning('intent', `&#9888;&#65039; 跳过任务：${task.desc}（目标设备离线）`);
      } else if (!device.actions.includes(task.action)) {
        task.status = 'skipped';
        task.skipReason = `设备不支持 ${task.action} 操作`;
        this._addReasoning('intent', `&#9888;&#65039; 跳过任务：${task.desc}（操作不被支持）`);
      } else {
        task.status = 'ready';
      }
      validated.push(task);
    }
    return validated;
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
const intentParser = new IntentParserAgent();
