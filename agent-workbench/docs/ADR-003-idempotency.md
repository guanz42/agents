# ADR-003｜工具副作用、Checkpoint 与确认

**状态**：采用单 Worker 教学边界，生产扩展待实现。

**决策**：在调用工具前持久化 ToolIntent；已完成 ToolResult 不重复执行；本地文件按内容复用，外部写操作必须使用稳定幂等键，并可按键查询已提交结果。对于不能确认的操作停止自动重试并返回 needs_review。

**不能承诺的事**：本地 SQLite Checkpoint 与任意远端服务没有全局原子事务，不能仅凭重试和超时实现通用 Exactly-once。

**风险**：DemoConnector 只允许 localhost，CLI 审批无真实身份认证，Run 无跨进程租约。因此不得直接迁移到真实企业系统。

**故障验证**：`test_write_then_crash_recovers_exact_artifact`、`test_followup_lost_reply_confirmed_on_resume`、`test_followup_unknown_stays_needs_review`。
