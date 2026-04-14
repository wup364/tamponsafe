/**
 * TamponSafe - 卫生棉条防忘提醒系统
 * 主应用脚本
 * 
 * 功能说明：
 * - 棉条使用计时和提醒
 * - 历史记录管理（查看、编辑、删除）
 * - 设置管理（时长阈值）
 * - 数据导入/导出
 * - 桌面通知提醒
 */

// ============================================
// 数据管理
// ============================================

// 数据存储键名
const STORAGE_KEY = 'tamponsafe_data';

// 标签配置：标签ID、显示名称、Emoji图标
const TAGS = [
  { id: 'normal', label: '正常', emoji: '🌸' },
  { id: 'heavy', label: '量多', emoji: '🔴' },
  { id: 'light', label: '量少', emoji: '🔵' },
  { id: 'comfort', label: '舒适', emoji: '😊' },
  { id: 'leak', label: '漏液', emoji: '💦' },
  { id: 'painful', label: '腹痛', emoji: '😣' },
];

const DEFAULT_SETTINGS = {
  minDuration: 4,       // 最小建议时长（小时）
  maxDuration: 8,       // 最大建议时长（小时）
  warningThreshold: 8,  // 警告阈值（小时）
  reminderEnabled: false // 是否启用通知提醒
};

// 应用数据对象
// - lastSync: 最后同步时间
// - currentStatus: 当前状态（active/idle）
// - startTime: 开始使用时间
// - history: 历史记录数组
// - settings: 用户设置
let appData = {
  lastSync: new Date().toISOString(),
  currentStatus: 'idle',
  startTime: null,
  history: [],
  settings: { ...DEFAULT_SETTINGS }
};

// 当前选择的标签（用于添加记录）
let selectedTags = [];

// 编辑历史记录时使用的变量
let editingRecordIndex = -1;   // 正在编辑的记录索引
let editingSelectedTags = [];  // 编辑时选择的标签

/**
 * 从 localStorage 加载应用数据
 */
function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      appData = { ...appData, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

/**
 * 保存应用数据到 localStorage
 */
function saveData() {
  appData.lastSync = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/**
 * 计算使用时长（小时）
 * @param {number} start - 开始时间戳
 * @param {number} end - 结束时间戳（默认为当前时间）
 * @returns {number} 使用时长（小时）
 */
function calculateDuration(start, end = null) {
  if (!start) return 0;
  const durationMs = (end || Date.now()) - start;
  return durationMs / (1000 * 60 * 60);
}

/**
 * 将小时数格式化为中文时长
 * @param {number} hours - 小时数
 * @param {boolean} includeMinutes - 是否包含分钟
 * @returns {string} 格式化后的时长
 */
function formatDuration(hours, includeMinutes = true) {
  if (hours < 0) hours = 0;
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  
  let result = '';
  if (h > 0) {
    result = `${h}小时`;
  }
  if (includeMinutes) {
    result += result ? ' ' : '';
    result += `${m}分钟`;
  }
  return result || '0 分钟';
}

/**
 * 格式化时间戳为日期时间字符串
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期时间
 */
function formatDate(timestamp) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 格式化时间范围
 * @param {number} start - 开始时间戳
 * @param {number} end - 结束时间戳
 * @returns {string} 时间范围字符串
 */
function formatTimeRange(start, end) {
  const startTime = new Date(start);
  const endTime = new Date(end);
  return `${startTime.getHours()}:${String(startTime.getMinutes()).padStart(2, '0')} - ${endTime.getHours()}:${String(endTime.getMinutes()).padStart(2, '0')}`;
}

/**
 * 检查是否需要恢复使用状态
 * 如果用户上次使用后未取出，且浏览器已关闭，需要重新提醒
 */
function checkRestoredState() {
  if (appData.currentStatus === 'active' && appData.startTime) {
    const hours = calculateDuration(appData.startTime);
    const warningThreshold = appData.settings.warningThreshold || 8;
    const minDuration = appData.settings.minDuration || 4;
    if (hours > warningThreshold) {
      showToast('⚠️ 检测到棉条已放置超过 ' + warningThreshold + ' 小时！请立即取出！', 'error');
      setTimeout(requestNotificationPermission, 2000);
    } else if (hours >= minDuration) {
      showToast('⏰ 棉条已使用超过 ' + minDuration + ' 小时，请及时取出！', 'warning');
    }
  }
}

// ============================================
// 通知系统
// ============================================

/**
 * 请求桌面通知权限
 * @returns {Promise<boolean>} 是否获得权限
 */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('⚠️ 您的浏览器不支持通知功能', 'warning');
    return false;
  }

  if (Notification.permission === 'granted') {
    appData.settings.reminderEnabled = true;
    saveData();
    showToast('✅ 通知已启用', 'success');
    return true;
  }

  if (Notification.permission === 'denied') {
    showToast('⚠️ 通知权限已被拒绝，请在浏览器设置中开启', 'warning');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    appData.settings.reminderEnabled = (permission === 'granted');
    saveData();
    return permission === 'granted';
  } catch (e) {
    console.error('请求通知权限失败:', e);
    return false;
  }
}

