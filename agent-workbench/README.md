# Agent Workbench — 16 周贯穿项目参考工程

> 教学参考（2026-10-23）。目标是把“独立 Demo”变成**同一个真实工作 Agent 的可运行增量项目**。包含离线 FakeModel、可选择的 OpenAI-compatible Chat Completions 适配器、SQLite 持久化、受限工作目录、本地 HTTP 企业任务服务、人工审批、工具执行恢复与离线评估。**不宣称生产级可直接商用。**

## 能完成什么

一次任务同时读取 `input/notes.md`、精确统计 `input/sales.csv`、向本地 HTTP 任务服务查询待办、生成 `artifacts/report.md` 并程序化验收。

选用 `--followup` 时，Agent 还会请求创建一个外部任务，必须由使用者明确审批具体调用后继续。若远端操作已经执行，但响应丢失，运行时会查询稳定幂等键，确认后恢复，不盲目再次创建。若无法确认，停在 `needs_review`。

它是面向“个人工作 Agent/数字员工”的最小真实业务闭环，不是只调用 Python 加法工具。

## 1. 环境

Python >=3.11。离线代码（包括模拟 HTTP 外部系统）只依赖标准库；测试需要 pytest。

```bash
python -m pip install -e '.[dev]'
python -m pytest -q
python -m workbench.eval_runner --dataset evals/golden.jsonl --out evals/reports/offline.json
```

## 2. 先完成一个不需要审批的任务

打开两个终端。

终端 A：

```bash
python -m workbench.cli serve-demo --db workdir/remote.sqlite --port 8765
```

终端 B：

```bash
python -m workbench.cli init-demo workdir/job
python -m workbench.cli run workdir/job --run-id run-01
cat workdir/job/artifacts/report.md
python -m workbench.cli trace workdir/job --run-id run-01
```

预期：CLI 返回 `completed`、`acceptance.passed=true`。报告包含进展、风险、待办、数据来源与 `金额合计：0.30`；Trace 包含 `model.replied/tool.started/tool.completed/run.completed` 等事件。

注意：终端 A 是真实本机 HTTP 服务（与 Agent 进程独立），但不是任何第三方商业服务。这里的 `FakeModel` 是确定性的测试替身，没有“模型智能理解能力”的证明。

## 3. 手动审批实际写操作

```bash
python -m workbench.cli init-demo workdir/approval-job
python -m workbench.cli run workdir/approval-job --run-id run-02 --followup
# 显示 waiting / approval_required
python -m workbench.cli approve workdir/approval-job --run-id run-02 --approver human-owner
# CLI 应显示准确的工具名与参数，确认后才运行上面的 approve 命令
python -m workbench.cli run workdir/approval-job --run-id run-02 --followup
```

流程中的审批是本地 CLI 演示，`--approver` 并没有接入可信身份系统；因此**不能当作企业级审批系统**。真正接入用户身份与审批 UI 时，必须绑定身份、有效期、具体资源、一次性消费和原子更新。

## 4. 模拟崩溃后续做

```bash
python -m workbench.cli init-demo workdir/crash-job
python -m workbench.cli run workdir/crash-job --run-id run-03 --crash-after-effect write_artifact
# 故意抛出 SimulatedCrash：report.md 已经写入，ToolIntent 还未记完成
python -m workbench.cli run workdir/crash-job --run-id run-03
```

第二次应 `completed`，不会因为已有报告而覆盖不同内容。可通过 SQLite 表 `runs/intents/events/approvals` 检查进度。远端创建事项可用测试 `test_followup_lost_reply_confirmed_on_resume` 验证响应丢失与远端幂等查询。

## 5. 接入真实模型：必须明确执行边界

```bash
python -m pip install -e '.[live]'
export OPENAI_API_KEY='YOUR_KEY'
export OPENAI_BASE_URL='https://your-OpenAI-compatible-provider.example/v1'  # 可选
python -m workbench.cli init-demo workdir/live-job
python -m workbench.cli run workdir/live-job --run-id live-01 --live --model YOUR_TOOL_CAPABLE_MODEL
```

