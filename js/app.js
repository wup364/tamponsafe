/**
 * ============================================
 * TamponSafe - 主应用脚本
 * 卫生棉条防忘提醒系统
 * ============================================
 */

// ============================================
// 数据管理
// ============================================
const STORAGE_KEY = 'tamponsafe_data';

// 标签配置
const TAGS = [
  { id: 'normal', label: '🌸 正常', emoji: '🌸' },
  { id: 'heavy', label: '🔴 量多', emoji: '🔴' },
  { id: 'light', label: '🔵 量少', emoji: '🔵' },
  { id: 'comfort', label: '😊 舒适', emoji: '😊' },
  { id: 'leak', label: '💦 漏液', emoji: '💦' },
  { id: 'painful', label: '😣 腹痛', emoji: '😣' },
];

const DEFAULT_SETTINGS = {
  minDuration: 4,      // 最小建议时长（小时）
  maxDuration: 8,      // 最大建议时长（小时）
  warningThreshold: 8, // 警告阈值（小时）
  reminderEnabled: false
};

let appData = {
  lastSync: new Date().toISOString(),
  currentStatus: 'idle',
  startTime: null,
  history: [],
  settings: { ...DEFAULT_SETTINGS }
};

// 当前选择的标签
let selectedTags = [];

// 加载数据
function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // 确保 settings 被正确合并
      appData = { ...appData, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) } };
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

// 保存数据
function saveData() {
  appData.lastSync = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

// 更新插入模态框中的建议时长文本
function updateInsertModalDurationText() {
  const minDuration = appData.settings.minDuration || 4;
  const maxDuration = appData.settings.maxDuration || 8;
  const insertModalDurationText = document.getElementById('insertModalDurationText');
  if (insertModalDurationText) {
    insertModalDurationText.textContent = formatDuration(minDuration) + '-' + formatDuration(maxDuration);
  }
}

// 更新提前取出确认模态框中的建议时长文本
function updateEarlyRemoveSuggestionText() {
  const minDuration = appData.settings.minDuration || 4;
  const maxDuration = appData.settings.maxDuration || 8;
  const earlyRemoveSuggestionText = document.getElementById('earlyRemoveSuggestionText');
  if (earlyRemoveSuggestionText) {
    earlyRemoveSuggestionText.textContent = formatDuration(minDuration) + '-' + formatDuration(maxDuration);
  }
}

// 计算时长（小时，带小数）
function calculateDuration(start, end = null) {
  if (!start) return 0;
  const durationMs = (end || Date.now()) - start;
  return durationMs / (1000 * 60 * 60);
}

// 格式化时长为中文 
function formatDuration(hours, includeMinutes = true) {
  if (hours < 0) hours = 0;
  let h = Math.floor(hours);
  let m = Math.round((hours - Math.floor(hours)) * 60);
  
  // 如果分钟数等于 60，进位到小时
  if (m >= 60) {
    h += 1;
    m = 0;
  }
  
  let result = '';
  if (h > 0) {
    result = `${h}小时`;
  }
  if (includeMinutes) {
    // 始终显示分钟，即使为 0
    result += result ? ' ' : '';
    result += `${m}分钟`;
  }
  return result || '0 分钟';
}

// 格式化日期
function formatDate(timestamp) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// 检查是否需要恢复使用状态（上次关闭前是活跃状态）
function checkRestoredState() {
  if (appData.currentStatus === 'active' && appData.startTime) {
    const hours = calculateDuration(appData.startTime);
    const warningThreshold = appData.settings.warningThreshold || 8;
    const minDuration = appData.settings.minDuration || 4;
    if (hours > warningThreshold) {
      showToast('⚠️ 检测到棉条已放置超过 ' + warningThreshold + ' 小时！请立即取出！', 'error');
      setTimeout(() => requestNotificationPermission(), 2000);
    } else if (hours >= minDuration) {
      showToast('⏰ 棉条已使用超过 ' + minDuration + ' 小时，请及时取出！', 'warning');
    }
  }
}

// ============================================
// 通知系统
// ============================================
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

function sendNotification(title, options) {
  if (Notification.permission === 'granted') {
    new Notification(title, options);
  }
}

// ============================================
// UI 更新
// ============================================
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

    // 更新状态卡片
    statusCard.className = 'status-card' + (isWarning ? ' warning critical' : '');
    statusIcon.textContent = isWarning ? '🚨' : '⏰';
    statusBadge.textContent = '使用中';
    statusBadge.className = 'status-badge active';
    statusTitle.textContent = isWarning ? `已超过 ${formatDuration(warningThreshold)}！` : '棉条正在使用中';
    statusDescription.textContent = isWarning ? '请立即取出，避免健康风险' : '系统将持续为您计时提醒';

    // 显示计时器
    timerSection.style.display = 'block';
    elapsedTime.textContent = formatDuration(hours) + ' (' + formatTimePrecise(appData.startTime) + ')';
    const remaining = Math.max(0, appData.settings.warningThreshold - hours);
    remainingTime.textContent = '剩余 ' + formatDuration(remaining, true);

    // 显示警告
    criticalAlert.style.display = isWarning ? 'block' : 'none';

    // 更新按钮
    insertBtn.style.display = 'none';
    removeBtn.style.display = 'flex';
  } else {
    // 空闲状态
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

  // 更新通知按钮状态
  const notifyBtn = document.getElementById('notifyBtn');
  if (notifyBtn) {
    notifyBtn.textContent = appData.settings.reminderEnabled ? '🔔 提醒已启用' : '🔔 启用提醒';
    notifyBtn.className = 'btn btn-small ' + (appData.settings.reminderEnabled ? 'btn-success' : 'btn-secondary');
  }

  updateHistoryUI();
  saveData();
}