/**
 * 发送桌面通知
 * @param {string} title - 通知标题
 * @param {object} options - 通知选项
 */
function sendNotification(title, options) {
  if (Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

// ============================================
// UI 更新
// ============================================

/**
 * 更新主界面 UI
 * 根据当前状态显示相应的界面元素
 */
function updateUI() {
  const statusCard = document.getElementById('statusCard');
  const statusIcon = document.getElementById('statusIcon');
  const statusBadge = document.getElementById('statusBadge');
  const statusTitle = document.getElementById('statusTitle');
  const statusDescription = document.getElementById('statusDescription');
  const timerSection = document.getElementById('timerSection');
  const elapsedTime = document.getElementById('elapsedTime');
  const remainingTime = document.getElementById('remainingTime');
  const criticalAlert = document.getElementById('criticalAlert');
  const insertBtn = document.getElementById('insertBtn');
  const removeBtn = document.getElementById('removeBtn');

  if (appData.currentStatus === 'active' && appData.startTime) {
    const hours = calculateDuration(appData.startTime);
    const warningThreshold = appData.settings.warningThreshold || 8;
    const isWarning = hours > warningThreshold;

    statusCard.className = 'status-card' + (isWarning ? ' warning critical' : '');
    statusIcon.textContent = isWarning ? '🚨' : '⏰';
    statusBadge.textContent = '使用中';
    statusBadge.className = 'status-badge active';
    statusTitle.textContent = isWarning ? `已超过 ${formatDuration(warningThreshold)}！` : '棉条正在使用中';
    statusDescription.textContent = isWarning ? '请立即取出，避免健康风险' : '系统将持续为您计时提醒';

    timerSection.style.display = 'block';
    elapsedTime.textContent = formatDuration(hours) + ' (' + formatTimeRange(appData.startTime, Date.now()) + ')';
    const remaining = Math.max(0, appData.settings.warningThreshold - hours);
    remainingTime.textContent = '剩余 ' + formatDuration(remaining, true);

    criticalAlert.style.display = isWarning ? 'block' : 'none';

    insertBtn.style.display = 'none';
    removeBtn.style.display = 'flex';
  } else {
    statusCard.className = 'status-card';
    statusIcon.textContent = '💤';
    statusBadge.textContent = '空闲';
    statusBadge.className = 'status-badge idle';
    statusTitle.textContent = '当前安全，体内无棉条';
    statusDescription.textContent = '您可以随时记录新的使用';

    timerSection.style.display = 'none';
    criticalAlert.style.display = 'none';

    insertBtn.style.display = 'flex';
    removeBtn.style.display = 'none';
  }

  const notifyBtn = document.getElementById('notifyBtn');
  if (notifyBtn) {
    notifyBtn.textContent = appData.settings.reminderEnabled ? '🔔 提醒已启用' : '🔔 启用提醒';
    notifyBtn.className = 'btn btn-small ' + (appData.settings.reminderEnabled ? 'btn-success' : 'btn-secondary');
  }

  updateHistoryUI();
  saveData();
}

/**
 * 更新统计数据 UI
 * 显示平均使用时长和记录总数
 */
function updateStatsUI() {
  const avgDurationEl = document.getElementById('avgDuration');
  if (!avgDurationEl) return;
  
  if (appData.history.length === 0) {
    avgDurationEl.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">暂无记录</span>';
    return;
  }
  
  const totalRecords = appData.history.length;
  const totalHours = appData.history.reduce((sum, record) => sum + record.durationHours, 0);
  const avgDuration = formatDuration(totalHours / totalRecords, true);
  
  avgDurationEl.innerHTML = `<span style="font-size: 14px; font-weight: 700;">${avgDuration}</span><br><span style="font-size: 12px; color: var(--text-muted);">共 ${totalRecords} 条记录</span>`;
}

/**
 * 更新历史记录 UI
 * 显示最近 10 条历史记录
 */
function updateHistoryUI() {
  const historyList = document.getElementById('historyList');
  const recentHistory = appData.history.slice(-10).reverse();
  
  updateStatsUI();

  if (recentHistory.length === 0) {
    historyList.innerHTML = `
      <div class="empty-history">
        <span>📝</span>
        <p>暂无历史记录</p>
        <p style="font-size: 12px; margin-top: 8px;">记录将在这里显示</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = recentHistory.map((item, index) => {
    let tagHtml = '';
    if (item.tags && item.tags.length > 0) {
      tagHtml = item.tags.map(tagId => {
        const tag = TAGS.find(t => t.id === tagId);
        return tag ? `<span class="history-tag">${tag.emoji}${tag.label}</span>` : '';
      }).join('');
    }
    let noteHtml = item.note ? `<div class="history-note">${item.note}</div>` : '';
    
    const originalIndex = appData.history.length - 1 - index;
    
    return `
    <div class="history-item" data-index="${originalIndex}">
      <div class="history-content">
        <div class="history-date">${formatDate(item.start).split(' ')[0]}</div>
        <div class="history-times">${formatTimeRange(item.start, item.end)}</div>
        ${tagHtml ? `<div class="history-tags">${tagHtml}</div>` : ''}
        ${noteHtml}
      </div>
      <div class="history-duration">${formatDuration(item.durationHours)}</div>
    </div>
    `;
  }).join('');
  
  historyList.querySelectorAll('.history-item').forEach(item => {
    const index = parseInt(item.dataset.index);
    
    // 点击整条记录打开编辑模态框
    item.addEventListener('click', () => {
      openEditHistoryModal(index);
    });
  });
}

/**
 * 显示提示信息
 * @param {string} message - 提示内容
 * @param {string} type - 提示类型（success/error/warning/info）
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

/**
 * 打开模态框
 * @param {string} id - 模态框 ID
 */
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

/**
 * 关闭模态框
 * @param {string} id - 模态框 ID
 */
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ============================================
// 设置管理
// ============================================

/**
 * 打开设置模态框
 */
function openSettingsModal() {
  const minDurationInput = document.getElementById('minDurationInput');
  const maxDurationInput = document.getElementById('maxDurationInput');
  const warningThresholdInput = document.getElementById('warningThresholdInput');
  
  minDurationInput.value = appData.settings.minDuration || 4;
  maxDurationInput.value = appData.settings.maxDuration || 8;
  warningThresholdInput.value = appData.settings.warningThreshold || 8;
  
  openModal('settingsModal');
}

/**
 * 保存设置
 * 验证设置值的有效性并保存
 */
function saveSettings() {
  const minDurationInput = document.getElementById('minDurationInput');
  const maxDurationInput = document.getElementById('maxDurationInput');
  const warningThresholdInput = document.getElementById('warningThresholdInput');
  
  const minDuration = parseFloat(minDurationInput.value) || 4;
  const maxDuration = parseFloat(maxDurationInput.value) || 8;
  const warningThreshold = parseFloat(warningThresholdInput.value) || 8;
  
  if (minDuration >= warningThreshold - 0.01) {
    showToast('⚠️ 最小时长必须小于警告阈值', 'error');
    return;
  }
  
  if (minDuration >= maxDuration - 0.01) {
    showToast('⚠️ 最小时长必须小于最大时长', 'error');
    return;
  }
  
  appData.settings.minDuration = minDuration;
  appData.settings.maxDuration = maxDuration;
  appData.settings.warningThreshold = warningThreshold;
  saveData();
  
  closeModal('settingsModal');
  showToast('✅ 设置已保存', 'success');
  updateUI();
}

// ============================================
// 数据导出功能
// ============================================

/**
 * 导出数据为 JSON 文件
 * 包含版本号、导出时间等元数据
 */
function exportData() {
  try {
    const exportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      data: {
        lastSync: appData.lastSync,
        currentStatus: appData.currentStatus,
        startTime: appData.startTime,
        history: appData.history,
        settings: appData.settings
      }
    };
    
    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const fileName = `tamponsafe_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.href = url;
    a.download = fileName;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    showToast('✅ 数据导出成功', 'success');
  } catch (e) {
    console.error('导出失败:', e);
    showToast('❌ 数据导出失败：' + e.message, 'error');
  }
}

// ============================================
// 数据导入功能
// ============================================

/**
 * 从文件读取并导入数据
 * @param {File} file - 选择的文件对象
 */
function importData(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      if (!importedData.data) {
        showToast('❌ 无效的数据格式', 'error');
        return;
      }
      
      const historyCount = importedData.data.history ? importedData.data.history.length : 0;
      if (!confirm(`将导入 ${historyCount} 条历史记录，当前数据将被覆盖。确定继续吗？`)) {
        return;
      }
      
      appData = {
        lastSync: importedData.data.lastSync || new Date().toISOString(),
        currentStatus: importedData.data.currentStatus || 'idle',
        startTime: importedData.data.startTime || null,
        history: importedData.data.history || [],
        settings: { ...DEFAULT_SETTINGS, ...(importedData.data.settings || {}) }
      };
      
      saveData();
      updateUI();
      
      closeModal('settingsModal');
      showToast('✅ 数据导入成功', 'success');
    } catch (err) {
      console.error('导入失败:', err);
      showToast('❌ 数据导入失败：文件格式错误', 'error');
    }
  };
  
  reader.onerror = function() {
    showToast('❌ 文件读取失败', 'error');
  };
  
  reader.readAsText(file);
}

