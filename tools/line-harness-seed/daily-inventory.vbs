' 在庫カルーセルの毎朝自動更新（タスクスケジューラ用・黒窓なし）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\jupit\workspace\carshop\tools\line-harness-seed\update-inventory.mjs""", 0, False