function formatTimePrecise(timestamp) {
  const now = Date.now();
  const start = new Date(timestamp);
  const end = new Date();
  return `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`;
}

// 更新平均时长统计
function updateStatsUI() {
  const avgDurationEl = document.getElementById('avgDuration');
  
  if (!avgDurationEl) return;
  
  if (appData.history.length === 0) {
    avgDurationEl.textContent = '-';
    return;
  }
  
  // 计算平均时长
  const totalHours = appData.history.reduce((sum, record) => sum + record.durationHours, 0);
  const avgHours = totalHours / appData.history.length;
  
  avgDurationEl.textContent = formatDuration(avgHours, true);
}

function updateHistoryUI() {
  const historyList = document.getElementById('historyList');
  const recentHistory = appData.history.slice(-10).reverse();
  
  // 更新统计
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

  historyList.innerHTML = recentHistory.map(item => {
    let tagHtml = '';
    if (item.tags && item.tags.length > 0) {
      tagHtml = item.tags.map(tagId => {
        const tag = TAGS.find(t => t.id === tagId);
        return tag ? `<span class="history-tag">${tag.emoji}${tag.label.replace(tag.emoji, '').trim()}</span>` : '';
      }).join('');
    }
    let noteHtml = item.note ? `<div class="history-note">${item.note}</div>` : '';
    
    return `
    <div class="history-item">
      <div>
        <div class="history-date">${formatDate(item.start).split(' ')[0]}</div>
        <div class="history-times">${formatDate(item.start).split(' ')[1]} → ${formatDate(item.end).split(' ')[1]}</div>
        ${tagHtml ? `<div class="history-tags">${tagHtml}</div>` : ''}
        ${noteHtml}
      </div>
      <div class="history-duration">${formatDuration(item.durationHours)}</div>
    </div>
    `;
  }).join('');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// 打开设置模态框
function openSettingsModal() {
  const minDurationInput = document.getElementById('minDurationInput');
  const maxDurationInput = document.getElementById('maxDurationInput');
  const warningThresholdInput = document.getElementById('warningThresholdInput');
  
  // 填充当前设置值
  minDurationInput.value = appData.settings.minDuration || 4;
  maxDurationInput.value = appData.settings.maxDuration || 8;
  warningThresholdInput.value = appData.settings.warningThreshold || 8;
  
  openModal('settingsModal');
}

// 保存设置
function saveSettings() {
  const minDurationInput = document.getElementById('minDurationInput');
  const maxDurationInput = document.getElementById('maxDurationInput');
  const warningThresholdInput = document.getElementById('warningThresholdInput');
  
  const minDuration = parseFloat(minDurationInput.value) || 4;
  const maxDuration = parseFloat(maxDurationInput.value) || 8;
  const warningThreshold = parseFloat(warningThresholdInput.value) || 8;
  
  // 验证设置（支持小数比较）
  if (minDuration >= warningThreshold - 0.01) {
    showToast('⚠️ 最小时长必须小于警告阈值', 'error');
    return;
  }
  
  if (minDuration >= maxDuration - 0.01) {
    showToast('⚠️ 最小时长必须小于最大时长', 'error');
    return;
  }
  
  // 保存设置
  appData.settings.minDuration = minDuration;
  appData.settings.maxDuration = maxDuration;
  appData.settings.warningThreshold = warningThreshold;
  saveData();
  
  // 更新所有需要显示时长的地方
  updateInsertModalDurationText();
  updateEarlyRemoveSuggestionText();
  
  closeModal('settingsModal');
  showToast('✅ 设置已保存', 'success');
  updateUI();
}

// ============================================
// 数据导出功能
// ============================================
function exportData() {
  try {
    // 创建导出数据对象
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
    
    // 创建 JSON 字符串
    const jsonData = JSON.stringify(exportData, null, 2);
    
    // 创建下载链接
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // 生成文件名
    const fileName = `tamponsafe_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.href = url;
    a.download = fileName;
    
    // 触发下载
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // 释放 URL
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
function importData(file) {
  const reader = new FileReader();
  
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      
      // 验证数据格式
      if (!importedData.data) {
        showToast('❌ 无效的数据格式', 'error');
        return;
      }
      
      // 确认导入
      const historyCount = importedData.data.history ? importedData.data.history.length : 0;
      if (!confirm(`将导入 ${historyCount} 条历史记录，当前数据将被覆盖。确定继续吗？`)) {
        return;
      }
      
      // 导入数据
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

// 处理文件选择
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    importData(file);
    // 清空 input，允许重复选择同一文件
    event.target.value = '';
  }
}

// ============================================
// 核心操作
// ============================================
function handleInsert() {
  if (appData.currentStatus === 'active' && appData.startTime) {
    const hours = calculateDuration(appData.startTime);
    document.getElementById('existingDuration').textContent = formatDuration(hours);
    openModal('doubleWarningModal');
    return;
  }

  appData.currentStatus = 'active';
  appData.startTime = Date.now();
  
  document.getElementById('insertTime').textContent = formatDate(appData.startTime);
  
  // 更新插入模态框中的时长文本
  updateInsertModalDurationText();
  
  openModal('insertModal');
  
  updateUI();

  if (appData.settings.reminderEnabled) {
    checkReminders();
  }
}

function handleRemove() {
  if (appData.currentStatus !== 'active' || !appData.startTime) {
    showToast('当前无棉条，无需操作', 'warning');
    return;
  }

  const hours = calculateDuration(appData.startTime);

  const warningThreshold = appData.settings.warningThreshold || 8;
  const minDuration = appData.settings.minDuration || 4;
  
  // 优先级：先检查是否超时，再检查是否提前取出
  if (hours > warningThreshold) {
    // 已超时 - 显示严重警告
    document.getElementById('criticalRemoveDuration').textContent = formatDuration(hours);
    openModal('criticalRemoveModal');
  } else if (hours < minDuration) {
    // 未达最小建议时长 - 显示提前取出确认
    document.getElementById('earlyRemoveDuration').textContent = formatDuration(hours);
    // 更新提前取出确认模态框中的建议时长文本
    updateEarlyRemoveSuggestionText();
    openModal('earlyRemoveModal');
  } else {
    // 正常时间段打开带标签和备注的确认框
    openConfirmRemoveModal(hours, (tags, note) => {
      confirmRemove(tags, note);
    });
  }
}

// 提前取出确认后打开带标签和备注的确认框
function handleEarlyRemoveConfirm() {
  closeModal('earlyRemoveModal');
  const hours = calculateDuration(appData.startTime);
  
  openConfirmRemoveModal(hours, (tags, note) => {
    confirmRemove(tags, note);
  });
}

// 超取出确认后打开带标签和备注的确认框
function handleCriticalRemoveConfirm() {
  closeModal('criticalRemoveModal');
  const hours = calculateDuration(appData.startTime);
  openConfirmRemoveModal(hours, (tags, note) => {
    confirmRemove(tags, note);
  });
}

// 打开确认取出模态框
function openConfirmRemoveModal(duration, callback) {
  document.getElementById('confirmRemoveDuration').textContent = formatDuration(duration);
  selectedTags = [];
  
  // 生成标签网格
  const tagGrid = document.getElementById('tagGrid');
  tagGrid.innerHTML = TAGS.map(tag => `
    <div class="tag-option" data-tag-id="${tag.id}">
      <span>${tag.emoji}</span>
      <span>${tag.label.replace(tag.emoji, '').trim()}</span>
    </div>
  `).join('');

  // 标签点击事件
  tagGrid.querySelectorAll('.tag-option').forEach(option => {
    option.addEventListener('click', () => {
      const tagId = option.dataset.tagId;
      const tag = TAGS.find(t => t.id === tagId);
      
      if (selectedTags.includes(tagId)) {
        // 取消选择
        selectedTags = selectedTags.filter(id => id !== tagId);
        option.classList.remove('selected');
      } else {
        // 选择标签
        selectedTags.push(tagId);
        option.classList.add('selected');
      }
    });
  });

  // 备注输入事件
  const noteInput = document.getElementById('noteInput');
  const charCount = document.getElementById('charCount');
  noteInput.value = '';
  charCount.textContent = '0';
  noteInput.addEventListener('input', () => {
    charCount.textContent = noteInput.value.length;
  });

  // 绑定确认按钮
  const confirmBtn = document.getElementById('confirmRemoveBtn');
  confirmBtn.onclick = () => {
    const note = noteInput.value.trim();
    closeModal('confirmRemoveModal');
    if (callback) callback(selectedTags, note);
  };

  openModal('confirmRemoveModal');
}

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
      return tag ? tag.emoji + tag.label.replace(tag.emoji, '').trim() : '';
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
// 提醒系统
// ============================================
function checkReminders() {
  if (appData.currentStatus !== 'active' || !appData.startTime) return;

  const hours = calculateDuration(appData.startTime);

  // 检查最小时长提醒
  if (hours >= (appData.settings.minDuration || 4) && hours < (appData.settings.minDuration || 4) + 0.1) {
    sendNotification('⏰ 提醒', {
      body: '您的棉条已使用 ' + (appData.settings.minDuration || 4) + ' 小时，可以考虑取出了。',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⏰</text></svg>'
    });
    showToast('⏰ 已使用 ' + (appData.settings.minDuration || 4) + ' 小时，建议考虑取出', 'warning');
  }

  // 检查警告阈值提醒
  if (hours >= (appData.settings.warningThreshold || 8) && hours < (appData.settings.warningThreshold || 8) + 0.1) {
    sendNotification('🚨 严重警告', {
      body: '您的棉条已使用 ' + (appData.settings.warningThreshold || 8) + ' 小时，请立即取出！存在健康风险。',
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>'
    });
    showToast('🚨 已使用 ' + (appData.settings.warningThreshold || 8) + ' 小时，请立即取出！', 'error');
  }
}

// 定期检查提醒
function startReminderChecker() {
  setInterval(checkReminders, 60000); // 每分钟检查一次
}

// 每 30 秒刷新计时显示
function startTimerUpdater() {
  setInterval(() => {
    if (appData.currentStatus === 'active' && appData.startTime) {
      updateTimerDisplay();
    }
  }, 30000); // 每 30 秒刷新一次
}

function updateTimerDisplay() {
  const elapsedTime = document.getElementById('elapsedTime');
  const remainingTime = document.getElementById('remainingTime');
  
  if (elapsedTime && remainingTime && appData.startTime) {
    const hours = calculateDuration(appData.startTime);
    elapsedTime.textContent = formatDuration(hours) + ' (' + formatTimePrecise(appData.startTime) + ')';
    const remaining = Math.max(0, appData.settings.warningThreshold - hours);
    remainingTime.textContent = '剩余 ' + formatDuration(remaining, true);
  }
}

// ============================================
// 事件绑定
// ============================================
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

  // 确认提前取出（打开带标签和备注的确认框）
  document.getElementById('confirmEarlyRemove').addEventListener('click', handleEarlyRemoveConfirm);

  // 确认超取出（打开带标签和备注的确认框）
  document.getElementById('confirmCriticalRemove').addEventListener('click', handleCriticalRemoveConfirm);

  // 窗口可见性检查（用户返回页面时检查）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && appData.currentStatus === 'active') {
      const hours = calculateDuration(appData.startTime);
      if (hours >= (appData.settings.warningThreshold || 8)) {
        showToast('⚠️ 您的棉条已超时！请立即取出！', 'error');
      } else if (hours >= (appData.settings.minDuration || 4)) {
        showToast('⏰ 您的棉条已使用 ' + (appData.settings.minDuration || 4) + ' 小时，请注意时间。', 'warning');
      }
    }
  });
}

// ============================================
// 初始化
// ============================================
function init() {
  loadData();
  bindEvents();
  checkRestoredState();
  updateUI();
  startReminderChecker();
}

// 启动应用
init();

// 启动计时器刷新（每 30 秒）
startTimerUpdater();

// 注册 Service Worker（用于 PWA 支持）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 忽略 Service Worker 注册失败
    });
  });
}