/**
 * 处理文件选择事件
 * @param {Event} event - 文件选择事件
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    importData(file);
    event.target.value = '';
  }
}

// ============================================
// 核心操作
// ============================================

/**
 * 处理插入棉条操作
 */
function handleInsert() {
  if (appData.currentStatus === 'active' && appData.startTime) {
    document.getElementById('existingDuration').textContent = formatDuration(calculateDuration(appData.startTime));
    openModal('doubleWarningModal');
    return;
  }

  appData.currentStatus = 'active';
  appData.startTime = Date.now();
  
  document.getElementById('insertTime').textContent = formatDate(appData.startTime);
  
  openModal('insertModal');
  updateUI();

  if (appData.settings.reminderEnabled) {
    checkReminders();
  }
}

/**
 * 处理取出棉条操作
 * 根据使用时长显示不同的确认提示
 */
function handleRemove() {
  if (appData.currentStatus !== 'active' || !appData.startTime) {
    showToast('当前无棉条，无需操作', 'warning');
    return;
  }

  const hours = calculateDuration(appData.startTime);
  const warningThreshold = appData.settings.warningThreshold || 8;
  const minDuration = appData.settings.minDuration || 4;
  
  if (hours > warningThreshold) {
    document.getElementById('criticalRemoveDuration').textContent = formatDuration(hours);
    openModal('criticalRemoveModal');
  } else if (hours < minDuration) {
    document.getElementById('earlyRemoveDuration').textContent = formatDuration(hours);
    openModal('earlyRemoveModal');
  } else {
    openConfirmRemoveModal(hours, (tags, note) => {
      confirmRemove(tags, note);
    });
  }
}

