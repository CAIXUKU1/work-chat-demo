const appShell = document.querySelector("#appShell");
const messageArea = document.querySelector("#messageArea");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const searchInput = document.querySelector("#searchInput");
const conversationList = document.querySelector("#conversationList");
const chatName = document.querySelector("#chatName");
const detailPanel = document.querySelector("#detailPanel");
const toast = document.querySelector("#toast");
const typingIndicator = document.querySelector("#typingIndicator");
const workDashboard = document.querySelector("#workDashboard");
const joinOverlay = document.querySelector("#joinOverlay");
const joinForm = document.querySelector("#joinForm");
const nicknameInput = document.querySelector("#nicknameInput");
const roomInput = document.querySelector("#roomInput");
const roomLabel = document.querySelector("#roomLabel");
const connectionStatus = document.querySelector("#connectionStatus");

const SUPABASE_URL = "https://dmvhvpfofhffnarsxawo.supabase.co";
const SUPABASE_KEY = "sb_publishable_bPysTv46R2Xh_u83z8rUMA_tEB_cYO2";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let toastTimer;
let activeRoom = "";
let nickname = "";
let messageChannel;
let sending = false;
const clientId = localStorage.getItem("workChatClientId") || crypto.randomUUID();
localStorage.setItem("workChatClientId", clientId);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function formatTime() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function renderRealtimeMessage(message) {
  if (document.querySelector(`[data-message-id="${message.id}"]`)) return;

  document.querySelector(".empty-room")?.remove();
  const isMine = message.client_id === clientId;
  const article = document.createElement("article");
  article.className = `message-row${isMine ? " mine" : ""}`;
  article.dataset.messageId = message.id;

  if (!isMine) {
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-blue small";
    avatar.textContent = message.sender.slice(0, 1);
    article.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  if (!isMine) {
    const sender = document.createElement("strong");
    sender.textContent = message.sender;
    meta.appendChild(sender);
  }
  const time = document.createElement("time");
  time.textContent = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(message.created_at));
  meta.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content;
  content.append(meta, bubble);
  article.appendChild(content);
  messageArea.appendChild(article);
  messageArea.scrollTo({ top: messageArea.scrollHeight, behavior: "smooth" });
}

async function sendMessage(text = messageInput.value) {
  const cleanText = text.trim();
  if (!cleanText || !activeRoom || sending) return;

  sending = true;
  sendButton.disabled = true;
  const { error } = await db.from("messages").insert({
    room: activeRoom,
    sender: nickname,
    content: cleanText,
    client_id: clientId,
  });
  sending = false;
  sendButton.disabled = false;

  if (error) {
    showToast("发送失败，请检查网络后重试");
    return;
  }

  messageInput.value = "";
  messageInput.style.height = "auto";
}

