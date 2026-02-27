class ValidationError extends Error {
  /**
   * @param {import('../schema/types').ValidationIssue[]} issues
   */
  constructor(issues) {
    const message = ValidationError.formatIssues(issues);
    super(message);
    this.name = 'ValidationError';
    this.issues = issues;
  }

  static formatIssue(issue) {
    return `[${issue.code}] ${issue.path}: ${issue.message} Hint: ${issue.hint}`;
  }

  static formatIssues(issues) {
    const lines = ['Game definition validation failed:'];
    issues.forEach((issue, idx) => {
      lines.push(`${idx + 1}. ${ValidationError.formatIssue(issue)}`);
    });

    return lines.join('\n');
  }
}

module.exports = {
  ValidationError,
};
