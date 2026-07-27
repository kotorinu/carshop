' 毎週金曜のKPI自動記録→Notion＋LINE通知（タスクスケジューラ用・黒窓なし）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\jupit\workspace\carshop\tools\line-harness-seed\weekly-kpi-notion.mjs""", 0, False
' 朝ルーティン便は秘書AI(line-fastapi-bot)の5:30朝礼に統合済み（2026-07-20）。carshop側からは送らない。