/**
 * 处理过早取出确认
 */
function handleEarlyRemoveConfirm() {
  closeModal('earlyRemoveModal');
  const hours = calculateDuration(appData.startTime);
  openConfirmRemoveModal(hours, (tags, note) => {
    confirmRemove(tags, note);
  });
}

/**
 * 处理超时取出确认
 */
function handleCriticalRemoveConfirm() {
  closeModal('criticalRemoveModal');
  const hours = calculateDuration(appData.startTime);
  openConfirmRemoveModal(hours, (tags, note) => {
    confirmRemove(tags, note);
  });
}

/**
 * 打开确认取出模态框
 * @param {number} duration - 使用时长
 * @param {function} callback - 确认后的回调函数
 */
function openConfirmRemoveModal(duration, callback) {
  document.getElementById('confirmRemoveDuration').textContent = formatDuration(duration);
  selectedTags = [];
  
  const tagGrid = document.getElementById('tagGrid');
  tagGrid.innerHTML = TAGS.map(tag => `
    <div class="tag-option" data-tag-id="${tag.id}">
      <span>${tag.emoji}</span>
      <span>${tag.label}</span>
    </div>
  `).join('');

  tagGrid.querySelectorAll('.tag-option').forEach(option => {
    option.addEventListener('click', () => {
      const tagId = option.dataset.tagId;
      if (selectedTags.includes(tagId)) {
        selectedTags = selectedTags.filter(id => id !== tagId);
        option.classList.remove('selected');
      } else {
        selectedTags.push(tagId);
        option.classList.add('selected');
      }
    });
  });

  const noteInput = document.getElementById('noteInput');
  const charCount = document.getElementById('charCount');
  noteInput.value = '';
  charCount.textContent = '0';
  noteInput.addEventListener('input', () => {
    charCount.textContent = noteInput.value.length;
  });

  const confirmBtn = document.getElementById('confirmRemoveBtn');
  confirmBtn.onclick = () => {
    const note = noteInput.value.trim();
    closeModal('confirmRemoveModal');
    if (callback) callback(selectedTags, note);
  };

  openModal('confirmRemoveModal');
}