sendButton.addEventListener("click", () => sendMessage());

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 100)}px`;
});

document.querySelectorAll(".quick-replies button").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.textContent));
});

async function enterRoom(room, name) {
  activeRoom = room.trim().toLowerCase();
  nickname = name.trim();
  localStorage.setItem("workChatRoom", activeRoom);
  localStorage.setItem("workChatNickname", nickname);
  roomLabel.textContent = activeRoom;
  chatName.textContent = "实时聊天室";
  connectionStatus.textContent = "正在连接";

  messageArea.querySelectorAll(".message-row, .typing").forEach((item) => item.remove());
  if (!messageArea.querySelector(".empty-room")) {
    const empty = document.createElement("div");
    empty.className = "empty-room";
    empty.textContent = "这里还没有消息，先打个招呼吧";
    messageArea.appendChild(empty);
  }

  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("room", activeRoom)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    connectionStatus.textContent = "连接失败";
    showToast("无法连接聊天室");
    return;
  }

  data.forEach(renderRealtimeMessage);
  if (messageChannel) await db.removeChannel(messageChannel);

  messageChannel = db
    .channel(`room:${activeRoom}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${activeRoom}` },
      (payload) => renderRealtimeMessage(payload.new),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        connectionStatus.textContent = "实时在线";
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        connectionStatus.textContent = "连接不稳定";
      }
    });

  joinOverlay.classList.add("closed");
  location.hash = encodeURIComponent(activeRoom);
  messageInput.focus();
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  enterRoom(roomInput.value, nicknameInput.value);
});

const storedName = localStorage.getItem("workChatNickname") || "";
const storedRoom =
  decodeURIComponent(location.hash.slice(1))
  || localStorage.getItem("workChatRoom")
  || "";
nicknameInput.value = storedName;
roomInput.value = storedRoom;

if (storedName && storedRoom) {
  enterRoom(storedRoom, storedName);
}

conversationList.addEventListener("click", (event) => {
  const conversation = event.target.closest(".conversation");
  if (!conversation) return;

  document.querySelectorAll(".conversation").forEach((item) => item.classList.remove("active"));
  conversation.classList.add("active");
  conversation.dataset.unread = "false";
  const badge = conversation.querySelector(".badge");
  if (badge) badge.remove();

  chatName.textContent = conversation.dataset.name;
  appShell.classList.add("mobile-chat");
  showToast(`已打开与「${conversation.dataset.name}」的会话`);
});

searchInput.addEventListener("input", () => {
  const keyword = searchInput.value.trim().toLowerCase();
  document.querySelectorAll(".conversation").forEach((conversation) => {
    const matches = conversation.dataset.name.toLowerCase().includes(keyword)
      || conversation.textContent.toLowerCase().includes(keyword);
    conversation.classList.toggle("hidden", !matches);
  });
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Escape" && workDashboard.classList.contains("active")) {
    toggleWorkMode(false);
  }
});

document.querySelectorAll(".filter").forEach((filter) => {
  filter.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    filter.classList.add("active");
    const value = filter.dataset.filter;

    document.querySelectorAll(".conversation").forEach((conversation) => {
      const shouldShow =
        value === "all"
        || (value === "unread" && conversation.dataset.unread === "true")
        || (value === "starred" && conversation.dataset.starred === "true");
      conversation.classList.toggle("hidden", !shouldShow);
    });
  });
});

document.querySelector("#quietToggle").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("active");
  const active = event.currentTarget.classList.contains("active");
  showToast(active ? "已开启安静通知" : "已恢复全部通知");
});

document.querySelector("#focusButton").addEventListener("click", (event) => {
  document.body.classList.toggle("focus-mode");
  event.currentTarget.classList.toggle("active");
  showToast(document.body.classList.contains("focus-mode") ? "专注模式已开启" : "专注模式已关闭");
});

document.querySelector("#detailToggle").addEventListener("click", () => {
  appShell.classList.toggle("detail-closed");
});

document.querySelector("#closeDetail").addEventListener("click", () => {
  appShell.classList.add("detail-closed");
});

document.querySelector(".mobile-back").addEventListener("click", () => {
  appShell.classList.remove("mobile-chat");
});

document.querySelector("#newChatButton").addEventListener("click", () => {
  searchInput.focus();
  showToast("输入名字即可发起新会话");
});

document.querySelectorAll(".task input").forEach((input) => {
  input.addEventListener("change", () => {
    input.closest(".task").classList.toggle("done", input.checked);
    const tasks = [...document.querySelectorAll(".task input")];
    const completed = tasks.filter((task) => task.checked).length;
    document.querySelector(".section-heading > span").textContent = `${completed} / ${tasks.length}`;
    document.querySelector(".progress span").style.width = `${(completed / tasks.length) * 100}%`;
  });
});

function toggleWorkMode(show) {
  workDashboard.classList.toggle("active", show);
  workDashboard.setAttribute("aria-hidden", String(!show));
  showToast(show ? "已切换到工作模式，按 Esc 返回" : "已返回聊天");
}

document.querySelector("#workModeButton").addEventListener("click", () => toggleWorkMode(true));
document.querySelector("#exitWorkMode").addEventListener("click", () => toggleWorkMode(false));

function updateCountdown() {
  const now = new Date();
  const target = new Date();
  target.setHours(18, 0, 0, 0);

  if (now > target) {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  }

  const diff = Math.max(0, target - now);
  const hours = String(Math.floor(diff / 3_600_000)).padStart(2, "0");
  const minutes = String(Math.floor((diff % 3_600_000) / 60_000)).padStart(2, "0");
  const seconds = String(Math.floor((diff % 60_000) / 1000)).padStart(2, "0");
  document.querySelector("#countdown").textContent = `${hours}:${minutes}:${seconds}`;
}

updateCountdown();
setInterval(updateCountdown, 1000);
