// Chat widget logic. Include this + chat-widget.css on any page you want the bot on.
// EDIT the API_URL below once you know your Vercel deployment URL.

(function () {
  const API_URL = "/api/chat"; // if hosted on the same Vercel project, this works as-is

  const state = {
    open: false,
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
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = "";
    sendBtn.disabled = true;

    // Add user message to UI and history
    addMessage("user", text);
    state.messages.push({ role: "user", content: text });

    // Create empty bot message container with typing state
    const botMsgEl = addMessage("bot", "");
    botMsgEl.classList.add("typing");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: state.messages }),
      });

      if (!res.ok) throw new Error("Request failed");

      botMsgEl.classList.remove("typing");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      let buffer = "";

      // Stream processing loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode incoming raw chunk into string buffer
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        
        // Preserve incomplete tail ends across stream chunks
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const rawJson = trimmed.slice(6);
            try {
              const parsed = JSON.parse(rawJson);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
              
              fullReply += textChunk;
              botMsgEl.textContent = fullReply;
              messagesEl.scrollTop = messagesEl.scrollHeight;
            } catch (e) {
              // Ignore partial line parses
            }
          }
        }
      }

      // Commit finalized message to chat history state
      if (fullReply) {
        state.messages.push({ role: "assistant", content: fullReply });
      } else {
        botMsgEl.textContent = "Sorry, no response generated.";
      }
    } catch (err) {
      botMsgEl.classList.remove("typing");
      botMsgEl.textContent = "Sorry, something went wrong. Please try again later.";
      console.error(err);
    } finally {
      sendBtn.disabled = false;
    }
  }
})();