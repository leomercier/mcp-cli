import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const term = new Terminal({
  cursorBlink: true,
  theme: {
    background: "#1e1e1e",
    foreground: "#f0f0f0",
    cursor: "#f0f0f0",
    selectionBackground: "#565656"
  },
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  lineHeight: 1.2,
  scrollback: 5000,
  cursorStyle: "block"
});

// Add addons
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.loadAddon(new WebLinksAddon());

term.open(document.getElementById("terminal-container"));
fitAddon.fit();
term.focus();

// Handle window resize
window.addEventListener("resize", () => {
  fitAddon.fit();
});

// Clear button functionality
document.getElementById("clear-btn").addEventListener("click", () => {
  term.clear();
});

let ws;
let commandBuffer = "";
let commandHistory = [];
let historyPosition = -1;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    term.writeln("\r\nConnected to VM terminal");
    term.write("\r\n$ ");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "output") {
      term.write(data.content);
      if (!data.content.endsWith("\n")) {
        term.write("\r\n");
      }
      term.write("$ ");
    }
  };

  ws.onclose = () => {
    term.writeln("\r\nConnection lost. Reconnecting...");
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    term.writeln("\r\nConnection error. Please try again.");
  };
}

function clearCurrentLine() {
  const currentLine = commandBuffer;
  for (let i = 0; i < currentLine.length; i++) {
    term.write("\b \b");
  }
  return currentLine;
}

term.onKey(({ key, domEvent }) => {
  const printable =
    !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;

  if (domEvent.keyCode === 13) {
    // Enter key
    term.write("\r\n");

    if (commandBuffer.trim() !== "") {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "command",
            command: commandBuffer
          })
        );

        // Add to history if not duplicate
        if (
          commandHistory.length === 0 ||
          commandHistory[commandHistory.length - 1] !== commandBuffer
        ) {
          commandHistory.push(commandBuffer);
        }
        historyPosition = -1;
      } else {
        term.writeln("Not connected to the server.");
        term.write("$ ");
      }
    } else {
      term.write("$ ");
    }

    commandBuffer = "";
  } else if (domEvent.keyCode === 8) {
    // Backspace
    if (commandBuffer.length > 0) {
      commandBuffer = commandBuffer.slice(0, -1);
      term.write("\b \b");
    }
  } else if (domEvent.keyCode === 38) {
    // Up arrow - History previous
    if (commandHistory.length > 0) {
      if (historyPosition === -1) {
        historyPosition = commandHistory.length - 1;
      } else if (historyPosition > 0) {
        historyPosition--;
      }

      clearCurrentLine();
      commandBuffer = commandHistory[historyPosition];
      term.write(commandBuffer);
    }
  } else if (domEvent.keyCode === 40) {
    // Down arrow - History next
    if (historyPosition !== -1) {
      if (historyPosition < commandHistory.length - 1) {
        historyPosition++;
        clearCurrentLine();
        commandBuffer = commandHistory[historyPosition];
        term.write(commandBuffer);
      } else {
        historyPosition = -1;
        clearCurrentLine();
        commandBuffer = "";
      }
    }
  } else if (domEvent.ctrlKey && key.toLowerCase() === "c") {
    // Ctrl+C
    term.write("^C\r\n$ ");
    commandBuffer = "";
  } else if (domEvent.ctrlKey && key.toLowerCase() === "l") {
    // Ctrl+L (clear)
    term.clear();
    term.write("$ " + commandBuffer);
  } else if (printable) {
    commandBuffer += key;
    term.write(key);
  }
});

window.addEventListener("load", connectWebSocket);