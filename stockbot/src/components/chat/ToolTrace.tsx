"use client";

import type { TraceStep } from "@/lib/types";

const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1).replace(".", ",")} s` : `${value} ms`);

function StepRow({ step, index }: { step: TraceStep; index: number }) {
  if (step.kind === "list") {
    return (
      <li className="trace-step">
        <span className="trace-index">{index}</span>
        <div className="trace-body">
          <div className="trace-line">
            <code className="trace-method">tools/list</code>
            <span className="trace-arrow">→</span>
            <span>{step.tools.length} tool từ MCP Server</span>
            <span className="trace-ms">{ms(step.ms)}</span>
          </div>
          <div className="trace-chips">
            {step.tools.map((tool) => (
              <code key={tool}>{tool}</code>
            ))}
          </div>
        </div>
      </li>
    );
  }

  if (step.kind === "llm") {
    const answered = step.decision.length === 1 && step.decision[0] === "trả lời";
    return (
      <li className="trace-step">
        <span className="trace-index">{index}</span>
        <div className="trace-body">
          <div className="trace-line">
            <span className="trace-actor">Gemini</span>
            <span className="trace-arrow">→</span>
            <span>{answered ? "viết câu trả lời" : `chọn ${step.decision.join(", ")}`}</span>
            <span className="trace-ms">{ms(step.ms)}</span>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className={`trace-step ${step.ok ? "" : "trace-failed"}`}>
      <span className="trace-index">{index}</span>
      <div className="trace-body">
        <div className="trace-line">
          <code className="trace-method">tools/call</code>
          <code className="trace-tool">{step.name}</code>
          <span className="trace-ms">
            {step.ok ? "" : "lỗi · "}
            {ms(step.ms)}
          </span>
        </div>
        <div className="trace-label">tham số</div>
        <pre>{JSON.stringify(step.args)}</pre>
        <div className="trace-label">kết quả từ MCP</div>
        {step.redacted ? (
          <p className="trace-redacted">🔒 Dữ liệu tài khoản cá nhân — ẩn trong trace và không gửi cho Gemini.</p>
        ) : (
          <pre>{step.result}</pre>
        )}
      </div>
    </li>
  );
}

/** Collapsible record of the MCP requests and LLM rounds behind one answer. */
export function ToolTrace({ trace }: { trace: TraceStep[] }) {
  if (!trace.length) return null;
  const calls = trace.filter((step) => step.kind === "call").length;
  const total = trace.reduce((sum, step) => sum + step.ms, 0);
  return (
    <details className="tool-trace">
      <summary>
        <span className="trace-badge">MCP</span>
        {calls ? `${calls} tool call` : "không gọi tool"} · {trace.length} bước · {ms(total)}
      </summary>
      <ol>
        {trace.map((step, index) => (
          <StepRow key={index} step={step} index={index + 1} />
        ))}
      </ol>
    </details>
  );
}
