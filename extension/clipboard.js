(() => {
  "use strict";
  const K = globalThis.KarasuAuto;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.target !== "clipboard" || message.type !== "clipboard:write") return;
    if (sender.id !== chrome.runtime.id || sender.tab) { respond({ ok: false, reason: "origin" }); return; }
    const command = K.connectCommand(message.command);
    if (!command) { respond({ ok: false, reason: "invalid" }); return; }
    const field = document.getElementById("connect-command");
    try {
      field.value = command;
      field.select();
      // Offscreen documents cannot gain focus. Chrome's clipboard sample uses
      // the selection-based copy command in this context with clipboardWrite.
      const copied = document.execCommand("copy");
      respond({ ok: copied === true, reason: copied ? undefined : "clipboard-failed" });
    } catch { respond({ ok: false, reason: "clipboard-failed" }); }
    finally { field.value = ""; }
  });
})();
