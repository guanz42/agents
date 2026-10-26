# ADR-002｜Multi-Agent 不是默认架构

**状态**：默认单 Agent，Multi-Agent 为可验证实验。

**问题**：是否把每份文档和 CSV 都交由独立 Agent？

**决定**：产品主线使用单 Agent + Tool Registry + Harness。只有任务被证实可以并行、成功率或延迟改善且成本可接受，才引入 Supervisor/Worker 编排。

**原因**：短任务依赖小，多个模型上下文带来 Token/通信/失败收敛成本。比较必须在相同数据集、模型、工具、预算下进行。

**代码边界**：`orchestration.py` 当前仅为 DAG 分层和异步 Worker 教学实现，**不能宣称已经完成模型驱动的多 Agent 实验**。完成度留待 W11–W12 项目作业实测。
