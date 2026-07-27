' notify-owner.mjs を黒窓なしで実行するラッパー（タスクスケジューラ用）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\jupit\workspace\carshop\tools\line-harness-seed\notify-owner.mjs""", 0, False
