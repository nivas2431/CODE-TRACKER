// Storage module for Code Tracker

const Storage = {
  async getProblems() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['problems'], (result) => {
        resolve(result.problems || []);
      });
    });
  },

  async saveProblems(problems) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ problems }, resolve);
    });
  },

  async addProblem(problem) {
    const problems = await this.getProblems();
    problem.id = Date.now().toString();
    problem.savedAt = new Date().toISOString();
    problems.unshift(problem);
    await this.saveProblems(problems);
    return problem;
  },

  async updateProblemCode(id, code) {
    const problems = await this.getProblems();
    const idx = problems.findIndex(p => p.id === id);
    if (idx !== -1) {
      problems[idx].code = code;
      problems[idx].codeUpdatedAt = new Date().toISOString();
      await this.saveProblems(problems);
    }
  },

  async deleteProblem(id) {
    const problems = await this.getProblems();
    const filtered = problems.filter(p => p.id !== id);
    await this.saveProblems(filtered);
  },

  async clearAll() {
    await this.saveProblems([]);
  },

  async getStats() {
    const problems = await this.getProblems();
    const stats = {
      total: problems.length,
      byPlatform: {},
      byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
      byTopic: {},
      recentActivity: []
    };

    const platforms = ['LeetCode', 'CodeChef', 'HackerEarth', 'HackerRank'];
    platforms.forEach(p => stats.byPlatform[p] = 0);

    problems.forEach(p => {
      if (stats.byPlatform[p.platform] !== undefined) stats.byPlatform[p.platform]++;
      if (stats.byDifficulty[p.difficulty] !== undefined) stats.byDifficulty[p.difficulty]++;
      if (p.topic) {
        stats.byTopic[p.topic] = (stats.byTopic[p.topic] || 0) + 1;
      }
    });

    // Last 7 days activity
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = problems.filter(p => p.savedAt && p.savedAt.startsWith(dateStr)).length;
      stats.recentActivity.push({ date: dateStr, count });
    }

    return stats;
  }
};
