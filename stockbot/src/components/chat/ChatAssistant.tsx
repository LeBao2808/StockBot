"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, TraceStep } from "@/lib/types";
import { ComparisonTable } from "./ComparisonTable";
import { ToolTrace } from "./ToolTrace";
import { TypewriterText } from "./TypewriterText";

/** Floating assistant panel plus its launcher button. Owns all chat state. */
export function ChatAssistant() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  function scrollChatToBottom(smooth = false) {
    const body = chatBodyRef.current;
    if (body)
      body.scrollTo({
        top: body.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
  }

  function finishStreaming(index: number) {
    setChatMessages((messages) =>
      messages.map((message, i) =>
        i === index ? { ...message, streaming: false } : message,
      ),
    );
    requestAnimationFrame(() => scrollChatToBottom(true));
  }

  useEffect(() => {
    scrollChatToBottom(true);
  }, [chatMessages.length, chatBusy, chatOpen]);

  useEffect(() => {
    if (!chatOpen || !chatFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [chatOpen, chatFullscreen]);

  async function askAssistant(question = chatInput) {
    const prompt = question.trim();
    if (!prompt || chatBusy) return;
    const history = chatMessages
      .slice(-8)
      .map(({ role, text }) => ({ role, content: text }));
    setChatMessages((messages) => [
      ...messages,
      { role: "user", text: prompt },
    ]);
    setChatInput("");
    setChatBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, history }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(data.error || "Trợ lý chưa lấy được dữ liệu."),
          { trace: data.trace as TraceStep[] | undefined },
        );
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text: data.answer,
          comparison: data.comparison,
          trace: data.trace,
          streaming: true,
        },
      ]);
    } catch (error) {
      setChatMessages((messages) => [
        ...messages,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Chưa gọi được API trợ lý.",
          trace: (error as { trace?: TraceStep[] }).trace,
          streaming: true,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <>
      {chatOpen && (
        <section
          className={`chat-panel ${chatFullscreen ? "chat-panel-fullscreen" : ""}`}
          aria-label="Trợ lý Stockmate"
        >
          <header className="chat-header">
            <div className="chat-brand">
              <span className="chat-avatar">✳</span>
              <div>
                <strong>Trợ lý Stockmate</strong>
                <small>
                  <i /> Sẵn sàng hỗ trợ
                </small>
              </div>
            </div>
            <div className="chat-actions">
              <button
                className="chat-expand"
                onClick={() => setChatFullscreen((full) => !full)}
                aria-label={chatFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
                title={chatFullscreen ? "Thu nhỏ (Esc)" : "Toàn màn hình"}
              >
                {chatFullscreen ? "⤡" : "⤢"}
              </button>
              <button
                className="chat-close"
                onClick={() => {
                  setChatOpen(false);
                  setChatFullscreen(false);
                }}
                aria-label="Đóng chat"
              >
                ×
              </button>
            </div>
          </header>
          <div className="chat-scope">
            <span>◫</span> Đang xem danh mục của bạn{" "}
            <span className="scope-chevron">⌄</span>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            <div className="chat-welcome">
              <span className="chat-welcome-icon">✳</span>
              <h3>Xin chào, Bảo!</h3>
              <p>Mình có thể giúp bạn hiểu rõ hơn về danh mục đầu tư.</p>
            </div>
            <div className="chat-questions">
              <span className="suggestion-label">THỬ HỎI</span>
              <button
                onClick={() => askAssistant("Mã nào đang lãi nhiều nhất?")}
              >
                Mã nào đang lãi nhiều nhất? <span>↗</span>
              </button>
              <button
                onClick={() => askAssistant("Tóm tắt danh mục của tôi hôm nay")}
              >
                Tóm tắt danh mục hôm nay <span>↗</span>
              </button>
              <button
                onClick={() =>
                  askAssistant(
                    "Tính giá trị hiện tại và lãi/lỗ của danh mục AAPL giúp tôi.",
                  )
                }
              >
                So sánh giá mua và hiện tại AAPL <span>↗</span>
              </button>
            </div>
            {chatMessages.map((message, index) => (
              <div
                className={`chat-message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                <span className="message-avatar">
                  {message.role === "assistant" ? "✳" : "B"}
                </span>
                <div className="chat-message-content">
                  <p>
                    {message.streaming ? (
                      <TypewriterText
                        text={message.text}
                        onTick={scrollChatToBottom}
                        onDone={() => finishStreaming(index)}
                      />
                    ) : (
                      message.text
                    )}
                  </p>
                  {message.comparison && !message.streaming && (
                    <ComparisonTable comparison={message.comparison} />
                  )}
                  {message.trace && !message.streaming && (
                    <ToolTrace trace={message.trace} />
                  )}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="chat-message assistant chat-thinking">
                <span className="message-avatar">✳</span>
                <div className="chat-message-content">
                  <p>
                    <span className="typing-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="thinking-label">
                      Đang kiểm tra dữ liệu danh mục…
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="chat-disclaimer">
            <span>ⓘ</span> Câu trả lời sẽ dựa trên dữ liệu danh mục và giá có
            timestamp.
          </div>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              askAssistant();
            }}
          >
            <textarea
              aria-label="Hỏi về danh mục của bạn"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askAssistant();
                }
              }}
              placeholder="Hỏi về danh mục của bạn…"
              rows={2}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || chatBusy}
              aria-label="Gửi câu hỏi"
            >
              ↑
            </button>
            <small>Enter để gửi · Shift + Enter để xuống dòng</small>
          </form>
        </section>
      )}
      <button
        className={`chat-launcher ${chatOpen ? "chat-launcher-open" : ""} ${chatOpen && chatFullscreen ? "chat-launcher-hidden" : ""}`}
        onClick={() => {
          setChatOpen((open) => !open);
          setChatFullscreen(false);
        }}
        aria-expanded={chatOpen}
      >
        <span className="launcher-symbol">{chatOpen ? "×" : "✳"}</span>
        {chatOpen ? "Đóng trợ lý" : "Hỏi Stockmate"}
      </button>
    </>
  );
}