/**
 * 确认取出并记录
 * @param {string[]} tags - 选择的标签
 * @param {string} note - 备注
 */
function confirmRemove(tags = [], note = '') {
  if (!appData.startTime) return;

  const end = Date.now();
  const duration = calculateDuration(appData.startTime, end);
  const start = appData.startTime;
  const warningThreshold = appData.settings.warningThreshold || 8;

  const record = {
    id: Date.now(),
    start: start,
    end: end,
    durationHours: duration,
    date: new Date(start).toISOString().split('T')[0],
    tags: tags,
    note: note
  };

  appData.history.push(record);
  appData.currentStatus = 'idle';
  appData.startTime = null;

  updateUI();
  
  let msg = '✅ 已记录取出，时间：' + formatDuration(duration);
  if (tags.length > 0) {
    msg += ' ' + tags.map(id => {
      const tag = TAGS.find(t => t.id === id);
      return tag ? tag.emoji + tag.label : '';
    }).filter(Boolean).join(' ');
  }
  if (note) {
    msg += ' - ' + note;
  }
  showToast(msg, 'success');

  if (duration > warningThreshold) {
    sendNotification('⚠️ 超时警告', {
      body: `您的棉条已使用超过 ${formatDuration(warningThreshold)}，请及时取出避免健康风险。`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>'
    });
  }
}

// ============================================
// 历史记录编辑功能
// ============================================

/**
 * 打开编辑历史记录模态框
 * @param {number} index - 历史记录索引
 */
function openEditHistoryModal(index) {
  editingSelectedTags = [];
  editingRecordIndex = index;
  
  const record = JSON.parse(JSON.stringify(appData.history[index]));
  
  document.getElementById('editCurrentDuration').textContent = formatDuration(record.durationHours);
  
  const editTagGrid = document.getElementById('editTagGrid');
  editTagGrid.innerHTML = TAGS.map(tag => `
    <div class="tag-option" data-tag-id="${tag.id}">
      <span>${tag.emoji}</span>
      <span>${tag.label}</span>
    </div>
  `).join('');
  
  editingSelectedTags = record.tags || [];
  
  editTagGrid.querySelectorAll('.tag-option').forEach(option => {
    const tagId = option.dataset.tagId;
    if (editingSelectedTags.includes(tagId)) {
      option.classList.add('selected');
    } else {
      option.classList.remove('selected');
    }
  });
  
  const editNoteInput = document.getElementById('editNoteInput');
  editNoteInput.value = record.note || '';
  
  const editCharCount = document.getElementById('editCharCount');
  editCharCount.textContent = editNoteInput.value.length;
  
  editNoteInput.addEventListener('input', () => {
    editCharCount.textContent = editNoteInput.value.length;
  });
  
  editTagGrid.querySelectorAll('.tag-option').forEach(option => {
    option.addEventListener('click', () => {
      const tagId = option.dataset.tagId;
      
      if (option.classList.contains('selected')) {
        option.classList.remove('selected');
        editingSelectedTags = editingSelectedTags.filter(id => id !== tagId);
      } else {
        option.classList.add('selected');
        editingSelectedTags.push(tagId);
      }
    });
  });
  
  openModal('editHistoryModal');
}

/**
 * 保存编辑后的历史记录
 */
function saveEditHistory() {
  if (editingRecordIndex < 0 || editingRecordIndex >= appData.history.length) {
    showToast('❌ 无法保存编辑', 'error');
    return;
  }
  
  const record = appData.history[editingRecordIndex];
  record.tags = editingSelectedTags;
  record.note = document.getElementById('editNoteInput').value.trim();
  record.lastEdited = new Date().toISOString();
  
  saveData();
  updateUI();
  closeModal('editHistoryModal');
  showToast('✅ 记录已更新', 'success');
}

/**
 * 删除历史记录
 * @param {number} index - 历史记录索引
 */
