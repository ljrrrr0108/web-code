/* ============================================
   devices.js - 智能家居设备注册表
   模拟米家生态设备的完整数据模型
   ============================================ */

const DEVICE_CATEGORIES = {
  lighting: { name: '照明', icon: '&#128293;' },
  climate: { name: '温控', icon: '&#127777;' },
  curtain: { name: '窗帘', icon: '&#127868;' },
  security: { name: '安防', icon: '&#128274;' },
  appliance: { name: '电器', icon: '&#128266;' },
  sensor: { name: '传感器', icon: '&#128187;' }
};

/**
 * 设备注册表 - 模拟20+台米家生态设备
 * 每个设备包含：唯一ID、名称、类型、所在房间、当前状态、属性
 */
const DEVICE_REGISTRY = [
  // === 照明类 ===
  {
    id: 'light_001', name: '智能吸顶灯', type: 'lighting',
    room: '客厅', online: true,
    status: { power: true, brightness: 80, colorTemp: 4000, color: null },
    actions: ['setPower', 'setBrightness', 'setColorTemp']
  },
  {
    id: 'light_002', name: '床头灯', type: 'lighting',
    room: '主卧', online: true,
    status: { power: false, brightness: 30, colorTemp: 2700, color: null },
    actions: ['setPower', 'setBrightness', 'setColorTemp']
  },
  {
    id: 'light_003', name: '氛围灯带', type: 'lighting',
    room: '客厅', online: true,
    status: { power: true, brightness: 50, colorTemp: null, color: '#3b82f6' },
    actions: ['setPower', 'setBrightness', 'setColor']
  },

  // === 温控类 ===
  {
    id: 'climate_001', name: '空调', type: 'climate',
    room: '客厅', online: true,
    status: { power: true, mode: 'cool', temp: 24, fanSpeed: 'auto' },
    actions: ['setPower', 'setMode', 'setTemp', 'setFanSpeed']
  },
  {
    id: 'climate_002', name: '卧室空调', type: 'climate',
    room: '主卧', online: true,
    status: { power: false, mode: 'cool', temp: 26, fanSpeed: 'low' },
    actions: ['setPower', 'setMode', 'setTemp', 'setFanSpeed']
  },
  {
    id: 'appliance_005', name: '加湿器', type: 'appliance',
    room: '主卧', online: true,
    status: { power: false, humidityTarget: 55, waterLevel: 80 },
    actions: ['setPower', 'setHumidity']
  },

  // === 窗帘类 ===
  {
    id: 'curtain_001', name: '电动窗帘', type: 'curtain',
    room: '客厅', online: true,
    status: { position: 100 }, // 0=全关, 100=全开
    actions: ['setPosition']
  },
  {
    id: 'curtain_002', name: '遮光窗帘', type: 'curtain',
    room: '主卧', online: true,
    status: { position: 60 },
    actions: ['setPosition']
  },

  // === 安防类 ===
  {
    id: 'security_001', name: '智能门锁', type: 'security',
    room: '入户', online: true,
    status: { locked: true, mode: 'home' },
    actions: ['lock', 'unlock', 'setMode']
  },
  {
    id: 'security_002', name: '人体传感器', type: 'sensor',
    room: '客厅', online: true,
    status: { presence: false, lux: 120 },
    actions: [] // 只读传感器
  },
  {
    id: 'security_003', name: '门窗传感器', type: 'sensor',
    room: '入户', online: true,
    status: { open: false },
    actions: []
  },
  {
    id: 'security_004', name: '摄像头', type: 'security',
    room: '入户', online: true,
    status: { power: true, recording: false, privacy: true },
    actions: ['setPower', 'startRecord', 'stopRecord', 'setPrivacy']
  },

  // === 电器类 ===
  {
    id: 'appliance_001', name: '电视', type: 'appliance',
    room: '客厅', online: true,
    status: { power: false, volume: 30, source: 'hdmi1', input: '' },
    actions: ['setPower', 'setVolume', 'setSource']
  },
  {
    id: 'appliance_002', name: '空气净化器', type: 'appliance',
    room: '客厅', online: true,
    status: { power: true, mode: 'auto', aqi: 42 },
    actions: ['setPower', 'setMode']
  },
  {
    id: 'appliance_003', name: '扫地机器人', type: 'appliance',
    room: '全屋', online: true,
    status: { power: false, charging: true, battery: 95 },
    actions: ['startClean', 'stopClean', 'dockCharge']
  },
  {
    id: 'appliance_004', name: '智能音箱', type: 'appliance',
    room: '客厅', online: true,
    status: { power: true, volume: 40 },
    actions: ['setPower', 'setVolume', 'speak']
  },
];

