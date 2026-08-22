' 毎週金曜のKPI自動記録→Notion＋LINE通知（タスクスケジューラ用・黒窓なし）
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\jupit\workspace\carshop\tools\line-harness-seed\weekly-kpi-notion.mjs""", 0, False
' 朝ルーティン便（毎朝5:30のリマインド）は2026-08-22に停止。carshop側の生成スクリプト
' (morning-routine-push.mjs) は削除済みなので、ここから新しい予約が積まれることはない。