真实模型使用 Chat Completions tools 协议，Assistant tool_calls 和 Tool Message 的 `tool_call_id` 由适配器保留。**此实时分支未使用真实供应商完成在线测试**；不同模型可能不按预期规划或生成符合指标的产物。它只能在明确供应商、模型版本和额度后运行，必须另建专门 E2E 测试。

真实模型不允许任意 Shell。工具集仅包含 `read_file/calculate_csv/fetch_tasks/write_artifact/create_followup`，其中对外写入必须审批，工作目录受应用层限制。

## 6. 工程结构

```text
workbench/
  models.py          # Model Adapter: Fake/optional real provider
  state.py           # SQLite runs, checkpoints, intents, approvals, events
  engine.py          # durable Agent Loop / unknown outcome handling
  tools.py           # Tool Registry / schema & scope checks
  workspace.py       # read-only input, create-only artifact, Decimal CSV
  connector.py       # localhost-only HTTP task service client
  demo_service.py    # independent demo task application
  eval.py            # deterministic outcome and side-effect validation
  eval_runner.py     # versioned golden-case offline runner
  orchestration.py   # optional DAG + bounded parallel experiment
  cli.py             # init/run/approve/trace/server CLI
tests/                # offline unit + integration + recovery + policy tests
evals/golden.jsonl     # nine executable golden scenarios (incl negative tests)
evals/reports/         # test evidence
examples/             # sample task fixture
 docs/                # architecture, ADR, test report, roadmap
```

## 7. 能力范围及已知限制

**已实现、已测：** SQLite 上同一 Run 的会话持久化，Tools/Schema/Scope 验证，真实本地 HTTP 服务读取，外部任务写入的稳定幂等键，等待批准并恢复，故障后的相同文件复用，远端结果丢失后查询确认，Report Validator，事件日志，9 个离线 Golden Cases。

**没有实现：** 生产级身份认证、OAuth 或正式 MCP Server；多 Worker 的租约/分布式 CAS；真正的 OS Sandbox 和 TOCTOU 完整防护；独立的成本上报与 OTel exporter；真实模型输出的长时间 E2E 可靠性；支持任意真实 SaaS 系统的连接器；云端高可用、服务级 SLA、正式人工审批 Web UI。

**生产安全提醒：** 仅在隔离测试目录、合成数据及本机演示服务中运行；不要将此教学系统直接连接生产企业资产。`approval` 是教学流程而非真正认证；外部 API 超时不等于失败；不能靠 Python 路径检查构成 OS 沙箱。

## 8. 如何与 16 周教程结合

课程已调整为**单条连续学习路径**：从真实工作问题出发，用最小代码理解机制，然后在同一 Agent Workbench 主工程中完成对应开发和测试。工程实践已经嵌入各章的实现与验证部分，不再设置独立的“第 08 节工程实战”。

W01–W04：模型协议/Runtime/Tools；W05–W06：Context/Checkpoint 与恢复；W07–W10：Workspace/Skills/Progress/Artifact；W11–W12：是否真的需要 Multi-Agent 的受控对照；W13–W14：Golden Task、Trace、效果与性能；W15–W16：审批/安全/整体验收与架构 ADR。

应逐周合并成一个工作项目，不要每章只运行完单独的 `wXX_demo.py` 就结束。

## 9. 参考资料与语义边界

- [OpenAI Chat Completions tools](https://platform.openai.com/docs/api-reference/chat/create)
- [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [MCP specification](https://modelcontextprotocol.io/specification/)
- [OpenTelemetry GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

新版 MCP 协议与 SDK 持续变化。课程以 MCP 为扩展学习项，不将本项目的 HTTP Task API 错称为 MCP。