/**
 * DeviceManager - 设备管理器
 * 提供设备查询、状态更新、执行操作等能力
 */
class DeviceManager {
  constructor(devices) {
    this.devices = new Map();
    devices.forEach(d => this.devices.set(d.id, this._deepClone(d)));
    this.eventListeners = [];
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** 获取所有在线设备 */
  getOnlineDevices() {
    return Array.from(this.devices.values()).filter(d => d.online);
  }

  /** 按类型获取设备 */
  getByType(type) {
    return this.getOnlineDevices().filter(d => d.type === type);
  }

  /** 按房间获取设备 */
  getByRoom(room) {
    return this.getOnlineDevices().filter(d => d.room === room);
  }

  /** 获取单个设备 */
  getById(id) {
    return this.devices.get(id);
  }

  /**
   * 执行设备操作 - 核心方法
   * @param {string} deviceId - 设备ID
   * @param {string} action - 操作名
   * @param {object} params - 操作参数
   * @returns {{ success: boolean, result: object }}
   */
  executeAction(deviceId, action, params = {}) {
    const device = this.devices.get(deviceId);
    if (!device) return { success: false, error: `设备 ${deviceId} 不存在` };
    if (!device.online) return { success: false, error: `设备 ${device.name} 离线` };
    if (!device.actions.includes(action)) return { success: false, error: `不支持操作: ${action}` };

    // 模拟执行延迟和成功率（模拟真实IoT环境）
    return new Promise((resolve) => {
      const delay = 200 + Math.random() * 500;
      const failRate = 0.05; // 5%模拟失败率

      setTimeout(() => {
        if (Math.random() < failRate) {
          resolve({ success: false, error: `${device.name} 执行失败（网络超时）` });
          return;
        }

        // 执行状态变更
        switch (action) {
          case 'setPower':
            device.status.power = params.power !== undefined ? params.power : !device.status.power;
            break;
          case 'setBrightness':
            device.status.brightness = params.value;
            break;
          case 'setColorTemp':
            device.status.colorTemp = params.value;
            break;
          case 'setColor':
            device.status.color = params.value;
            break;
          case 'setMode':
            device.status.mode = params.mode;
            break;
          case 'setTemp':
            device.status.temp = params.temp;
            break;
          case 'setFanSpeed':
            device.status.fanSpeed = params.speed;
            break;
          case 'setPosition':
            device.status.position = params.position;
            break;
          case 'lock':
            device.status.locked = true; break;
          case 'unlock':
            device.status.locked = false; break;
          case 'setVolume':
            device.status.volume = params.volume; break;
          case 'setSource':
            device.status.source = params.source; break;
          case 'setHumidity':
            device.status.humidityTarget = params.humidity; break;
          case 'setPrivacy':
            device.status.privacy = params.privacy; break;
          case 'startClean':
            device.status.power = true; device.status.charging = false; break;
          case 'stopClean':
            device.status.power = false; break;
          default:
            break;
        }

        const result = {
          success: true,
          deviceId,
          deviceName: device.name,
          action,
          params,
          newState: this._deepClone(device.status)
        };

        this._emit('actionExecuted', result);
        resolve(result);

      }, delay);
    });
  }

  /** 订阅事件 */
  on(event, callback) {
    this.eventListeners.push({ event, callback });
  }

  _emit(event, data) {
    this.eventListeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }
}

// 全局实例
const deviceManager = new DeviceManager(DEVICE_REGISTRY);
