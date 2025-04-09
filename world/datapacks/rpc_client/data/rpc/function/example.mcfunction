function rpc:notify {method: ping, params: {}}
function rpc:notify {method: chat, params: {message: "Hello from Minecraft!"}}
function rpc:request {method: sum, params: {a: 1, b: 2}, callback: "rpc:my_callback"}
