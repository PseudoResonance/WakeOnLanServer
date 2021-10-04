function processJson(json) {
	try {
		const msgObj = JSON.parse(json);
		if (msgObj.type === 0) {
			const jsonObj = msgObj.data;
			const tableObj = document.getElementById("device-table");
			const tableRows = tableObj.children[0].children;
			const currentRows = [];
			const newRows = [];
			for (let i = 1; i < tableRows.length; i++) {
				try {
					currentRows.push(tableRows[i].children[0].innerText);
				} catch (err) {
					console.error(err);
					currentRows.push(null);
				}
			}
			for (let i = 0; i < jsonObj.length; i++) {
				try {
					const obj = jsonObj[i];
					const tableIndex = currentRows.findIndex(elem => elem === obj.name);
					if (tableIndex >= 0) {
						if (obj.status === 2) {
							tableRows[tableIndex + 1].children[1].innerText = "Starting";
							tableRows[tableIndex + 1].children[1].className = "device-status starting";
							tableRows[tableIndex + 1].children[2].children[0].disabled = true;
						} else if (obj.status === 1) {
							tableRows[tableIndex + 1].children[1].innerText = "Online";
							tableRows[tableIndex + 1].children[1].className = "device-status online";
							tableRows[tableIndex + 1].children[2].children[0].disabled = true;
						} else if (obj.status === 0) {
							tableRows[tableIndex + 1].children[1].innerText = "Offline";
							tableRows[tableIndex + 1].children[1].className = "device-status offline";
							tableRows[tableIndex + 1].children[2].children[0].disabled = false;
						} else if (obj.status === -1) {
							tableRows[tableIndex + 1].children[1].innerText = "Unknown";
							tableRows[tableIndex + 1].children[1].className = "device-status unknown";
							tableRows[tableIndex + 1].children[2].children[0].disabled = false;
						}
						currentRows[tableIndex] = null;
					} else {
						newRows.push(obj);
						currentRows[tableIndex] = null;
					}
				} catch (err) {
					console.error(err);
				}
			}
			for (let i = currentRows.length - 1; i >= 0; i--) {
				if (currentRows[i] !== null) {
					tableObj.children[0].removeChild(tableRows[i + 1]);
				}
			}
			for (let i = 0; i < newRows.length; i++) {
				tableObj.children[0].appendChild(newRow(newRows[i]));
			}
		} else if (msgObj.type === 1) {
			const newDiv = document.createElement('div');
			newDiv.textContent = "Waking " + msgObj.data;
			const notificationObj = document.getElementById("notifications");
			notificationObj.appendChild(newDiv);
			const tableObj = document.getElementById("device-table");
			const tableRows = tableObj.children[0].children;
			for (let i = 1; i < tableRows.length; i++) {
				if (tableRows[i].children[0].innerText === msgObj.data) {
					tableRows[i].children[1].innerText = "Starting";
					tableRows[i].children[1].className = "device-status starting";
				}
			}
			setTimeout(() => {notificationObj.removeChild(newDiv)}, 5000);
		}
	} catch (err) {
		console.error(err);
	}
}

function newRow(obj) {
    const template = document.createElement('template');
	let status = "";
	let statusClass = "";
	let buttonDisabled = false;
	if (obj.status === 2) {
		status = "Starting";
		statusClass = "starting";
		buttonDisabled = true;
	} else if (obj.status === 1) {
		status = "Online";
		statusClass = "online";
		buttonDisabled = true;
	} else if (obj.status === 0) {
		status = "Offline";
		statusClass = "offline";
		buttonDisabled = false;
	} else if (obj.status === -1) {
		status = "Unknown";
		statusClass = "unknown";
		buttonDisabled = false;
	}
    template.innerHTML = "<tr id='" + obj.name + "'>\n<td class='device-name'>" + obj.name + "</td>\n<td class='device-status " + statusClass + "'>" + status + "</td>\n<td class='device-wake'><button type='button' onclick='sendMessage(\"{\\\"command\\\":1,\\\"name\\\":\\\"" + obj.name + "\\\"}\");' class='wake-button'" + (buttonDisabled ? " disabled" : "") + ">Wake</button></td>\n</tr>";
    return template.content.firstChild;
}

class WebSocketTimeout {
	
	constructor(url, timeout, params = []) {
		this._websocket = new WebSocket(url, params);
		setTimeout(() => {
			if (this._websocket.readyState === 0) {
				this._websocket.close();
			}
		}, timeout);
	}
	
	get websocket() {
		return this._websocket;
	}
	
}

let websocket = null;
let consecutiveReconnectTries = 0;

let connectionInterval = null;
let delay = 0;

function getWebsocket() {
	if (websocket === null) {
		console.log("Opening new websocket to wss://" + window.location.host + "/ws/");
		websocket = new WebSocketTimeout('wss://' + window.location.host + '/ws/', 5000);
		consecutiveReconnectTries++;
		websocket.websocket.onopen = event => {
			const grayOut = document.getElementById("gray-out");
			grayOut.classList.add("hidden");
			consecutiveReconnectTries = 0;
		}
		websocket.websocket.onmessage = event => {
			if (event.isTrusted && event.type === "message") {
				processJson(event.data);
			}
		};
		websocket.websocket.onclose = event => {
			websocket = null;
			console.error("Websocket has closed.");
			const grayOut = document.getElementById("gray-out");
			if (consecutiveReconnectTries < 5) {
				delay = 1;
			} else if (consecutiveReconnectTries < 10) {
				delay = 5;
			} else if (consecutiveReconnectTries < 15) {
				delay = 15;
			} else {
				delay = 30;
			}
			document.getElementById("gray-out-title").innerText = "Reconnecting";
			document.getElementById("gray-out-timer").innerText = "Next attempt in " + delay + " second" + (delay === 1 ? "" : "s") + "...";
			grayOut.classList.remove("hidden");
			connectionInterval = setInterval(() => {document.getElementById("gray-out-timer").innerText = (--delay <= 0 ? "Now" : "Next attempt in " + delay + " second" + (delay === 1 ? "" : "s")+ "...")}, 1000);
			setTimeout(() => {clearInterval(connectionInterval); document.getElementById("gray-out-timer").innerText = "Now"; getWebsocket();}, delay * 1000);
		};
	}
	return websocket;
}

function sendMessage(msg) {
	websocket = getWebsocket();
	if (websocket !== null && websocket.websocket.readyState === 1) {
		websocket.websocket.send(msg);
	}
}