# Agent Workbench 离线验证记录

日期：2026-10-23。Python 3.13.5，pytest 9.0.2（当前执行环境）。

## 已执行命令

```bash
PYTHONPATH=. python -m pytest -q
PYTHONPATH=. python -m workbench.eval_runner --dataset evals/golden.jsonl --out evals/reports/offline.json
```

执行结果：**18 tests passed；9/9 离线 Golden Cases 匹配预期结果**。9 个 Case 包含明确预期失败的负面场景，不能将此数字解读为真实模型的 100% 任务成功率。

另外启动了独立本机 HTTP Demo Task Service，完整执行了 init-demo → run --followup（waiting）→ approve → run（completed）→ trace 的端到端 CLI 流程；最终验收通过，事件覆盖模型调用、工具执行、审批和最终完成。

## 离线验证范围

- `FakeModel` 的四类只读/计算/外部读取/文件输出工具闭环。
- SQLite Run/Intent 进度持久化。
- 文件写入成功但工具结果尚未落库时的恢复。
- 外部服务成功执行但响应丢失后的幂等查询和确认。
- 外部结果无法确认时停止为 `needs_review`。
- 未审批时阻止对外创建跟进事项。
- 限定审批参数，并记录被消费的授权。
- 目录越界、异常金额、工具 Scope、任务预算。
- FakeModel 提前声称完成但 Artifact 缺失时验收失败。
- 外部 HTTP 的真实服务端请求和幂等键行为。

## 明确未验证

- 任何真实 LLM（云端或私有 OpenAI-compatible 服务）的在线推理质量。
- 多进程、分布式任务抢占/租约。
- 生产级审批身份、OS 沙箱/TOCTOU 攻击防护。
- 真实 SaaS、正式 MCP Server、生产并发容量、SLA。
- 大样本 Agent Eval 的统计可靠性。

**教学原则**：标准差、真实 Token Usage 和实际模型价格等没有采集的数据应保留 unknown，不生成虚假的评估表。
