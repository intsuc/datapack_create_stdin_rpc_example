data remove storage rpc: message
execute store result storage rpc: id int 1 \
  store result storage rpc: message.id int 1 run \
  scoreboard players add #id rpc 1
$data modify storage rpc: message.method set value $(method)
$data modify storage rpc: message.params set value $(params)
$data modify storage rpc: message.callback set value "$(callback)"
function rpc:write_message with storage rpc:
