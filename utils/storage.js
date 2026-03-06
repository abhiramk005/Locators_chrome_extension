// utils/storage.js
// All chrome.storage.local operations — persists permanently across sessions

const Storage = {

  // ═══════════════════════════════════════════════
  // API KEYS — multiple named keys supported
  // Shape: [{ id, label, key }]
  // ═══════════════════════════════════════════════

  async getApiKeys() {
    const r = await chrome.storage.local.get('apiKeys');
    // Migrate legacy single key if present
    if (!r.apiKeys) {
      const legacy = await chrome.storage.local.get('apiKey');
      if (legacy.apiKey) {
        const keys = [{ id: 'default', label: 'Default', key: legacy.apiKey }];
        await chrome.storage.local.set({ apiKeys: keys });
        await chrome.storage.local.remove('apiKey');
        return keys;
      }
      return [];
    }
    return r.apiKeys || [];
  },

  async addApiKey(label, key) {
    const keys = await this.getApiKeys();
    const id   = 'key_' + Date.now();
    keys.push({ id, label: label || 'Key ' + (keys.length + 1), key });
    await chrome.storage.local.set({ apiKeys: keys });
    const activeId = await this.getActiveKeyId();
    if (!activeId) await this.setActiveKeyId(id);
    return keys;
  },

  async deleteApiKey(id) {
    const keys    = await this.getApiKeys();
    const updated = keys.filter(k => k.id !== id);
    await chrome.storage.local.set({ apiKeys: updated });
    const activeId = await this.getActiveKeyId();
    if (activeId === id) {
      await this.setActiveKeyId(updated.length > 0 ? updated[0].id : '');
    }
    return updated;
  },

  async getActiveKeyId() {
    const r = await chrome.storage.local.get('activeKeyId');
    return r.activeKeyId || '';
  },

  async setActiveKeyId(id) {
    await chrome.storage.local.set({ activeKeyId: id });
  },

  async getActiveKey() {
    const keys = await this.getApiKeys();
    if (keys.length === 0) return '';
    const activeId = await this.getActiveKeyId();
    const found    = keys.find(k => k.id === activeId);
    return found ? found.key : keys[0].key;
  },

  // ═══════════════════════════════════════════════
  // PROJECTS
  // ═══════════════════════════════════════════════

  async getAllProjects() {
    const r = await chrome.storage.local.get('projects');
    return r.projects || {};
  },

  async getProject(name) {
    const projects = await this.getAllProjects();
    return projects[name] || null;
  },

  async createProject(name) {
    const projects = await this.getAllProjects();
    if (projects[name]) return;
    projects[name] = {
      createdAt:  new Date().toISOString(),
      robotFiles: { 'variables.robot': '', 'keywords.robot': '', 'tests.robot': '' }
      // csvText: ''
    };
    await chrome.storage.local.set({ projects });
  },

  async deleteProject(name) {
    const projects = await this.getAllProjects();
    delete projects[name];
    await chrome.storage.local.set({ projects });
  },

  async renameProject(oldName, newName) {
    const projects = await this.getAllProjects();
    if (!projects[oldName] || projects[newName]) return false;
    projects[newName] = { ...projects[oldName] };
    delete projects[oldName];
    await chrome.storage.local.set({ projects });
    return true;
  },

  // ═══════════════════════════════════════════════
  // ROBOT FILES
  // ═══════════════════════════════════════════════

  async getRobotFiles(projectName) {
    const project = await this.getProject(projectName);
    if (!project) return {};
    return project.robotFiles || {};
  },

  async saveRobotFiles(projectName, files) {
    const projects = await this.getAllProjects();
    if (!projects[projectName]) return;
    projects[projectName].robotFiles = { ...projects[projectName].robotFiles, ...files };
    projects[projectName].lastUpdated = new Date().toISOString();
    await chrome.storage.local.set({ projects });
  },

  async clearRobotFiles(projectName) {
    const projects = await this.getAllProjects();
    if (!projects[projectName]) return;
    projects[projectName].robotFiles = { 'variables.robot': '', 'keywords.robot': '', 'tests.robot': '' };
    await chrome.storage.local.set({ projects });
  },

  // ═══════════════════════════════════════════════
  // CSV
  // ═══════════════════════════════════════════════

  // async getCsv(projectName) {
  //   const project = await this.getProject(projectName);
  //   return project ? (project.csvText || '') : '';
  // },

  // async saveCsv(projectName, csvText) {
  //   const projects = await this.getAllProjects();
  //   if (!projects[projectName]) return;
  //   projects[projectName].csvText = csvText;
  //   await chrome.storage.local.set({ projects });
  // },

  // ═══════════════════════════════════════════════
  // ACTIVE PROJECT
  // ═══════════════════════════════════════════════

  async getActiveProject() {
    const r = await chrome.storage.local.get('activeProject');
    return r.activeProject || '';
  },

  async setActiveProject(name) {
    await chrome.storage.local.set({ activeProject: name });
  },

  // ═══════════════════════════════════════════════
  // STORAGE USAGE
  // ═══════════════════════════════════════════════

  async getUsageKb() {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return (bytes / 1024).toFixed(1);
  }
};