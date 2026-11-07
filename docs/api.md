# 有据 Agent API

POST `/functions/v1/app`

## ask_life_question

```json
{"action":"agent","tool":"ask_life_question","input":{"question":"房东不退押金怎么办"}}
```

返回 `mode`、`sign`、`expand`、`disclaimer`。医疗、法律、金融只给方向和该找谁。

## get_daily_sign

```json
{"action":"agent","tool":"get_daily_sign","input":{}}
```

## get_book_meta

```json
{"action":"agent","tool":"get_book_meta","input":{}}
```

## 边界

- 急症、自杀倾向、法律程序先分流，不翻签。
- 所有数字与法条必须回指条目；对不上就删。
- 通用口径，不替代医生、律师、会计。
