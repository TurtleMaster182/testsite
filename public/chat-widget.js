// Chat widget logic. Include this + chat-widget.css on any page you want the bot on.
// EDIT the API_URL below once you know your Vercel deployment URL.

(function () {
  const API_URL = "/api/chat"; // if hosted on the same Vercel project, this works as-is

  const state = {
    open: false,
    pending: false,
    messages: [], // { role: 'user' | 'assistant', content: string }
  };

  // --- Build DOM ---
  const button = document.createElement("button");
  button.id = "ftc-chat-button";
  button.setAttribute("aria-label", "Open chat");
  button.textContent = "💬";
  document.body.appendChild(button);

  const panel = document.createElement("div");
  panel.id = "ftc-chat-panel";
  panel.innerHTML = `
    <div id="ftc-chat-header">
      <span>Team Q&A Bot</span>
      <button id="ftc-chat-close" aria-label="Close chat">✕</button>
    </div>
    <div id="ftc-chat-messages"></div>
    <div id="ftc-chat-input-row">
      <textarea id="ftc-chat-input" rows="1" placeholder="Ask a question..."></textarea>
      <button id="ftc-chat-send">Send</button>
    </div>
  `;
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector("#ftc-chat-messages");
  const inputEl = panel.querySelector("#ftc-chat-input");
  const sendBtn = panel.querySelector("#ftc-chat-send");
  const closeBtn = panel.querySelector("#ftc-chat-close");

  inputEl.maxLength = 2000;
  inputEl.setAttribute("aria-label", "Chat message");

  // Greeting
  addMessage("bot", "Hi! Ask me anything about our team — meetings, joining, sponsors, etc.");

  button.addEventListener("click", () => {
    state.open = !state.open;
    panel.classList.toggle("open", state.open);
    if (state.open) inputEl.focus();
  });
  closeBtn.addEventListener("click", () => {
    state.open = false;
    panel.classList.remove("open");
  });

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = "ftc-msg " + (role === "user" ? "user" : "bot");
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function sendMessage() {
    if (state.pending) return;
    const text = inputEl.value.trim();
    if (!text || text.length > 2000) return;
    state.pending = true;

    inputEl.value = "";
    sendBtn.disabled = true;
    inputEl.disabled = true;

    // Add user message to UI and history
    addMessage("user", text);
    state.messages.push({ role: "user", content: text });
    // Bound transmitted history as well as server-side context.
    state.messages = state.messages.slice(-10);
    while (state.messages.reduce((sum, msg) => sum + msg.content.length, 0) > 8000) state.messages.shift();
    while (messagesEl.children.length > 60) messagesEl.firstElementChild.remove();

    // Create empty bot message container with typing state
    const botMsgEl = addMessage("bot", "");
    botMsgEl.classList.add("typing");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let reader;
    try {
      const res = await fetch(API_URL, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: state.messages }),
      });

      if (!res.ok) {
        // The server returns a JSON body describing what actually went
        // wrong (rate limited, misconfigured, upstream down, timed out,
        // etc.) — read it so the user sees the real reason instead of one
        // generic message every time.
        let serverMessage = "";
        try {
          const errBody = await res.json();
          serverMessage = errBody && errBody.error ? errBody.error : "";
        } catch (_) {
          // Body wasn't JSON (or was empty) — fall back below.
        }
        throw new Error(serverMessage || `Request failed (HTTP ${res.status})`);
      }

      botMsgEl.classList.remove("typing");

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let buffer = "";

      // Stream processing loop.
      // Server sends clean single-line events: "data: {\"text\":\"...\"}\n\n"
      // (or "data: [DONE]\n\n" as a sentinel), so we split on the blank-line
      // event separator rather than on individual "\n" characters.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let sepIndex;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);

          const line = rawEvent.trim();
          if (!line.startsWith("data: ")) continue;

          const rawData = line.slice(6).trim();
          if (rawData === "[DONE]") continue;

          let parsed;
          try { parsed = JSON.parse(rawData); } catch { continue; }
          if (parsed.error) throw new Error('The response was interrupted. Please try again.');
          const textChunk = typeof parsed.text === 'string' ? parsed.text : '';
          if (fullReply.length + textChunk.length > 16000) throw new Error('Response exceeded the size limit.');
          if (textChunk) {
            fullReply += textChunk;
            botMsgEl.textContent = fullReply;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        }
      }

      // Commit finalized message to chat history state
      if (fullReply) {
        state.messages.push({ role: "assistant", content: fullReply.slice(0, 2000) });
      } else {
        botMsgEl.textContent = "Sorry, no response generated.";
      }
    } catch (err) {
      botMsgEl.classList.remove("typing");
      // Show the specific reason when we have one (from the server's JSON
      // error body above); otherwise fall back to a generic message.
      botMsgEl.textContent = err && err.message
        ? err.message
        : "Sorry, something went wrong. Please try again later.";

    } finally {
      clearTimeout(timeout);
      controller.abort();
      if (reader) { void reader.cancel().catch(() => {}); }
      state.pending = false;
      inputEl.disabled = false;
      sendBtn.disabled = false;
    }
  }
})();