function deleteHistoryRecord(index) {
  if (index < 0 || index >= appData.history.length) return;
  
  const record = appData.history[index];
  
  if (confirm(`确定要删除这条记录吗？\n\n${formatDate(record.start)} ${formatDuration(record.durationHours)}`)) {
    appData.history.splice(index, 1);
    saveData();
    updateUI();
    showToast('✅ 记录已删除', 'success');
  }
}

// ============================================
// 提醒系统
// ============================================

/**
 * 检查是否需要发送提醒通知
 * - 达到最小建议时长提醒
 * - 达到警告阈值严重提醒
 */
function checkReminders() {
  if (appData.currentStatus !== 'active' || !appData.startTime) return;

  const hours = calculateDuration(appData.startTime);
  const minDuration = appData.settings.minDuration || 4;
  const warningThreshold = appData.settings.warningThreshold || 8;

  if (hours >= minDuration && hours < minDuration + 0.1) {
    sendNotification('⏰ 提醒', {
      body: '您的棉条已使用 ' + minDuration + ' 小时，可以考虑取出了。',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⏰</text></svg>'
    });
    showToast('⏰ 已使用 ' + minDuration + ' 小时，建议考虑取出', 'warning');
  }

  if (hours >= warningThreshold && hours < warningThreshold + 0.1) {
    sendNotification('🚨 严重警告', {
      body: '您的棉条已使用 ' + warningThreshold + ' 小时，请立即取出！存在健康风险。',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>'
    });
    showToast('🚨 已使用 ' + warningThreshold + ' 小时，请立即取出！', 'error');
  }
}

/**
 * 启动提醒检查器（每分钟检查一次）
 */
function startReminderChecker() {
  setInterval(checkReminders, 60000);
}

/**
 * 启动计时器更新器（每 30 秒更新界面显示）
 */
function startTimerUpdater() {
  setInterval(() => {
    if (appData.currentStatus === 'active' && appData.startTime) {
      const elapsedTime = document.getElementById('elapsedTime');
      const remainingTime = document.getElementById('remainingTime');
      
      if (elapsedTime && remainingTime) {
        const hours = calculateDuration(appData.startTime);
        elapsedTime.textContent = formatDuration(hours) + ' (' + formatTimeRange(appData.startTime, Date.now()) + ')';
        const remaining = Math.max(0, appData.settings.warningThreshold - hours);
        remainingTime.textContent = '剩余 ' + formatDuration(remaining, true);
      }
    }
  }, 30000);
}

// ============================================
// 事件绑定
// ============================================

/**
 * 绑定所有事件处理函数
 */
function bindEvents() {
  document.getElementById('insertBtn').addEventListener('click', handleInsert);
  document.getElementById('removeBtn').addEventListener('click', handleRemove);
  document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('exportDataBtn').addEventListener('click', exportData);
  document.getElementById('importDataBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', handleFileSelect);
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      appData.history = [];
      updateUI();
      showToast('✅ 历史记录已清空', 'success');
    }
  });
  document.getElementById('historyExpandBtn').addEventListener('click', () => {
    document.getElementById('historySection').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('saveEditBtn').addEventListener('click', saveEditHistory);
  document.getElementById('deleteHistoryBtn').addEventListener('click', () => {
    if (confirm('确定要删除这条记录吗？此操作不可恢复。')) {
      deleteHistoryRecord(editingRecordIndex);
      closeModal('editHistoryModal');
    }
  });

  document.getElementById('confirmEarlyRemove').addEventListener('click', handleEarlyRemoveConfirm);
  document.getElementById('confirmCriticalRemove').addEventListener('click', handleCriticalRemoveConfirm);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && appData.currentStatus === 'active') {
      const hours = calculateDuration(appData.startTime);
      const warningThreshold = appData.settings.warningThreshold || 8;
      const minDuration = appData.settings.minDuration || 4;
      if (hours >= warningThreshold) {
        showToast('⚠️ 您的棉条已超时！请立即取出！', 'error');
      } else if (hours >= minDuration) {
        showToast('⏰ 您的棉条已使用 ' + minDuration + ' 小时，请注意时间。', 'warning');
      }
    }
  });
}

// ============================================
// 初始化
// ============================================

/**
 * 初始化应用
 * - 加载数据
 * - 绑定事件
 * - 检查恢复状态
 * - 更新界面
 * - 启动定时器
 */
function init() {
  loadData();
  bindEvents();
  checkRestoredState();
  updateUI();
  startReminderChecker();
  startTimerUpdater();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();